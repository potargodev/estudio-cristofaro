"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import { studioOrganization } from "@/lib/organizations";
import {
  AccountingError,
  applyTemplate,
  closeYear,
  createEntry,
  depreciationEntry,
  fxRevaluation,
  generateEntries,
  mapAccount,
  registerDrafts,
  registerEntry,
  reopenYear,
  saveAccount,
  saveAsset,
  saveTemplate,
  setLock,
  entryFromTemplate,
  voidEntry,
} from "@/modules/contabilidad/server";
import type { AccountKind } from "@/modules/contabilidad/plan";

// Contabilidad general (A1): dueños y contadores del estudio. La organización
// del formulario se valida contra el estudio de la sesión.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
/** Pesos con coma o punto → centavos */
const cents = (v: string) => {
  const t = v.replace(/\$|\s/g, "");
  if (!t) return 0;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

function go(path: string, q: Record<string, string> = {}): never {
  redirect(Object.keys(q).length ? `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(q)}` : path);
}

async function ctx(fd: FormData) {
  const me = await requireOperator();
  const org = await studioOrganization(s(fd, "org"), me.studioId);
  if (!org) notFound();
  const ver = /^[a-z]{2,12}$/.test(s(fd, "ver")) ? s(fd, "ver") : "asientos";
  return { me, scope: { studioId: me.studioId, organizationId: org.id }, back: `/admin/organizaciones/${org.id}?tab=contabilidad&ver=${ver}` };
}

async function guard<T>(back: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AccountingError) go(back, { error: e.message });
    throw e;
  }
}

const done = (c: Awaited<ReturnType<typeof ctx>>, ok: string): never => {
  revalidatePath(`/admin/organizaciones/${c.scope.organizationId}`);
  go(c.back, { ok });
};

export async function saveAccountAction(fd: FormData) {
  const c = await ctx(fd);
  await guard(c.back, () => saveAccount(c.scope, c.me, { code: s(fd, "code"), name: s(fd, "name"), kind: s(fd, "kind") as AccountKind, imputable: s(fd, "imputable") === "1", monetary: s(fd, "monetary") === "1", currency: s(fd, "currency") }, s(fd, "id") || null));
  done(c, "Cuenta guardada.");
}

export async function mapAccountAction(fd: FormData) {
  const c = await ctx(fd);
  await guard(c.back, () => mapAccount(c.scope, c.me, s(fd, "id"), s(fd, "system"), s(fd, "external")));
  done(c, "Mapeo guardado.");
}

export async function applyTemplateAction(fd: FormData) {
  const c = await ctx(fd);
  await guard(c.back, () => applyTemplate(c.scope, c.me, s(fd, "template")));
  done(c, "Plantilla aplicada: se sumaron las cuentas que faltaban.");
}

export async function createEntryAction(fd: FormData) {
  const c = await ctx(fd);
  const lines: { account: string; code: string; debit: number; credit: number; detail?: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const code = s(fd, `code${i}`);
    const debit = cents(s(fd, `debe${i}`));
    const credit = cents(s(fd, `haber${i}`));
    if (!code && !debit && !credit) continue;
    if (Number.isNaN(debit) || Number.isNaN(credit)) go(c.back, { error: `Revisá los importes de la línea ${i + 1}.` });
    lines.push({ account: code, code, debit, credit, detail: s(fd, `detalle${i}`) || undefined });
  }
  await guard(c.back, () => createEntry(c.scope, c.me, { date: s(fd, "date"), concept: s(fd, "concept"), lines, register: s(fd, "registrar") === "1" }));
  if (s(fd, "modelo")) await guard(c.back, () => saveTemplate(c.scope, c.me, { name: s(fd, "modelo"), concept: s(fd, "concept"), lines: lines.map((l) => ({ code: l.code, side: l.debit ? "debe" : "haber", amount: s(fd, "modelo_importes") === "1" ? l.debit || l.credit : null })) }));
  done(c, s(fd, "registrar") === "1" ? "Asiento registrado." : "Asiento guardado en borrador.");
}

export async function useTemplateAction(fd: FormData) {
  const c = await ctx(fd);
  const amounts: Record<string, number> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("monto_") && typeof v === "string" && v.trim()) amounts[k.slice(6)] = cents(v);
  await guard(c.back, () => entryFromTemplate(c.scope, c.me, s(fd, "id"), s(fd, "date"), amounts));
  done(c, "Asiento del modelo guardado en borrador.");
}

export async function registerEntryAction(fd: FormData) {
  const c = await ctx(fd);
  await guard(c.back, () => registerEntry(c.scope, c.me, s(fd, "id")));
  done(c, "Asiento registrado.");
}

export async function registerDraftsAction(fd: FormData) {
  const c = await ctx(fd);
  const n = await guard(c.back, () => registerDrafts(c.scope, c.me, s(fd, "from"), s(fd, "to")));
  done(c, `${n} ${n === 1 ? "asiento registrado" : "asientos registrados"}.`);
}

export async function voidEntryAction(fd: FormData) {
  const c = await ctx(fd);
  await guard(c.back, () => voidEntry(c.scope, c.me, s(fd, "id")));
  done(c, "Listo: el borrador se borró o el asiento quedó anulado.");
}

export async function generateEntriesAction(fd: FormData) {
  const c = await ctx(fd);
  const r = await guard(c.back, () => generateEntries(c.scope, c.me, s(fd, "from"), s(fd, "to")));
  const n = r.facturas + r.compras + r.sueldos + r.cobros + r.pagos + r.bancos;
  const msg = `${n} ${n === 1 ? "asiento nuevo" : "asientos nuevos"}: ${r.facturas} de facturas, ${r.compras} de compras, ${r.sueldos} de sueldos, ${r.cobros} de cobros, ${r.pagos} de pagos y ${r.bancos} de bancos.`;
  revalidatePath(`/admin/organizaciones/${c.scope.organizationId}`);
  go(c.back, r.errores.length ? { error: `${msg} No se pudieron armar: ${r.errores.slice(0, 3).join(" · ")}` } : { ok: msg });
}

export async function setLockAction(fd: FormData) {
  const c = await ctx(fd);
  await guard(c.back, () => setLock(c.scope, c.me, s(fd, "until") || null));
  done(c, s(fd, "until") ? "Período bloqueado." : "Bloqueo quitado.");
}

export async function saveAssetAction(fd: FormData) {
  const c = await ctx(fd);
  await guard(c.back, () => saveAsset(c.scope, c.me, { name: s(fd, "name"), accountCode: s(fd, "account"), acquiredOn: s(fd, "date"), cost: cents(s(fd, "cost")), residual: cents(s(fd, "residual")), lifeMonths: Number(s(fd, "life")) * (s(fd, "unit") === "anios" ? 12 : 1) }));
  done(c, "Bien de uso guardado.");
}

export async function depreciationAction(fd: FormData) {
  const c = await ctx(fd);
  const row = await guard(c.back, () => depreciationEntry(c.scope, c.me, s(fd, "from"), s(fd, "to")));
  done(c, row ? "Asiento de amortización en borrador." : "Ese período ya tenía su asiento de amortización.");
}

export async function fxAction(fd: FormData) {
  const c = await ctx(fd);
  const n = await guard(c.back, () => fxRevaluation(c.scope, c.me, s(fd, "date"), Number(s(fd, "rate").replace(",", "."))));
  done(c, n ? `${n} ${n === 1 ? "asiento de diferencia de cambio" : "asientos de diferencia de cambio"} en borrador.` : "No hay diferencias de cambio a esa fecha (o ya estaban).");
}

export async function closeYearAction(fd: FormData) {
  const c = await ctx(fd);
  await guard(c.back, () => closeYear(c.scope, c.me, s(fd, "end")));
  done(c, "Ejercicio cerrado: se registraron la refundición, el cierre y la apertura, y el período quedó bloqueado.");
}

export async function reopenYearAction(fd: FormData) {
  const c = await ctx(fd);
  await guard(c.back, () => reopenYear(c.scope, c.me, s(fd, "id"), s(fd, "reason")));
  done(c, "Ejercicio reabierto: se anularon sus asientos de cierre y se desbloqueó.");
}

// ───────────── Ajuste por inflación (A2) ─────────────

export async function inflationAction(fd: FormData) {
  const c = await ctx(fd);
  const { runAdjustment } = await import("@/modules/contabilidad/inflacion-server");
  const r = await guard(c.back, () => runAdjustment(c.scope, c.me, s(fd, "end")));
  done(c, `Asiento de ajuste por inflación en borrador. RECPAM: ${r.recpam > 0 ? "pérdida" : "ganancia"} de $ ${(Math.abs(r.recpam) / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 })}.`);
}

export async function ownIndexesAction(fd: FormData) {
  const c = await ctx(fd);
  const { saveOwnIndexes } = await import("@/modules/contabilidad/inflacion-server");
  const n = await guard(c.back, () => saveOwnIndexes(c.scope, c.me, s(fd, "end"), s(fd, "series")));
  done(c, `${n} ${n === 1 ? "índice cargado" : "índices cargados"} para esta organización.`);
}

export async function classificationAction(fd: FormData) {
  const c = await ctx(fd);
  const { setClassification } = await import("@/modules/contabilidad/inflacion-server");
  const n = await guard(c.back, () => setClassification(c.scope, c.me, new Set(fd.getAll("monetaria").map(String))));
  done(c, n ? `Clasificación guardada (${n} ${n === 1 ? "cambio" : "cambios"}).` : "No había cambios en la clasificación.");
}
