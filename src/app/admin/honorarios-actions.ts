"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import { ArcaError } from "@/modules/arca/soap";
import { addCharge, chargeLink, generateCharges, markPaid, prepareInvoice, requireBilling, saveBillingSettings, savePlan, sendCharge, voidCharge } from "@/modules/billing/fees";
import { BillingError, deleteAccount, saveAccount } from "@/modules/billing/mp";
import { parseAmount } from "@/modules/bitacora/smart";

// Honorarios del estudio: dueños y contadores; la organización se valida
// contra el estudio de la sesión en cada función del módulo.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const cents = (fd: FormData, k: string) => Math.abs(parseAmount(s(fd, k)) ?? 0);
const H = "/admin/honorarios";

function go(path: string, q: Record<string, string>): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`);
}

async function ctx(back: string) {
  const me = await requireOperator();
  try {
    await requireBilling(me.studioId);
  } catch (e) {
    if (e instanceof BillingError) go(back, { error: e.message });
    throw e;
  }
  return me;
}

async function guard<T>(back: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof BillingError || e instanceof ArcaError) go(back, { error: e.message });
    throw e;
  }
}

export async function savePlanAction(fd: FormData) {
  const back = `${H}/abonos`;
  const me = await ctx(back);
  await guard(back, () => savePlan(me.studioId, me, { id: s(fd, "id") || null, organizationId: s(fd, "org"), concept: s(fd, "concept"), amount: cents(fd, "amount"), startMonth: s(fd, "start"), adjustKind: s(fd, "adjust_kind"), adjustEvery: Number(s(fd, "adjust_every")), adjustPercent: s(fd, "adjust_percent") ? Number(s(fd, "adjust_percent").replace(",", ".")) : null, active: s(fd, "active") !== "0" }));
  revalidatePath(H, "layout");
  go(back, { ok: "Abono guardado." });
}

export async function generateAction(fd: FormData) {
  const me = await ctx(H);
  const n = await guard(H, () => generateCharges(me.studioId, s(fd, "period"), me));
  revalidatePath(H, "layout");
  go(H, { ok: n ? `Generamos ${n} cargo${n === 1 ? "" : "s"}.` : "Los cargos de ese mes ya estaban generados." });
}

export async function addChargeAction(fd: FormData) {
  const me = await ctx(H);
  await guard(H, () => addCharge(me.studioId, me, { organizationId: s(fd, "org"), concept: s(fd, "concept"), amount: cents(fd, "amount"), dueDate: s(fd, "due") }));
  revalidatePath(H, "layout");
  go(H, { ok: "Cargo agregado." });
}

export async function chargeAction(fd: FormData) {
  const me = await ctx(H);
  const id = s(fd, "id");
  const op = s(fd, "op");
  if (op === "factura") {
    const url = await guard(H, () => prepareInvoice(me, id));
    redirect(url);
  }
  if (op === "link") {
    await guard(H, () => chargeLink(me.studioId, id, me));
    revalidatePath(H, "layout");
    go(H, { ok: "Link de pago creado." });
  }
  if (op === "enviar") {
    const r = await guard(H, () => sendCharge(me.studioId, id, me));
    revalidatePath(H, "layout");
    go(H, { ok: `Cobro enviado${r.sentTo ? ` a ${r.sentTo} persona${r.sentTo === 1 ? "" : "s"}` : ""}.` });
  }
  if (op === "pagado") {
    await guard(H, () => markPaid(me.studioId, me, id, s(fd, "method"), cents(fd, "amount") || null));
    revalidatePath(H, "layout");
    go(H, { ok: "Marcado como pagado." });
  }
  await guard(H, () => voidCharge(me.studioId, me, id));
  revalidatePath(H, "layout");
  go(H, { ok: "Cargo anulado." });
}

export async function saveSettingsAction(fd: FormData) {
  const back = `${H}/configuracion`;
  const me = await ctx(back);
  await guard(back, () => saveBillingSettings(me.studioId, me, { issuerOrganizationId: s(fd, "issuer") || null, reminders: fd.get("reminders") === "on", dueDay: Number(s(fd, "due_day")) }));
  go(back, { ok: "Configuración guardada." });
}

export async function saveStudioMpAction(fd: FormData) {
  const back = `${H}/configuracion`;
  const me = await requireOperator();
  if (me.role !== "dueno") go(back, { error: "Solo el dueño del estudio conecta la cuenta de Mercado Pago." });
  await guard(back, () => saveAccount(me.studioId, me, { accessToken: s(fd, "access_token"), publicKey: s(fd, "public_key"), webhookSecret: s(fd, "webhook_secret") }));
  go(back, { ok: "Cuenta de Mercado Pago guardada y probada." });
}

export async function deleteStudioMpAction() {
  const me = await requireOperator();
  if (me.role !== "dueno") go(`${H}/configuracion`, { error: "Solo el dueño del estudio." });
  await deleteAccount(me.studioId, me);
  go(`${H}/configuracion`, { ok: "Cuenta desconectada." });
}
