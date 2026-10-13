import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { payroll_items, payroll_runs } from "@/db/schema";
import type { Cell, Report } from "@/lib/export-table";
import { formatDate } from "@/lib/format";
import { cctOf } from "./convenios";
import { LiquidacionError } from "./server";
import type { PayrollScope } from "@/modules/payroll/server";

// Reportes de cierre de sueldos (A3) en Excel y PDF: nómina de empleados,
// conceptos por período, área o convenio, control contra el período anterior
// (con diferencias), acreditación, costo laboral y el asiento de sueldos.
// Importes en pesos (los centavos se dividen acá). Lo usan la ruta de
// descarga, la pantalla de la liquidación y el Agente.

export const PAYROLL_REPORTS = {
  empleados: "Nómina de empleados",
  conceptos: "Conceptos liquidados",
  control: "Control contra el período anterior",
  acreditacion: "Acreditación de haberes",
  costo: "Costo laboral",
  asiento: "Asiento de sueldos",
} as const;
type PayrollReport = keyof typeof PAYROLL_REPORTS;
export const isPayrollReport = (k: string): k is PayrollReport => k in PAYROLL_REPORTS;
export const GROUPS = { periodo: "Período", area: "Área", convenio: "Convenio" } as const;
type Group = keyof typeof GROUPS;

const db = () => getDb();
const $ = (c: number) => Math.round(c) / 100;
const KIND: Record<string, string> = { mensual: "Mensual", sac: "SAC", vacaciones: "Vacaciones", final: "Final" };
type Item = typeof payroll_items.$inferSelect;
const snap = (x: Item) => x.snapshot as Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const area = (x: Item) => str(snap(x).area) || "Sin área";
const convenio = (x: Item) => cctOf(str(snap(x).cctKey))?.name ?? "Sin convenio";
const runLabel = (r: { period: string; kind: string; version: number }) => `${r.period} · ${KIND[r.kind] ?? r.kind}${r.version > 1 ? ` (v${r.version})` : ""}`;

async function runOf(s: PayrollScope, id: string) {
  const [run] = await db().select().from(payroll_runs).where(and(eq(payroll_runs.id, id), eq(payroll_runs.studio_id, s.studioId), eq(payroll_runs.organization_id, s.organizationId)));
  if (!run) throw new LiquidacionError("No encontramos esa liquidación.");
  const items = await db().select().from(payroll_items).where(eq(payroll_items.run_id, run.id)).orderBy(asc(sql`${payroll_items.snapshot}->>'name'`));
  return { run, items };
}

/** Liquidación mensual aprobada anterior a la dada (para el control) */
async function previousOf(s: PayrollScope, run: typeof payroll_runs.$inferSelect) {
  const [prev] = await db()
    .select()
    .from(payroll_runs)
    .where(and(eq(payroll_runs.studio_id, s.studioId), eq(payroll_runs.organization_id, s.organizationId), eq(payroll_runs.kind, run.kind), inArray(payroll_runs.status, ["aprobada", "publicada"]), sql`${payroll_runs.period} < ${run.period}`, ne(payroll_runs.id, run.id)))
    .orderBy(desc(payroll_runs.period))
    .limit(1);
  if (!prev) return null;
  return { run: prev, items: await db().select().from(payroll_items).where(eq(payroll_items.run_id, prev.id)) };
}

/** Control: por empleado (remunerativo, neto y costo) y por concepto, contra el período anterior */
export async function payrollControl(s: PayrollScope, runId: string, threshold = 0.1) {
  const { run, items } = await runOf(s, runId);
  const prev = await previousOf(s, run);
  const prevBy = new Map((prev?.items ?? []).map((x) => [x.employee_id, x]));
  const employees = items.map((x) => {
    const p = prevBy.get(x.employee_id);
    const delta = p && Number(p.net) ? (Number(x.net) - Number(p.net)) / Number(p.net) : null;
    return { name: str(snap(x).name), rem: Number(x.rem), prevRem: p ? Number(p.rem) : null, net: Number(x.net), prevNet: p ? Number(p.net) : null, cost: Number(x.cost), prevCost: p ? Number(p.cost) : null, delta, flag: !p ? "nuevo" : delta !== null && Math.abs(delta) > threshold ? "revisar" : "ok" };
  });
  const gone = (prev?.items ?? []).filter((p) => !items.some((x) => x.employee_id === p.employee_id)).map((p) => str(snap(p).name));
  const concepts = new Map<string, { name: string; kind: string; now: number; before: number }>();
  for (const [list, key] of [[items, "now"], [prev?.items ?? [], "before"]] as const)
    for (const x of list)
      for (const l of x.lines) {
        const c = concepts.get(l.code) ?? { name: l.name, kind: l.kind, now: 0, before: 0 };
        c[key] += l.amount;
        concepts.set(l.code, c);
      }
  return { run, prev: prev?.run ?? null, employees, gone, concepts: [...concepts.entries()].map(([code, c]) => ({ code, ...c, diff: c.now - c.before })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)) };
}

/** Conceptos de las liquidaciones aprobadas entre dos períodos, agrupados por período, área o convenio */
async function payrollConcepts(s: PayrollScope, from: string, to: string, group: Group) {
  const runs = await db()
    .select()
    .from(payroll_runs)
    .where(and(eq(payroll_runs.studio_id, s.studioId), eq(payroll_runs.organization_id, s.organizationId), inArray(payroll_runs.status, ["aprobada", "publicada"]), gte(payroll_runs.period, from), lte(payroll_runs.period, to)))
    .orderBy(asc(payroll_runs.period));
  const items = runs.length ? await db().select().from(payroll_items).where(inArray(payroll_items.run_id, runs.map((r) => r.id))) : [];
  const runBy = new Map(runs.map((r) => [r.id, r]));
  const keyOf = (x: Item) => (group === "periodo" ? runBy.get(x.run_id)!.period : group === "area" ? area(x) : convenio(x));
  const columns = [...new Set(items.map(keyOf))].sort();
  const rows = new Map<string, { name: string; kind: string; values: Map<string, number> }>();
  for (const x of items)
    for (const l of x.lines) {
      const r = rows.get(l.code) ?? { name: l.name, kind: l.kind, values: new Map() };
      const k = keyOf(x);
      r.values.set(k, (r.values.get(k) ?? 0) + l.amount);
      rows.set(l.code, r);
    }
  const ORDER = ["rem", "norem", "desc", "contrib"];
  return {
    runs: runs.length,
    columns,
    rows: [...rows.entries()].map(([code, r]) => ({ code, ...r, total: [...r.values.values()].reduce((a, b) => a + b, 0) })).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || b.total - a.total),
  };
}

const KIND_LABEL: Record<string, string> = { rem: "Remunerativo", norem: "No remunerativo", desc: "Descuento", contrib: "Contribución" };

export async function payrollReport(s: PayrollScope, orgName: string, kind: PayrollReport, p: { runId?: string | null; from?: string; to?: string; group?: string | null }): Promise<Report> {
  const title = `${PAYROLL_REPORTS[kind]} · ${orgName}`;
  if (kind === "conceptos") {
    const from = p.from ?? "";
    const to = p.to ?? "";
    if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) throw new LiquidacionError("Elegí los períodos (AAAA-MM).");
    const group: Group = p.group === "area" || p.group === "convenio" ? p.group : "periodo";
    const c = await payrollConcepts(s, from, to, group);
    const rows: Cell[][] = c.rows.map((r) => [r.name, KIND_LABEL[r.kind] ?? r.kind, ...c.columns.map((k) => $(r.values.get(k) ?? 0)), $(r.total)]);
    return { title, subtitle: `De ${from} a ${to} · por ${GROUPS[group].toLowerCase()} · ${c.runs} ${c.runs === 1 ? "liquidación" : "liquidaciones"} aprobadas`, sections: [{ title: "Conceptos", header: ["Concepto", "Tipo", ...c.columns, "Total"], rows, widths: [3, 1.4, ...c.columns.map(() => 1.1), 1.2] }] };
  }
  if (!p.runId) throw new LiquidacionError("Elegí la liquidación.");
  const { run, items } = await runOf(s, p.runId);
  const subtitle = `Liquidación ${runLabel(run)} · pago ${formatDate(run.pay_date, "numeric")}`;
  switch (kind) {
    case "empleados":
      return { title, subtitle, sections: [{ title: "Empleados", header: ["Legajo", "Apellido y nombre", "CUIL", "Convenio", "Categoría", "Área", "Ingreso", "CBU"], rows: items.map((x) => [str(snap(x).legajo), str(snap(x).name), str(snap(x).cuil), convenio(x), str(snap(x).category), area(x), snap(x).startDate ? formatDate(str(snap(x).startDate), "numeric") : "", str(snap(x).cbu)]), widths: [0.8, 2.5, 1.3, 1.8, 1.4, 1.2, 1, 2] }] };
    case "costo": {
      const sumCode = (x: Item, codes: string[]) => x.lines.filter((l) => codes.includes(l.code)).reduce((a, l) => a + l.amount, 0);
      const byArea = new Map<string, number>();
      for (const x of items) byArea.set(area(x), (byArea.get(area(x)) ?? 0) + Number(x.cost));
      const tot = (f: (x: Item) => number) => $(items.reduce((t, x) => t + f(x), 0));
      return {
        title,
        subtitle,
        sections: [
          { title: "Por empleado", header: ["Empleado", "Área", "Remunerativo", "No remunerativo", "Contribuciones", "ART y seguro", "Costo laboral"], rows: items.map((x) => [str(snap(x).name), area(x), $(Number(x.rem)), $(Number(x.norem)), $(Number(x.contrib) - sumCode(x, ["art", "seguro_vida"])), $(sumCode(x, ["art", "seguro_vida"])), $(Number(x.cost))]), totals: [["Totales", null, tot((x) => Number(x.rem)), tot((x) => Number(x.norem)), tot((x) => Number(x.contrib) - sumCode(x, ["art", "seguro_vida"])), tot((x) => sumCode(x, ["art", "seguro_vida"])), tot((x) => Number(x.cost))]], widths: [2.5, 1.3, 1.2, 1.2, 1.2, 1.1, 1.2] },
          { title: "Por área", header: ["Área", "Costo laboral"], rows: [...byArea.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, $(v)]) },
        ],
      };
    }
    case "acreditacion": {
      const ok = items.filter((x) => str(snap(x).cbu));
      const missing = items.filter((x) => !str(snap(x).cbu));
      return {
        title,
        subtitle,
        sections: [
          { title: "A acreditar", header: ["Empleado", "CUIL", "CBU", "Neto"], rows: ok.map((x) => [str(snap(x).name), str(snap(x).cuil), str(snap(x).cbu), $(Number(x.net))]), totals: [["Total", null, null, $(ok.reduce((t, x) => t + Number(x.net), 0))]], widths: [2.5, 1.3, 2.4, 1.2] },
          ...(missing.length ? [{ title: "Sin CBU (pago por otro medio)", header: ["Empleado", "CUIL", "Neto"], rows: missing.map((x) => [str(snap(x).name), str(snap(x).cuil), $(Number(x.net))]) }] : []),
        ],
      };
    }
    case "control": {
      const c = await payrollControl(s, run.id);
      const pct = (d: number | null) => (d === null ? null : Math.round(d * 1000) / 10);
      return {
        title,
        subtitle: `${subtitle} · contra ${c.prev ? runLabel(c.prev) : "ninguna (no hay período anterior aprobado)"}`,
        sections: [
          { title: "Por empleado", header: ["Empleado", "Rem. anterior", "Remunerativo", "Neto anterior", "Neto", "Variación %", "Costo", "Control"], rows: c.employees.map((e) => [e.name, e.prevRem === null ? null : $(e.prevRem), $(e.rem), e.prevNet === null ? null : $(e.prevNet), $(e.net), pct(e.delta), $(e.cost), e.flag === "nuevo" ? "Nuevo" : e.flag === "revisar" ? "Revisar" : "OK"]), widths: [2.4, 1.1, 1.1, 1.1, 1.1, 0.9, 1.1, 0.8] },
          { title: "Por concepto", header: ["Concepto", "Tipo", "Anterior", "Actual", "Diferencia"], rows: c.concepts.map((x) => [x.name, KIND_LABEL[x.kind] ?? x.kind, $(x.before), $(x.now), $(x.diff)]), widths: [3, 1.4, 1.2, 1.2, 1.2] },
          ...(c.gone.length ? [{ title: "Estaban en el período anterior y no en este", header: ["Empleado"], rows: c.gone.map((n) => [n]) }] : []),
        ],
      };
    }
    case "asiento": {
      const { payrollEntryLines } = await import("@/modules/contabilidad/server");
      const lines = await payrollEntryLines(s, run.totals);
      return { title, subtitle, sections: [{ title: "Asiento", header: ["Código", "Cuenta", "Debe", "Haber"], rows: lines.map((l) => [l.code ?? "", l.account, l.debit ? $(l.debit) : null, l.credit ? $(l.credit) : null]), totals: [[null, "Totales", $(lines.reduce((t, l) => t + l.debit, 0)), $(lines.reduce((t, l) => t + l.credit, 0))]], widths: [1, 4, 1.3, 1.3] }] };
    }
  }
  throw new LiquidacionError("Reporte desconocido.");
}
