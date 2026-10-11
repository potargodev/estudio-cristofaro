"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { monotributo_scales } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireFaro } from "@/lib/auth";
import type { ArcaEnv } from "@/modules/arca/config";
import { deleteCredential, loadCredential, recordTest, saveCredential, setActiveEnv } from "@/modules/arca/credentials";
import { ArcaError } from "@/modules/arca/soap";
import { getTicket } from "@/modules/arca/wsaa";
import { feDummy } from "@/modules/arca/wsfe";

// ARCA en el Faro Manager (solo owner): certificado y clave de la CUIT
// operadora (cifrados), ambiente activo, prueba de conexión y escalas de
// monotributo. En la auditoría queda qué se cambió, nunca el certificado.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const env = (v: string): ArcaEnv => (v === "produccion" ? "produccion" : "homologacion");
const back = (path: string, q: Record<string, string>) => redirect(`${path}?${new URLSearchParams(q)}`);
const P = "/faro-manager/arca";

async function fileText(fd: FormData, field: string, textField: string) {
  const f = fd.get(field);
  if (f instanceof File && f.size > 0) {
    if (f.size > 50_000) throw new ArcaError("El archivo es demasiado grande para ser un certificado o una clave.");
    return (await f.text()).trim();
  }
  return s(fd, textField);
}

export async function saveArcaCredentialAction(fd: FormData) {
  const faro = await requireFaro(true);
  const e = env(s(fd, "environment"));
  try {
    const cert = await fileText(fd, "cert_file", "cert");
    const key = await fileText(fd, "key_file", "key");
    const info = await saveCredential(e, s(fd, "cuit").replace(/\D/g, ""), cert, key, faro.id);
    await audit({ studioId: null, actor: faro, action: "faro.arca_certificado", metadata: { ambiente: e, vence: info.notAfter.toISOString().slice(0, 10) } });
  } catch (err) {
    if (err instanceof ArcaError) back(P, { error: err.message });
    throw err;
  }
  revalidatePath(P);
  back(P, { ok: "Certificado guardado (cifrado). Probá la conexión." });
}

export async function deleteArcaCredentialAction(fd: FormData) {
  const faro = await requireFaro(true);
  const e = env(s(fd, "environment"));
  await deleteCredential(e);
  await audit({ studioId: null, actor: faro, action: "faro.arca_certificado_borrado", metadata: { ambiente: e } });
  revalidatePath(P);
  back(P, { ok: "Certificado eliminado." });
}

export async function setArcaEnvAction(fd: FormData) {
  const faro = await requireFaro(true);
  const e = env(s(fd, "environment"));
  await setActiveEnv(e, faro.id);
  await audit({ studioId: null, actor: faro, action: "faro.arca_ambiente", metadata: { ambiente: e } });
  revalidatePath(P);
  back(P, { ok: `Ambiente activo: ${e === "produccion" ? "producción" : "homologación"}.` });
}

/** Prueba: FEDummy (servidores), ticket del WSAA para factura electrónica y para la constancia */
export async function testArcaAction(fd: FormData) {
  await requireFaro();
  const e = env(s(fd, "environment"));
  let detail: string;
  let ok = false;
  try {
    const cred = await loadCredential(e);
    const d = await feDummy(cred);
    await getTicket(cred, "wsfe");
    await getTicket(cred, "ws_sr_constancia_inscripcion");
    ok = d.app === "OK" && d.db === "OK" && d.auth === "OK";
    detail = `Servidores ${d.app}/${d.db}/${d.auth}. Tickets del WSAA para wsfe y constancia: OK.`;
  } catch (err) {
    detail = err instanceof Error ? err.message : "Error desconocido";
  }
  await recordTest(e, ok, detail);
  revalidatePath(P);
  back(P, ok ? { ok: detail } : { error: detail });
}

const MS = "/faro-manager/monotributo";

/** Escala de monotributo: una fila por categoría "letra;tope;superficie;energía;alquiler;cuota servicios;cuota bienes" */
export async function saveScaleAction(fd: FormData) {
  const faro = await requireFaro(true);
  const validFrom = s(fd, "valid_from");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) back(MS, { error: "Falta la fecha de vigencia." });
  const num = (v: string | undefined) => (v && v.trim() !== "" ? Number(v.replace(/\./g, "").replace(",", ".")) : null);
  const categories = s(fd, "categories")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [letter, max, surface, energy, rent, feeS, feeG] = l.split(";");
      return { letter: (letter ?? "").trim().toUpperCase(), maxIncome: num(max) ?? NaN, maxSurfaceM2: num(surface), maxEnergyKw: num(energy), maxRent: num(rent), feeServices: num(feeS), feeGoods: num(feeG), servicesAllowed: true };
    });
  if (!categories.length || categories.some((c) => !/^[A-K]$/.test(c.letter) || !(c.maxIncome > 0))) back(MS, { error: "Revisá las categorías: cada fila «letra;tope anual;…» con letras de la A a la K y topes positivos." });
  const status = s(fd, "status") === "validada" ? "validada" : "a_validar";
  const values = { valid_from: validFrom, status, source: s(fd, "source") || "Faro Manager", notes: s(fd, "notes") || null, categories, updated_by: faro.id, validated_by: status === "validada" ? faro.id : null };
  await getDb().insert(monotributo_scales).values(values).onConflictDoUpdate({ target: monotributo_scales.valid_from, set: values });
  await audit({ studioId: null, actor: faro, action: "faro.monotributo_escala", metadata: { vigencia: validFrom, estado: status, categorias: categories.length } });
  revalidatePath(MS);
  back(MS, { ok: "Escala guardada." });
}

export async function deleteScaleAction(fd: FormData) {
  const faro = await requireFaro(true);
  const id = s(fd, "id");
  if (/^[0-9a-f-]{36}$/i.test(id)) await getDb().delete(monotributo_scales).where(eq(monotributo_scales.id, id));
  await audit({ studioId: null, actor: faro, action: "faro.monotributo_escala_borrada", metadata: { id } });
  revalidatePath(MS);
  back(MS, { ok: "Escala eliminada." });
}
