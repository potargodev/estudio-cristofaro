"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { approveInbox, discardInbox, importMisComprobantes, inboxAddress, InboxError } from "@/modules/buzon/server";

// Buzón de comprobantes recibidos (§2.p, B8). El estudio sale de la sesión;
// cada comprobante y organización se valida contra ese estudio en el módulo.

const BASE = "/admin/buzon";
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (q: Record<string, string>, back = BASE): never => redirect(`${back}${back.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`);
const back = (fd: FormData) => (s(fd, "back").startsWith(BASE) ? s(fd, "back") : BASE);

export async function inboxAction(fd: FormData) {
  const me = await requireStaff();
  const ids = fd.getAll("ids").map(String);
  if (!ids.length) go({ error: "Elegí al menos un comprobante." }, back(fd));
  if (s(fd, "op") === "descartar") {
    const n = await discardInbox(me.studioId, me, ids);
    revalidatePath(BASE);
    go({ ok: `${n} ${n === 1 ? "comprobante descartado" : "comprobantes descartados"}.` }, back(fd));
  }
  if (me.role === "colaborador") go({ error: "Aprueban el dueño o un contador del estudio." }, back(fd));
  const items = ids.map((id) => ({ id, computable: s(fd, `computa_${id}`) || null, pct: Number(s(fd, `pct_${id}`)) || null }));
  const r = await approveInbox(me.studioId, me, items);
  revalidatePath(BASE);
  go(r.skipped.length ? { ok: `Aprobamos ${r.ok}. Quedaron ${r.skipped.length} para revisar uno por uno: ${[...new Set(r.skipped.map((x) => x.reason))].join(" ")}` } : { ok: `Aprobamos ${r.ok} ${r.ok === 1 ? "comprobante" : "comprobantes"}: ya están en el Libro IVA y la contabilidad.` }, back(fd));
}

export async function inboxAddressAction(fd: FormData) {
  const me = await requireStaff();
  try {
    const address = await inboxAddress(me.studioId, s(fd, "org"), me);
    go({ direccion: address, org: s(fd, "org") });
  } catch (e) {
    if (e instanceof InboxError) go({ error: e.message });
    throw e;
  }
}

export async function arcaImportAction(fd: FormData) {
  const me = await requireStaff();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) go({ error: "Elegí el archivo de Mis Comprobantes." });
  try {
    const r = await importMisComprobantes(me.studioId, me, s(fd, "org"), file as File);
    revalidatePath(BASE);
    go({ ok: `Importamos ${r.created} ${r.created === 1 ? "comprobante" : "comprobantes"} de ARCA${r.repeated ? ` (${r.repeated} ya estaban)` : ""}${r.errors.length ? `. ${r.errors.length} ${r.errors.length === 1 ? "fila no se entendió" : "filas no se entendieron"}` : ""}.`, org: s(fd, "org") });
  } catch (e) {
    if (e instanceof InboxError) go({ error: e.message });
    throw e;
  }
}
