"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { setPrefs } from "@/lib/prefs";
import { ConnectionError, authUrl, decideProposal, disconnect, syncGmail, syncMercadoPago, type Provider } from "@/modules/bitacora/connections";
import { confirmImport, createPreview, discardImport, ImportError, undoImport } from "@/modules/bitacora/imports";
import { addToGoal, applySuggested, archiveGoal, createGoal, PlanningError, saveBudget } from "@/modules/bitacora/planning";
import { addManualRecurring, dismissInsight, setRecurringStatus } from "@/modules/bitacora/recurring";
import { acceptShare, createShare, revokeShare, ShareError } from "@/modules/bitacora/shares";
import { createEntry } from "@/modules/bitacora/server";
import { sharedAccess } from "@/modules/bitacora/shares";
import type { Mapping } from "@/modules/bitacora/smart";
import { parseAmount } from "@/modules/bitacora/smart";

// Acciones de Bitácora (F8). Todo sale del user_id de la sesión; lo
// compartido se valida contra una invitación aceptada y vigente.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const cents = (fd: FormData, k: string) => parseAmount(s(fd, k));

async function me() {
  const u = await getCurrentUser();
  if (!u) redirect("/ingresar");
  if (u.assisted) redirect("/admin");
  return u;
}

function go(path: string, q: Record<string, string>): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`);
}

async function guard<T>(path: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PlanningError || e instanceof ImportError || e instanceof ConnectionError || e instanceof ShareError) go(path, { error: e.message });
    throw e;
  }
}

// Sobres
export async function saveBudgetAction(fd: FormData) {
  const u = await me();
  await guard("/bitacora/presupuesto", () => saveBudget(u.id, s(fd, "category_id"), cents(fd, "amount")));
  revalidatePath("/bitacora", "layout");
  go("/bitacora/presupuesto", { ok: "Sobre guardado." });
}
export async function applySuggestedAction() {
  const u = await me();
  const n = await applySuggested(u.id);
  revalidatePath("/bitacora", "layout");
  go("/bitacora/presupuesto", { ok: n ? `Armamos ${n} sobre${n === 1 ? "" : "s"} con lo que solés gastar. Ajustalos cuando quieras.` : "No había sobres para sugerir." });
}

// Fijos y avisos
export async function recurringAction(fd: FormData) {
  const u = await me();
  const op = s(fd, "op");
  await setRecurringStatus(u.id, s(fd, "id"), op === "confirmar" ? { status: "confirmado" } : op === "descartar" ? { status: "descartado" } : op === "la_uso" ? { stillUsed: true } : { stillUsed: false });
  revalidatePath("/bitacora", "layout");
  go("/bitacora/fijos", { ok: op === "descartar" ? "Listo, no lo contamos como fijo." : "Guardado." });
}
export async function addRecurringAction(fd: FormData) {
  const u = await me();
  await guard("/bitacora/fijos", () => addManualRecurring(u.id, { label: s(fd, "label"), amount: cents(fd, "amount") ?? 0, day: Number(s(fd, "day")), kind: s(fd, "kind") }));
  revalidatePath("/bitacora", "layout");
  go("/bitacora/fijos", { ok: "Gasto fijo agregado: te avisamos antes de que venza." });
}
export async function dismissInsightAction(fd: FormData) {
  const u = await me();
  await dismissInsight(u.id, s(fd, "id"));
  revalidatePath("/bitacora", "layout");
  revalidatePath("/personal");
  go(s(fd, "volver") || "/bitacora", {});
}

// Metas
export async function createGoalAction(fd: FormData) {
  const u = await me();
  await guard("/bitacora/metas", () => createGoal(u.id, u.studioId, { name: s(fd, "name"), kind: s(fd, "kind"), target: cents(fd, "target") ?? 0, deadline: s(fd, "deadline") || null, currency: "ARS" }));
  revalidatePath("/bitacora", "layout");
  go("/bitacora/metas", { ok: "Meta creada." });
}
export async function goalMoveAction(fd: FormData) {
  const u = await me();
  const amount = (cents(fd, "amount") ?? 0) * (s(fd, "op") === "sacar" ? -1 : 1);
  await guard("/bitacora/metas", () => addToGoal(u.id, s(fd, "id"), amount, s(fd, "note") || null));
  revalidatePath("/bitacora", "layout");
  go("/bitacora/metas", { ok: amount > 0 ? "Sumado a la meta." : "Restado de la meta." });
}
export async function archiveGoalAction(fd: FormData) {
  const u = await me();
  await archiveGoal(u.id, s(fd, "id"));
  revalidatePath("/bitacora", "layout");
  go("/bitacora/metas", { ok: "Meta archivada." });
}

// Importación
export async function importUploadAction(fd: FormData) {
  const u = await me();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) go("/bitacora/importar", { error: "Elegí el archivo del resumen." });
  const imp = await guard("/bitacora/importar", () => createPreview(u, file, s(fd, "source") === "mercadopago_csv" ? "mercadopago_csv" : "auto"));
  go(`/bitacora/importar/${imp.id}`, {});
}
const mappingFrom = (fd: FormData): Mapping => {
  const n = (k: string) => (s(fd, k) === "" ? undefined : Number(s(fd, k)));
  return { date: Number(s(fd, "col_date")), description: Number(s(fd, "col_description")), amount: n("col_amount"), debit: n("col_debit"), credit: n("col_credit"), positiveIsExpense: fd.get("positive_is_expense") === "on", skipHeader: fd.get("skip_header") === "on" };
};
export async function importRemapAction(fd: FormData) {
  await me();
  const m = mappingFrom(fd);
  go(`/bitacora/importar/${s(fd, "id")}`, { m: JSON.stringify(m) });
}
export async function importConfirmAction(fd: FormData) {
  const u = await me();
  const chosen = new Set(fd.getAll("row").map(String));
  const r = await guard(`/bitacora/importar/${s(fd, "id")}`, () => confirmImport(u.id, s(fd, "id"), mappingFrom(fd), chosen));
  revalidatePath("/bitacora", "layout");
  go("/bitacora/importar", { ok: `Importamos ${r.imported} movimiento${r.imported === 1 ? "" : "s"}${r.duplicates ? ` y salteamos ${r.duplicates} que ya estaban` : ""}.` });
}
export async function importDiscardAction(fd: FormData) {
  const u = await me();
  await discardImport(u.id, s(fd, "id"));
  go("/bitacora/importar", { ok: "Importación descartada." });
}
export async function importUndoAction(fd: FormData) {
  const u = await me();
  const n = await undoImport(u.id, s(fd, "id"));
  revalidatePath("/bitacora", "layout");
  go("/bitacora/importar", { ok: `Deshicimos la importación (${n} movimiento${n === 1 ? "" : "s"}).` });
}

// Conexiones
export async function connectAction(fd: FormData) {
  const u = await me();
  const p = (s(fd, "provider") === "gmail" ? "gmail" : "mercadopago") as Provider;
  const url = await guard("/bitacora/conexiones", () => authUrl(u, p));
  redirect(url);
}
export async function syncAction(fd: FormData) {
  const u = await me();
  const p = s(fd, "provider");
  const n = await guard("/bitacora/conexiones", () => (p === "gmail" ? syncGmail(u.id) : syncMercadoPago(u.id)));
  revalidatePath("/bitacora", "layout");
  go("/bitacora/conexiones", { ok: p === "gmail" ? (n ? `Encontramos ${n} mail${n === 1 ? "" : "s"} con gastos para revisar.` : "No encontramos mails nuevos con gastos.") : n ? `Trajimos ${n} movimiento${n === 1 ? "" : "s"} de Mercado Pago.` : "No hay movimientos nuevos en Mercado Pago." });
}
export async function disconnectAction(fd: FormData) {
  const u = await me();
  const p = s(fd, "provider") === "gmail" ? "gmail" : "mercadopago";
  await disconnect(u.id, p);
  await audit({ studioId: u.studioId, actor: u, action: "bitacora.desconexion", entityType: "bitacora_conexion", entityId: p, metadata: { proveedor: p } });
  revalidatePath("/bitacora", "layout");
  go("/bitacora/conexiones", { ok: "Desconectado. Los movimientos que ya trajimos quedan en tu Bitácora." });
}
export async function proposalAction(fd: FormData) {
  const u = await me();
  await guard("/bitacora/conexiones", () => decideProposal(u.id, s(fd, "id"), s(fd, "op") === "aceptar", cents(fd, "amount")));
  revalidatePath("/bitacora", "layout");
  go("/bitacora/conexiones", { ok: s(fd, "op") === "aceptar" ? "Cargado en tu Bitácora." : "Descartado." });
}

// Compartir
export async function shareAction(fd: FormData) {
  const u = await me();
  const r = await guard("/bitacora/compartida", () => createShare(u, s(fd, "email"), s(fd, "permission") === "cargar" ? "cargar" : "ver"));
  revalidatePath("/bitacora/compartida");
  go("/bitacora/compartida", { ok: "Invitación enviada.", link: r.link });
}
export async function acceptShareAction(fd: FormData) {
  const u = await me();
  const id = await guard("/bitacora/compartida", () => acceptShare(u, s(fd, "token")));
  revalidatePath("/bitacora/compartida");
  go(`/bitacora/compartida/${id}`, { ok: "Ahora ves esta Bitácora compartida." });
}
export async function revokeShareAction(fd: FormData) {
  const u = await me();
  await revokeShare(u, s(fd, "id"));
  revalidatePath("/bitacora/compartida");
  go("/bitacora/compartida", { ok: "Dejaron de compartir." });
}
/** Cargar un movimiento en la Bitácora compartida (solo con permiso "cargar") */
export async function sharedEntryAction(fd: FormData) {
  const u = await me();
  const share = await sharedAccess(u.id, s(fd, "share"));
  if (!share || share.permission !== "cargar") go("/bitacora/compartida", { error: "No tenés permiso para cargar en esa Bitácora." });
  const amount = cents(fd, "amount");
  if (!amount || amount <= 0 || !s(fd, "description")) go(`/bitacora/compartida/${share.id}`, { error: "Poné qué fue y el monto." });
  await createEntry(share.ownerId, { kind: s(fd, "kind") === "ingreso" ? "ingreso" : "gasto", amount, currency: "ARS", date: s(fd, "date") || new Date().toISOString().slice(0, 10), categoryId: null, description: s(fd, "description"), paymentMethod: null, note: `Cargado por ${u.name}` });
  revalidatePath(`/bitacora/compartida/${share.id}`);
  go(`/bitacora/compartida/${share.id}`, { ok: "Cargado." });
}

/** Resumen semanal del domingo: prendido o apagado */
export async function weeklyPrefAction(fd: FormData) {
  const u = await me();
  const on = s(fd, "on") === "1";
  await setPrefs(u.id, { weeklySummary: on });
  go("/bitacora/fijos", { ok: on ? "Te mandamos el resumen cada domingo." : "Listo, no te mandamos más el resumen del domingo." });
}
