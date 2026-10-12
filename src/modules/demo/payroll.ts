// Demo de la liquidación de sueldos (§2.q etapa 6): los empleados de la
// primera organización de la cartera con convenio de Comercio, parámetros,
// dos meses liquidados y aprobados, y el borrador del mes que dejó el Agente
// con su registro de cambios. Se calcula con el mismo motor que la app.

import type { Db } from "@/db";
import { employees, payroll_items, payroll_novelties, payroll_runs, payroll_settings, type PayrollChange } from "@/db/schema";
import { eq } from "drizzle-orm";
import { CCTS, scaleAt } from "@/modules/liquidacion/convenios";
import { DEFAULT_ORG, liquidarMensual, paramsAt, type Employee, type Novelty } from "@/modules/liquidacion/core";
import { month, type DemoUser } from "./base";

const PEOPLE = [
  { category: "VB", affiliated: true, cbu: "0070999030004000000011" },
  { category: "AC", affiliated: false, cbu: "0070999030004000000012" },
  { category: "AB", affiliated: true, cbu: null },
  { category: "AA", affiliated: false, cbu: "0070999030004000000014" },
];

const lastDay = (p: string) => new Date(Date.UTC(Number(p.slice(0, 4)), Number(p.slice(5)), 0)).toISOString().slice(0, 10);

export async function seedPayroll(db: Db, studioId: string, orgId: string, by: DemoUser, ids: string[]) {
  const comercio = CCTS.find((c) => c.key === "comercio")!;
  for (const [i, id] of ids.entries()) {
    const p = PEOPLE[i % PEOPLE.length];
    await db.update(employees).set({ cct_key: "comercio", category: p.category, affiliated: p.affiliated, cbu: p.cbu, legajo: String(101 + i) }).where(eq(employees.id, id));
  }
  await db.insert(payroll_settings).values({ studio_id: studioId, organization_id: orgId, pay_place: "Ciudad de Buenos Aires", last_deposit: `${month(-1).slice(5)}/${month(-1).slice(0, 4)} · Banco Galicia`, updated_by: by.id });
  const staff = await db.select().from(employees).where(eq(employees.organization_id, orgId));
  const novelties: Novelty[] = [
    { employeeId: ids[0], kind: "horas_extra_50", quantity: 6, amount: null, detail: "Cierre de campaña" },
    { employeeId: ids[2], kind: "ausencia", quantity: 1, amount: null, detail: null },
  ];
  const periods = [month(-2), month(-1), month(0)];
  for (const [k, period] of periods.entries()) {
    const params = paramsAt(lastDay(period));
    const cats = scaleAt(comercio, lastDay(period), []).categories;
    const nov = k === 2 ? novelties : [];
    const items = staff.map((row) => {
      const e: Employee = { id: row.id, name: `${row.last_name}, ${row.first_name}`, cuil: row.cuil, startDate: row.start_date, area: row.area, cctKey: row.cct_key, category: row.category, basicOverride: null, hours: null, affiliated: row.affiliated, cbu: row.cbu };
      const r = liquidarMensual({ period, employee: e, categories: cats, novelties: nov, org: DEFAULT_ORG, params });
      r.warnings.push("La escala de Empleados de Comercio está a validar: revisá los básicos con el acta vigente.");
      const cat = cats.find((c) => c.code === row.category);
      return { e, r, snapshot: { name: e.name, cuil: e.cuil, legajo: row.legajo, startDate: e.startDate, area: e.area, cct: `${comercio.name} (${comercio.number})`, cctKey: "comercio", category: cat ? `${cat.code} · ${cat.name}` : row.category, cbu: e.cbu, affiliated: e.affiliated } };
    });
    const totals = { employees: items.length, rem: items.reduce((a, x) => a + x.r.rem, 0), norem: items.reduce((a, x) => a + x.r.norem, 0), desc: items.reduce((a, x) => a + x.r.desc, 0), net: items.reduce((a, x) => a + x.r.net, 0), contrib: items.reduce((a, x) => a + x.r.contrib, 0), cost: items.reduce((a, x) => a + x.r.cost, 0) };
    const draft = k === 2;
    const changes: PayrollChange[] = draft ? [{ at: new Date().toISOString(), actor: "Agente contable", reason: "Se cargaron las horas extra del cierre de campaña", employee: items[0].e.name, before: items[0].r.net - Math.round(items[0].r.net * 0.06), after: items[0].r.net, detail: "Cambió: Horas extra al 50 %, Presentismo" }] : [];
    const [run] = await db
      .insert(payroll_runs)
      .values({ studio_id: studioId, organization_id: orgId, period, kind: "mensual", status: draft ? "borrador" : "aprobada", pay_date: lastDay(period), basis: { escalas: { comercio: { validFrom: "2026-10-01", status: "a_validar", source: "Escala de referencia de Faro (estimada)" } }, parametros: { desde: params.validFrom, estado: params.status, fuente: params.source } }, totals, warnings: items.reduce((a, x) => a + x.r.warnings.length, 0), changes, origin: draft ? "agente" : "manual", created_by: by.id, approved_by: draft ? null : by.id, approved_at: draft ? null : new Date() })
      .returning({ id: payroll_runs.id });
    await db.insert(payroll_items).values(items.map(({ e, r, snapshot }) => ({ run_id: run.id, studio_id: studioId, organization_id: orgId, employee_id: e.id, snapshot, lines: r.lines, rem: r.rem, norem: r.norem, desc: r.desc, net: r.net, contrib: r.contrib, cost: r.cost, bases: r.bases, warnings: r.warnings })));
  }
  await db.insert(payroll_novelties).values(novelties.map((n) => ({ studio_id: studioId, organization_id: orgId, employee_id: n.employeeId, period: month(0), kind: n.kind, quantity: n.quantity == null ? null : String(n.quantity), amount: null, detail: n.detail, source: "manual", created_by: by.id })));
}
