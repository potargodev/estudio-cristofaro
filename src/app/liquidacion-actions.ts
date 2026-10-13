"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolvePayroll } from "@/modules/payroll/scope";
import {
  addNovelty,
  annul,
  approve,
  deleteNovelty,
  duplicate,
  importNovelties,
  liquidate,
  LiquidacionError,
  publish,
  pullPortalNovelties,
  reliquidate,
  saveEmployeePayroll,
  saveSettings,
  type RunKind,
} from "@/modules/liquidacion/server";

// Liquidación de sueldos (§2.q etapa 6). El alcance sale de la sesión
// (resolvePayroll); el ID de organización del formulario se vuelve a validar.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => {
  const v = s(fd, k).replace(/\./g, "").replace(",", ".");
  return v === "" ? null : Number(v);
};

function go(path: string, q: Record<string, string>): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`);
}

const ctx = (fd: FormData) => resolvePayroll(s(fd, "ambito") === "estudio" ? "estudio" : "portal", s(fd, "org"));

async function guard<T>(back: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof LiquidacionError) go(back, { error: e.message });
    throw e;
  }
}

export async function payrollDataAction(fd: FormData) {
  const r = await ctx(fd);
  const id = s(fd, "id");
  const back = `${r.base}/empleado/${id}`;
  await guard(back, () => saveEmployeePayroll(r.scope, r.actor, id, { cctKey: s(fd, "cct_key"), category: s(fd, "category"), basicOverride: num(fd, "basic_override"), hours: num(fd, "hours"), affiliated: fd.get("affiliated") === "on", cbu: s(fd, "cbu") || null, legajo: s(fd, "legajo") || null }));
  revalidatePath(r.base, "layout");
  go(back, { ok: "Datos de liquidación guardados." });
}

export async function payrollSettingsAction(fd: FormData) {
  const r = await ctx(fd);
  const back = `${r.base}/liquidacion?ver=ajustes`;
  await guard(back, () => saveSettings(r.scope, r.actor, { employerKind: s(fd, "employer_kind"), artPct: num(fd, "art_pct") ?? 0, artFixed: num(fd, "art_fixed") ?? 0, lifeInsurance: num(fd, "life_insurance") ?? 0, ownCategories: String(fd.get("own_categories") ?? ""), payPlace: s(fd, "pay_place") || null, lastDeposit: s(fd, "last_deposit") || null }));
  go(back, { ok: "Parámetros guardados." });
}

export async function noveltyAction(fd: FormData) {
  const r = await ctx(fd);
  const period = s(fd, "period");
  const back = `${r.base}/liquidacion?ver=novedades&periodo=${period}`;
  if (fd.get("borrar")) {
    await guard(back, () => deleteNovelty(r.scope, r.actor, s(fd, "borrar")));
    go(back, { ok: "Novedad borrada." });
  }
  await guard(back, () => addNovelty(r.scope, r.actor, { employeeId: s(fd, "employee_id"), period, kind: s(fd, "kind"), quantity: num(fd, "quantity"), amount: num(fd, "amount"), detail: s(fd, "detail") || null }));
  go(back, { ok: "Novedad cargada." });
}

export async function importNoveltiesAction(fd: FormData) {
  const r = await ctx(fd);
  const period = s(fd, "period");
  const back = `${r.base}/liquidacion?ver=novedades&periodo=${period}`;
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) go(back, { error: "Elegí el archivo." });
  const res = await guard(back, () => importNovelties(r.scope, r.actor, period, file as File));
  go(back, res.errors.length ? { error: `Se cargaron ${res.loaded}. Revisá: ${res.errors.slice(0, 4).map((e) => `fila ${e.row}: ${e.error}`).join(" · ")}${res.errors.length > 4 ? "…" : ""}` } : { ok: `Se cargaron ${res.loaded} novedades.` });
}

export async function pullPortalAction(fd: FormData) {
  const r = await ctx(fd);
  const period = s(fd, "period");
  const back = `${r.base}/liquidacion?ver=novedades&periodo=${period}`;
  const n = await guard(back, () => pullPortalNovelties(r.scope, r.actor, period));
  go(back, { ok: n ? `Se trajeron ${n} novedades del portal.` : "No hay novedades nuevas del portal en el período." });
}

export async function liquidateAction(fd: FormData) {
  const r = await ctx(fd);
  const back = `${r.base}/liquidacion`;
  const kind = s(fd, "kind") as RunKind;
  const run = await guard(back, () =>
    liquidate(r.scope, r.actor, { period: s(fd, "period"), kind, payDate: s(fd, "pay_date") || null, final: kind === "final" ? { employeeId: s(fd, "employee_id"), endDate: s(fd, "end_date"), reason: s(fd, "reason"), vacationsTaken: num(fd, "vacations_taken") ?? 0, noticeGiven: fd.get("notice_given") === "on" } : null }),
  );
  go(`${r.base}/liquidacion/${run.id}`, { ok: "Liquidación en borrador: revisala y aprobala." });
}

export async function runAction(fd: FormData) {
  const r = await ctx(fd);
  const id = s(fd, "id");
  const back = `${r.base}/liquidacion/${id}`;
  const op = s(fd, "op");
  if (op === "reliquidar") {
    const changes = await guard(back, () => reliquidate(r.scope, r.actor, id, s(fd, "reason") || null));
    go(back, { ok: changes.length ? `Re-liquidada: ${changes.length} ${changes.length === 1 ? "cambio" : "cambios"} en el registro.` : "Re-liquidada: sin cambios." });
  }
  if (op === "duplicar") {
    const nv = await guard(back, () => duplicate(r.scope, r.actor, id, s(fd, "reason")));
    go(`${r.base}/liquidacion/${nv.id}`, { ok: `Versión ${nv.version} en borrador, con el registro de cambios.` });
  }
  if (op === "aprobar") {
    if (fd.get("confirmo") !== "on") go(back, { error: "Para aprobar, confirmá que revisaste la liquidación." });
    await guard(back, () => approve(r.scope, r.actor, id));
    go(back, { ok: "Liquidación aprobada." });
  }
  if (op === "publicar") {
    const res = await guard(back, () => publish(r.scope, r.actor, id));
    revalidatePath(r.base, "layout");
    go(back, { ok: `Publicamos ${res.published} recibos para la firma.` });
  }
  if (op === "asiento") {
    // El asiento de sueldos es del estudio (contabilidad de la organización)
    if (!r.scope.fromStudio) go(back, { error: "El asiento lo arma el estudio." });
    const { AccountingError, payrollEntry } = await import("@/modules/contabilidad/server");
    let row: Awaited<ReturnType<typeof payrollEntry>> = null;
    try {
      row = await payrollEntry({ studioId: r.scope.studioId, organizationId: r.scope.organizationId }, r.actor, id);
    } catch (e) {
      if (e instanceof AccountingError) go(back, { error: e.message });
      throw e;
    }
    go(`${back}?ver=informes`, { ok: row ? "Asiento de sueldos armado: está en Contabilidad → Asientos." : "El asiento de esta liquidación ya estaba en Contabilidad." });
  }
  if (op === "anular") {
    await guard(back, () => annul(r.scope, r.actor, id));
    go(`${r.base}/liquidacion`, { ok: "Liquidación anulada." });
  }
  go(back, { error: "Acción desconocida." });
}
