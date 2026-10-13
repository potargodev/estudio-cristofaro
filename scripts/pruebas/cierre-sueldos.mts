// A3 · Reportes de cierre: sueldos (nómina, conceptos por período, área y
// convenio, control contra el período anterior, acreditación, costo laboral
// y asiento de sueldos) en Excel y PDF y por el Agente; impuestos del banco
// (débitos y créditos, SIRCREB, percepciones, IVA de gastos y comisiones)
// en la conciliación y la contabilidad; aislamiento forzando IDs.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/cierre-sueldos.mts

import { readFileSync } from "node:fs";
import postgres from "postgres";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message || "error";
  }
};

const liq = await import("../../src/modules/liquidacion/server.ts");
const rep = await import("../../src/modules/liquidacion/reportes.ts");
const cb = await import("../../src/modules/contabilidad/server.ts");
const crep = await import("../../src/modules/contabilidad/reports.ts");
const { reportToPdf, reportToXlsx } = await import("../../src/lib/export-table.ts");
const { executeTool } = await import("../../src/modules/tools/index.ts");

const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A" };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com", name: "Admin B" };
await sql`insert into tenant_modules (studio_id, module_key, enabled) values (${d.studios.A}, 'payroll', true), (${d.studios.A}, 'employees', true), (${d.studios.A}, 'bank_rec', true) on conflict (studio_id, module_key) do update set enabled = true, expires_at = null`;
await sql`delete from organizations where name = 'Cierre Sueldos SA' and studio_id = ${d.studios.A}`;
const [org] = await sql`insert into organizations (studio_id, name, status) values (${d.studios.A}, 'Cierre Sueldos SA', 'activa') returning id`;
const A = { studioId: d.studios.A, organizationId: org.id as string, canManage: true, fromStudio: true };
const C = { studioId: A.studioId, organizationId: A.organizationId };
const foreign = { studioId: d.studios.B, organizationId: A.organizationId, canManage: true, fromStudio: true };

const emp = async (first: string, cuil: string, area: string) => (await sql`insert into employees (studio_id, organization_id, first_name, last_name, email, cuil, start_date, area, active) values (${A.studioId}, ${A.organizationId}, ${first}, 'Cierre', ${`${first.toLowerCase()}@cierre.test`}, ${cuil}, '2022-01-10', ${area}, true) returning id`)[0].id as string;
const ana = await emp("Ana", "27111111113", "Ventas");
const beto = await emp("Beto", "20222222224", "Depósito");
const dora = await emp("Dora", "27333333335", "Administración");
await liq.saveSettings(A, actorA, { employerKind: "general", artPct: 2.5, artFixed: 800, lifeInsurance: 350, ownCategories: "ADM;Administrativa;2000000", payPlace: "Rosario", lastDeposit: null });
await liq.saveEmployeePayroll(A, actorA, ana, { cctKey: "comercio", category: "VA", basicOverride: null, hours: null, affiliated: true, cbu: "0110000000000000000001", legajo: "1" });
await liq.saveEmployeePayroll(A, actorA, beto, { cctKey: "comercio", category: "CA", basicOverride: null, hours: null, affiliated: false, cbu: "0110000000000000000002", legajo: "2" });
await liq.saveEmployeePayroll(A, actorA, dora, { cctKey: "fuera_convenio", category: "ADM", basicOverride: null, hours: null, affiliated: false, cbu: null, legajo: "3" });

// Agosto con los tres; en septiembre Dora ya no está, entra Eva y Ana hace 30 horas extra
const aug = await liq.liquidate(A, actorA, { period: "2026-08", kind: "mensual" });
await liq.approve(A, actorA, aug.id);
await sql`update employees set active = false where id = ${dora}`;
const eva = await emp("Eva", "27444444446", "Ventas");
await liq.saveEmployeePayroll(A, actorA, eva, { cctKey: "comercio", category: "VA", basicOverride: null, hours: null, affiliated: false, cbu: "0110000000000000000004", legajo: "4" });
await liq.addNovelty(A, actorA, { employeeId: ana, period: "2026-09", kind: "horas_extra_100", quantity: 30, amount: null, detail: "Balance" });
const sep = await liq.liquidate(A, actorA, { period: "2026-09", kind: "mensual" });
await liq.approve(A, actorA, sep.id);

// ─── Control contra el período anterior ───
const ctl = await rep.payrollControl(A, sep.id);
const by = (n: string) => ctl.employees.find((e) => e.name.includes(n));
check("el control compara contra agosto", ctl.prev?.period === "2026-08");
check("Ana (horas extra) queda para revisar", by("Ana")?.flag === "revisar", JSON.stringify(by("Ana")));
check("Eva es nueva y Beto está OK", by("Eva")?.flag === "nuevo" && by("Beto")?.flag === "ok");
check("Dora estaba y ya no está", ctl.gone.some((n) => n.includes("Dora")));
check("por concepto: las horas extra aparecen con su diferencia", ctl.concepts.some((c) => /extra/i.test(c.name) && c.before === 0 && c.now > 0));

// ─── Reportes ───
const sepItems = await sql`select net, cost, snapshot from payroll_items where run_id = ${sep.id}`;
const r1 = await rep.payrollReport(A, "Cierre Sueldos SA", "empleados", { runId: sep.id });
check("nómina: un renglón por empleado liquidado", r1.sections[0].rows.length === sepItems.length && r1.sections[0].header.includes("CUIL"));
const r2 = await rep.payrollReport(A, "Cierre Sueldos SA", "costo", { runId: sep.id });
const totalCost = sepItems.reduce((t: number, x: { cost: string }) => t + Number(x.cost), 0);
check("costo laboral: total igual a la liquidación, y por área", r2.sections[0].totals?.[0].at(-1) === Math.round(totalCost) / 100 && r2.sections[1].rows.length === 2);
const r3 = await rep.payrollReport(A, "Cierre Sueldos SA", "acreditacion", { runId: aug.id });
check("acreditación: los que no tienen CBU van aparte", r3.sections.length === 2 && r3.sections[1].rows.some((r) => String(r[0]).includes("Dora")));
const r4 = await rep.payrollReport(A, "Cierre Sueldos SA", "conceptos", { from: "2026-08", to: "2026-09", group: "periodo" });
check("conceptos por período: una columna por mes", r4.sections[0].header.includes("2026-08") && r4.sections[0].header.includes("2026-09"));
const r5 = await rep.payrollReport(A, "Cierre Sueldos SA", "conceptos", { from: "2026-08", to: "2026-09", group: "convenio" });
check("conceptos por convenio", r5.sections[0].header.some((h) => /Comercio/i.test(h)) && r5.sections[0].header.includes("Fuera de convenio"));
const r6 = await rep.payrollReport(A, "Cierre Sueldos SA", "conceptos", { from: "2026-08", to: "2026-09", group: "area" });
check("conceptos por área", r6.sections[0].header.includes("Depósito") && r6.sections[0].header.includes("Ventas"));
const r7 = await rep.payrollReport(A, "Cierre Sueldos SA", "asiento", { runId: sep.id });
const t7 = r7.sections[0].totals![0];
check("el asiento de sueldos balancea", t7[2] === t7[3] && Number(t7[2]) > 0);
const r8 = await rep.payrollReport(A, "Cierre Sueldos SA", "control", { runId: sep.id });
check("control exportable con las dos secciones y quienes ya no están", r8.sections.length === 3);
let okFiles = true;
for (const r of [r1, r2, r3, r4, r7, r8]) okFiles &&= (await reportToXlsx(r)).length > 1000 && (await reportToPdf(r)).length > 1000;
check("todo se exporta a Excel y PDF", okFiles);

// ─── Asiento de sueldos ───
const e1 = await cb.payrollEntry(C, actorA, sep.id);
check("el asiento de la liquidación queda en Contabilidad (borrador, origen sueldos)", e1?.status === "borrador" && e1?.source === "sueldos");
check("armarlo otra vez no lo duplica", (await cb.payrollEntry(C, actorA, sep.id)) === null);
const g = await cb.generateEntries(C, actorA, "2026-08-01", "2026-10-31", ["sueldos"]);
check("«Generar asientos» solo suma el de agosto (el de septiembre ya estaba)", g.sueldos === 1, JSON.stringify(g));
check("el asiento queda en la auditoría", (await sql`select 1 from audit_log where action = 'contabilidad.asiento_sueldos' and organization_id = ${A.organizationId}`).length > 0);

// ─── Agente ───
const ctxA = { studioId: A.studioId, actor: { ...actorA, role: "dueno" as const }, origin: "agente" as const, organizationIds: null, modules: null, canWrite: true };
const t1 = await executeTool("reporte_sueldos", { organizacion_id: A.organizationId, periodo: "2026-09" }, ctxA);
const tr1 = (t1 as { result?: { a_revisar: { empleado: string }[]; excel: string } }).result;
check("el Agente arma el control de septiembre con lo que hay que revisar", t1.status === "ok" && !!tr1?.a_revisar.some((x) => x.empleado.includes("Ana")) && /reporte=control/.test(tr1?.excel ?? ""), JSON.stringify(t1).slice(0, 200));
const t2 = await executeTool("reporte_sueldos", { organizacion_id: A.organizationId, periodo: "2026-09", tipo: "costo" }, ctxA);
check("y el costo laboral", t2.status === "ok");
check("sin liquidación aprobada, lo dice", (await executeTool("reporte_sueldos", { organizacion_id: A.organizationId, periodo: "2026-01" }, ctxA)).status !== "ok");

// ─── Impuestos del banco ───
const [st] = await sql`insert into bank_statements (studio_id, organization_id, bank, file_name, source, period_from, period_to) values (${A.studioId}, ${A.organizationId}, 'Galicia', 'cierre.csv', 'csv', '2026-09-01', '2026-09-30') returning id`;
const mov = (day: string, desc: string, amount: number, cls: string, id: string) => sql`insert into bank_movements (statement_id, studio_id, organization_id, date, description, amount, cls, external_id) values (${st.id}, ${A.studioId}, ${A.organizationId}, ${day}, ${desc}, ${amount}, ${cls}, ${id})`;
await mov("2026-09-02", "IMP. LEY 25413 S/DEB", -120000, "impuesto", "cs1");
await mov("2026-09-03", "IMP. LEY 25413 S/CRED", -180000, "impuesto", "cs2");
await mov("2026-09-04", "RET SIRCREB IIBB", -90000, "impuesto", "cs3");
await mov("2026-09-05", "PERCEPCION IVA RG 2408", -30000, "impuesto", "cs4");
await mov("2026-09-06", "IVA S/COMISIONES", -10500, "impuesto", "cs5");
await mov("2026-09-06", "COMISION MANTENIMIENTO", -50000, "comision", "cs6");
await mov("2026-09-07", "TRANSFERENCIA RECIBIDA", 5000000, "cobro", "cs7");
const bt = await cb.bankTaxes(C, "2026-09-01", "2026-09-30");
check("débitos y créditos (Ley 25.413) por separado", bt.totals.debitos_25413 === 120000 && bt.totals.creditos_25413 === 180000);
check("SIRCREB, percepción de IVA, IVA de gastos y comisión", bt.totals.sircreb === 90000 && bt.totals.percepcion_iva === 30000 && bt.totals.iva_gastos === 10500 && bt.totals.comision === 50000);
check("estimación de lo computable de la Ley 25.413 (33 %, a validar)", bt.computable === 99000);
const gb = await cb.generateEntries(C, actorA, "2026-09-01", "2026-09-30", ["bancos"]);
check("a la contabilidad: un asiento por débito, sin tocar otros orígenes", gb.bancos === 6 && gb.sueldos === 0 && gb.facturas === 0, JSON.stringify(gb));
const acc = await cb.accountsOf(C);
const code = (role: string) => acc.find((a) => a.role === role)!.code;
const [ivaG] = await sql`select lines from journal_entries where organization_id = ${A.organizationId} and source = 'banco' and concept like 'IVA sobre gastos%'`;
check("el IVA de las comisiones va a crédito fiscal y la percepción a su cuenta", ivaG?.lines[0].code === code("iva_credito") && (await sql`select 1 from journal_entries where organization_id = ${A.organizationId} and source = 'banco' and lines->0->>'code' = ${code("percepciones_iva")}`).length === 1);
check("llevarlo otra vez no duplica", (await cb.generateEntries(C, actorA, "2026-09-01", "2026-09-30", ["bancos"])).bancos === 0);
const rb = await crep.accountingReport(C, "Cierre Sueldos SA", "impuestos_bancarios", { from: "2026-09-01", to: "2026-09-30" });
check("reporte de impuestos bancarios con resumen y movimientos", rb.sections[0].rows.length === 7 && rb.sections[1].rows.length === 6);
const tc = await executeTool("estado_conciliacion", { organizacion_id: A.organizationId }, ctxA);
const imp = (tc as { result?: { impuestos_bancarios: Record<string, number> } }).result?.impuestos_bancarios;
check("el Vigía ve los impuestos del banco en la conciliación", tc.status === "ok" && imp?.["Retenciones SIRCREB (IIBB)"] === 900, JSON.stringify(imp));

// ─── Aislamiento forzando IDs ───
check("otro estudio no saca reportes de la liquidación", /No encontramos/.test((await throws(() => rep.payrollReport(foreign, "x", "costo", { runId: sep.id }))) ?? ""));
check("ni el control", /No encontramos/.test((await throws(() => rep.payrollControl(foreign, sep.id))) ?? ""));
check("ni arma el asiento de sueldos", /no es de esta organización/.test((await throws(() => cb.payrollEntry({ studioId: d.studios.B, organizationId: A.organizationId }, actorB, sep.id))) ?? ""));
check("ni ve los impuestos del banco", /no es de este estudio/.test((await throws(() => cb.bankTaxes({ studioId: d.studios.B, organizationId: A.organizationId }, "2026-09-01", "2026-09-30"))) ?? ""));
const ctxB = { studioId: d.studios.B, actor: { ...actorB, role: "dueno" as const }, origin: "agente" as const, organizationIds: null, modules: null, canWrite: true };
check("ni los pide por el Agente", (await executeTool("reporte_sueldos", { organizacion_id: A.organizationId, periodo: "2026-09" }, ctxB)).status !== "ok");

await sql.end();
console.log(fails ? `\n${fails} verificaciones fallaron` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
