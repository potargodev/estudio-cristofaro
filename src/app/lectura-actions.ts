"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveScope, type Ambito } from "@/modules/smart-docs/scope";
import { confirmDoc, corrections, decisionsFrom, discardDoc, forgetRule, getDoc, readBatch, readExisting, readUpload, SmartDocError, undoLearned } from "@/modules/smart-docs/server";
import { asExtraction } from "@/modules/smart-docs/core";

// Acciones de la lectura inteligente. El alcance se arma con la sesión en
// resolveScope; el ID de la organización del formulario se vuelve a validar.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const ambitoOf = (fd: FormData): Ambito => (["estudio", "personal", "bitacora"].includes(s(fd, "ambito")) ? (s(fd, "ambito") as Ambito) : "bitacora");
function go(path: string, q: Record<string, string> = {}): never {
  redirect(Object.keys(q).length ? `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(q)}` : path);
}

async function guard<T>(back: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SmartDocError) go(back, { error: e.message });
    throw e;
  }
}

export async function readUploadAction(fd: FormData) {
  const r = await resolveScope(ambitoOf(fd), s(fd, "org"));
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) go(r.base, { error: "Elegí el archivo." });
  const d = await guard(r.base, () => readUpload(r.scope, r.actor, file));
  revalidatePath(r.base);
  if (d.status === "error") go(r.base, { error: d.error ?? "No pudimos leer el documento." });
  go(`${r.base}/${d.id}`, { ok: d.duplicate_of ? "Ojo: parece un comprobante que ya estaba." : "Leído. Revisá los datos y confirmá." });
}

/** Leer un documento que ya está en la pestaña Documentos de la organización */
export async function readExistingAction(fd: FormData) {
  const r = await resolveScope("estudio", s(fd, "org"));
  const d = await guard(r.base, () => readExisting(r.scope, r.actor, s(fd, "document")));
  revalidatePath(r.base);
  if (d.status === "error") go(r.base, { error: d.error ?? "No pudimos leer el documento." });
  go(`${r.base}/${d.id}`, { ok: "Leído. Revisá los datos y confirmá." });
}

export async function confirmDocAction(fd: FormData) {
  const r = await resolveScope(ambitoOf(fd), s(fd, "org"));
  const id = s(fd, "id");
  const back = `${r.base}/${id}`;
  const d = await getDoc(r.scope, id);
  if (!d?.extracted) go(r.base, { error: "No encontramos ese documento." });
  const edited = corrections(asExtraction(d.extracted)!, fd);
  const decisions = decisionsFrom(d, edited, fd);
  await guard(back, () => confirmDoc(r.scope, r.actor, id, edited, s(fd, "account") || "Otros gastos", { allowDuplicate: fd.get("allow_duplicate") === "on", decisions }));
  revalidatePath(r.base);
  go(r.base, { ok: r.scope.scope === "bitacora" ? "Confirmado: quedó como gasto en tu Bitácora." : "Confirmado: quedó en los gastos y en la planilla." });
}

export async function discardDocAction(fd: FormData) {
  const r = await resolveScope(ambitoOf(fd), s(fd, "org"));
  await discardDoc(r.scope, r.actor, s(fd, "id"));
  revalidatePath(r.base);
  go(r.base, { ok: "Descartado." });
}

/** Carga masiva: muchos archivos o un ZIP, que se leen en cola */
export async function readBatchAction(fd: FormData) {
  const r = await resolveScope(ambitoOf(fd), s(fd, "org"));
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) go(r.base, { error: "Elegí los archivos o un ZIP." });
  const b = await guard(r.base, () => readBatch(r.scope, r.actor, files));
  revalidatePath(r.base);
  go(r.base, { ok: `En cola: ${b.queued} comprobante${b.queued === 1 ? "" : "s"}${b.skipped ? ` (${b.skipped} salteado${b.skipped === 1 ? "" : "s"}: formato o tamaño)` : ""}. Se leen solos; te quedan en «Para confirmar».` });
}

/** Deshacer lo aprendido del proveedor en este comprobante */
export async function undoLearnedAction(fd: FormData) {
  const r = await resolveScope(ambitoOf(fd), s(fd, "org"));
  const id = s(fd, "id");
  await guard(`${r.base}/${id}`, () => undoLearned(r.scope, r.actor, id));
  revalidatePath(r.base);
  go(`${r.base}/${id}`, { ok: "Listo: volvió a lo que leyó el modelo, sin la regla del proveedor." });
}

/** Olvidar la regla de un proveedor */
export async function forgetRuleAction(fd: FormData) {
  const r = await resolveScope(ambitoOf(fd), s(fd, "org"));
  await guard(r.base, () => forgetRule(r.scope, r.actor, s(fd, "rule")));
  revalidatePath(r.base);
  go(r.base, { ok: "Regla olvidada: deja de proponerse." });
}
