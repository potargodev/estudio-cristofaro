// §2.q etapa 6: liquidación de sueldos. Comercio con novedades (cargadas e
// importadas), mensual de julio a noviembre aprobadas, SAC de diciembre,
// re-liquidación con registro de cambios, duplicar una aprobada, escala nueva
// desde el Faro Manager, recibos publicados para la firma, LSD, F.931 y
// acreditación, informes, liquidación final, el Agente y aislamiento.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/liquidacion.mts

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
const { executeTool } = await import("../../src/modules/tools/index.ts");

const A = { studioId: d.studios.A, organizationId: d.orgs.sur, canManage: true, fromStudio: true };
const B = { studioId: d.studios.B, organizationId: d.orgs.ajena, canManage: true, fromStudio: true };
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A" };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com", name: "Admin B" };
const [owner] = await sql`select id, email from users where faro_role = 'faro_owner' limit 1`;

// Limpieza, módulos y legajo
await sql`insert into tenant_modules (studio_id, module_key, enabled) values (${A.studioId}, 'payroll', true), (${A.studioId}, 'employees', true), (${A.studioId}, 'agent', true), (${B.studioId}, 'payroll', true) on conflict (studio_id, module_key) do update set enabled = true, expires_at = null`;
await sql`delete from payroll_runs where organization_id = ${A.organizationId}`;
await sql`delete from payroll_novelties where organization_id = ${A.organizationId}`;
await sql`delete from payroll_settings where organization_id = ${A.organizationId}`;
await sql`delete from cct_scales`;
await sql`delete from employees where organization_id = ${A.organizationId} and email like '%@liq.test'`;
const emp = async (first: string, last: string, cuil: string, o: Record<string, unknown>) => {
  const [r] = await sql`insert into employees (studio_id, organization_id, first_name, last_name, email, cuil, start_date, area, active) values (${A.studioId}, ${A.organizationId}, ${first}, ${last}, ${`${first.toLowerCase()}@liq.test`}, ${cuil}, ${o.start as string}, ${o.area as string}, true) returning id`;
  return r.id as string;
};
const ana = await emp("Ana", "Liquidada", "27111111113", { start: "2020-03-01", area: "Ventas" });
const bruno = await emp("Bruno", "Cajero", "20222222224", { start: "2024-05-02", area: "Ventas" });
const carla = await emp("Carla", "Gerente", "27333333335", { start: "2019-01-15", area: "Administración" });

await liq.saveSettings(A, actorA, { employerKind: "general", artPct: 2.5, artFixed: 800, lifeInsurance: 350, ownCategories: "GER;Gerente;3000000", payPlace: "Rosario", lastDeposit: "09/2026 · Banco Nación · 10/10/2026" });
await liq.saveEmployeePayroll(A, actorA, ana, { cctKey: "comercio", category: "VA", basicOverride: null, hours: null, affiliated: true, cbu: "0110000000000000000001", legajo: "1" });
await liq.saveEmployeePayroll(A, actorA, bruno, { cctKey: "comercio", category: "CA", basicOverride: null, hours: null, affiliated: false, cbu: "0110000000000000000002", legajo: "2" });
await liq.saveEmployeePayroll(A, actorA, carla, { cctKey: "fuera_convenio", category: "GER", basicOverride: null, hours: null, affiliated: false, cbu: null, legajo: "3" });
check("CBU inválido: error claro", /22 números/.test((await throws(() => liq.saveEmployeePayroll(A, actorA, ana, { cctKey: "comercio", category: "VA", basicOverride: null, hours: null, affiliated: true, cbu: "123", legajo: "1" }))) ?? ""));
check("datos para liquidar en la auditoría", (await sql`select 1 from audit_log where action = 'sueldos.legajo' and entity_id = ${ana}`).length >= 1);

// ─── Julio a noviembre: novedades, liquidar y aprobar ───
const months = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];
await liq.addNovelty(A, actorA, { employeeId: ana, period: "2026-10", kind: "horas_extra_50", quantity: 10, amount: null, detail: "Inventario" });
await liq.addNovelty(A, actorA, { employeeId: bruno, period: "2026-10", kind: "ausencia", quantity: 1, amount: null, detail: null });
const csv = new File([`CUIL;Concepto;Cantidad;Importe;Detalle\n27333333335;adelanto;;150.000,00;Adelanto quincena\n20999999999;horas extra;5;;No está\n27111111113;vacaciones;0;;Mal\n`], "novedades.csv", { type: "text/csv" });
const imp = await liq.importNovelties(A, actorA, "2026-10", csv);
check("importación: carga lo válido y explica cada error por fila", imp.loaded === 1 && imp.errors.length === 2 && imp.errors.some((e) => e.row === 3 && /no está en el legajo/.test(e.error)), JSON.stringify(imp));
const runs: Record<string, string> = {};
for (const m of months) {
  const r = await liq.liquidate(A, actorA, { period: m, kind: "mensual" });
  runs[m] = r.id;
  await liq.approve(A, actorA, r.id);
}
const oct = (await liq.runView(A, runs["2026-10"]))!;
const itemOf = (v: typeof oct, id: string) => v.items.find((x) => x.employee_id === id)!;
const line = (it: { lines: { code: string; amount: number }[] }, code: string) => it.lines.find((l) => l.code === code)?.amount ?? 0;
check("Comercio: básico, antigüedad y presentismo", line(itemOf(oct, ana), "basico") === 111_500_000 && line(itemOf(oct, ana), "antiguedad") > 0 && line(itemOf(oct, ana), "presentismo") > 0);
check("las horas extra suman y la ausencia hace perder el presentismo", line(itemOf(oct, ana), "he50") > 0 && line(itemOf(oct, bruno), "presentismo") === 0 && line(itemOf(oct, bruno), "ausencias") < 0);
check("aportes del 17 % y contribuciones, con cuota sindical del afiliado y FAECYS", line(itemOf(oct, ana), "jubilacion") === Math.round((Number(itemOf(oct, ana).rem) * 11) / 100) && line(itemOf(oct, ana), "sindicato") > 0 && line(itemOf(oct, ana), "contrib_sindical") > 0);
check("fuera de convenio con la escala propia y el adelanto importado", line(itemOf(oct, carla), "basico") === 300_000_000 && line(itemOf(oct, carla), "adelanto") === 15_000_000);
check("el neto es remunerativo + no remunerativo − descuentos", oct.items.every((i) => Number(i.net) === Number(i.rem) + Number(i.norem) - Number(i.desc)));
check("no se liquida dos veces el mismo período", /ya está liquidado/.test((await throws(() => liq.liquidate(A, actorA, { period: "2026-10", kind: "mensual" }))) ?? ""));

// ─── SAC de diciembre ───
const sac = await liq.liquidate(A, actorA, { period: "2026-12", kind: "sac" });
const sv = (await liq.runView(A, sac.id))!;
const bestAna = Math.max(...(await Promise.all(months.map(async (m) => Number(itemOf((await liq.runView(A, runs[m]))!, ana).rem)))));
check("SAC: la mitad de la mejor remuneración del semestre", line(itemOf(sv, ana), "sac") === Math.round(bestAna / 2), `${line(itemOf(sv, ana), "sac")} vs ${bestAna / 2}`);
check("el SAC lleva aportes", line(itemOf(sv, ana), "jubilacion") > 0);
check("el SAC solo en junio o diciembre", (await throws(() => liq.liquidate(A, actorA, { period: "2026-10", kind: "sac" }))) !== null);

// ─── Re-liquidación de un borrador con registro de cambios ───
const dec = await liq.liquidate(A, actorA, { period: "2026-12", kind: "mensual" });
await liq.addNovelty(A, actorA, { employeeId: ana, period: "2026-12", kind: "horas_extra_100", quantity: 8, amount: null, detail: "Feriado" });
const ch = await liq.reliquidate(A, actorA, dec.id, "Se cargaron las horas del feriado");
check("re-liquidar registra qué cambió, para quién y por qué", ch.length === 1 && ch[0].employee.startsWith("Liquidada") && /Horas extra al 100/.test(ch[0].detail) && ch[0].reason === "Se cargaron las horas del feriado" && (ch[0].after ?? 0) > (ch[0].before ?? 0), JSON.stringify(ch));
check("no se re-liquida una aprobada", /duplicá/.test((await throws(() => liq.reliquidate(A, actorA, runs["2026-11"]))) ?? ""));

// ─── Escala nueva del Faro Manager: aviso y re-liquidación ───
const before = await sql`select count(*)::int n from notifications where user_id = ${actorA.id}`;
const sc = await liq.saveScale(owner, { cctKey: "comercio", validFrom: "2026-12-01", status: "validada", source: "Acta acuerdo diciembre (prueba)", categories: "VA;Vendedor A;1200000\nCA;Cajero A;1180000\nAA;Administrativo A;1150000", notify: true });
check("escala nueva: auditada y con aviso a los estudios con empleados en el convenio", sc.notified >= 1 && (await sql`select count(*)::int n from notifications where user_id = ${actorA.id}`)[0].n > before[0].n && (await sql`select 1 from audit_log where action = 'faro.escala_cct'`).length >= 1);
const ch2 = await liq.reliquidate(A, actorA, dec.id, "Escala de diciembre");
const decv = (await liq.runView(A, dec.id))!;
check("la re-liquidación toma la escala vigente y lo deja en el registro", line(itemOf(decv, ana), "basico") === 120_000_000 && ch2.some((c) => /Sueldo básico/.test(c.detail)) && decv.run.changes.length >= 3);
check("las liquidaciones de antes conservan su escala", line(itemOf((await liq.runView(A, runs["2026-11"]))!, ana), "basico") === 111_500_000);

// ─── Duplicar una aprobada (versión nueva) ───
check("duplicar pide el motivo", (await throws(() => liq.duplicate(A, actorA, runs["2026-11"], " "))) !== null);
await liq.addNovelty(A, actorA, { employeeId: bruno, period: "2026-11", kind: "concepto_rem", quantity: null, amount: 50000, detail: "Premio por ventas" });
const v2 = await liq.duplicate(A, actorA, runs["2026-11"], "Faltó el premio de Bruno");
check("duplicar: versión 2 en borrador con el registro contra la versión 1", v2.version === 2 && v2.status === "borrador" && v2.changes.some((c) => c.employee.startsWith("Cajero") && /Premio por ventas/.test(c.detail)));
await liq.approve(A, actorA, v2.id);
check("al aprobar la versión nueva, la anterior queda reemplazada", (await sql`select status from payroll_runs where id = ${runs["2026-11"]}`)[0].status === "reemplazada");

// ─── Recibos, archivos e informes ───
const pub = await liq.publish(A, actorA, runs["2026-10"]);
const slips = await sql`select status, storage_path from payslips where batch_id = ${pub.batchId}`;
check("publicar: un recibo en PDF por empleado, listo para la firma", pub.published === 3 && slips.length === 3 && slips.every((x) => x.status === "publicado"));
const pdf = await liq.receiptOf(A, itemOf(oct, ana).id);
check("el recibo es un PDF (con el neto en letras)", !!pdf && Buffer.from(pdf.pdf).subarray(0, 4).toString() === "%PDF");
check("publicada: no se anula", /duplicala/.test((await throws(() => liq.annul(A, actorA, runs["2026-10"]))) ?? ""));
const lsd = await liq.exportRun(A, actorA, runs["2026-10"], "lsd");
const lsdLines = lsd.body.trim().split(/\r\n/);
check("Libro de Sueldos Digital: registros 01, 02, 03 y 04", lsdLines[0].startsWith("01") && lsdLines.filter((l) => l.startsWith("02")).length === 3 && lsdLines.filter((l) => l.startsWith("03")).length > 10 && lsdLines.filter((l) => l.startsWith("04")).length === 3);
const f931 = await liq.exportRun(A, actorA, runs["2026-10"], "f931");
check("F.931: una línea por trabajador con el CUIL", f931.body.trim().split(/\r\n/).length === 3 && f931.body.includes("27111111113"));
const bank = await liq.exportRun(A, actorA, runs["2026-10"], "banco_csv");
check("acreditación: los que tienen CBU (Carla no)", bank.body.includes("0110000000000000000001") && !bank.body.includes("Gerente"));
check("un borrador no se exporta", /aprobada/.test((await throws(() => liq.exportRun(A, actorA, dec.id, "lsd"))) ?? ""));
const rep = (await liq.reports(A, runs["2026-10"]))!;
check("informes: costo por empleado y por área, cargas sociales, acreditaciones y nómina", rep.byEmployee.length === 3 && rep.byArea.some((a) => a.area === "Administración") && rep.charges.contribuciones > 0 && rep.credits.missing.includes("Gerente, Carla") && rep.payroll.length === 3);
check("variaciones contra el mes anterior", rep.variations.length === 3 && rep.variations.every((x) => x.previousNet != null));

// ─── Liquidación final ───
const fin = await liq.liquidate(A, actorA, { period: "2026-12", kind: "final", final: { employeeId: bruno, endDate: "2026-12-10", reason: "despido_sin_causa", vacationsTaken: 0, noticeGiven: false } });
const fv = (await liq.runView(A, fin.id))!;
check("final por despido: indemnización, preaviso, integración, vacaciones y SAC proporcionales", ["indemnizacion", "preaviso", "integracion", "vac_no_gozadas", "sac"].every((c) => line(fv.items[0], c) > 0));

// ─── El Agente: «liquidá diciembre» deja el borrador y marca lo raro ───
const agent = await import("../../src/modules/agent/server.ts");
const [me] = await sql`select u.id, u.name, u.email, u.role, s.kind from users u join studios s on s.id = u.studio_id where u.id = ${actorA.id}`;
const actor = { id: me.id, name: me.name, email: me.email, role: me.role, studioId: A.studioId, tenantKind: me.kind };
await liq.annul(A, actorA, dec.id);
const tid = await agent.createTask(actor, { text: "Liquidá diciembre de 2026", templateKey: "liquidar_sueldos", scope: "organizacion", organizationId: A.organizationId, period: "2026-12" });
for (let i = 0; i < 40; i++) {
  await agent.runAgentWorker();
  if ((await sql`select status from agent_tasks where id = ${tid}`)[0].status === "completada") break;
}
const [task] = await sql`select status, report from agent_tasks where id = ${tid}`;
const [agentRun] = await sql`select status, origin from payroll_runs where organization_id = ${A.organizationId} and period = '2026-12' and kind = 'mensual' and status <> 'anulada'`;
check("el Agente arma la liquidación y la deja en borrador para aprobar", task.status === "completada" && agentRun?.status === "borrador" && agentRun.origin === "agente" && task.report.findings.some((f: { title: string }) => f.title.startsWith("Liquidación de sueldos en borrador")), JSON.stringify(task.report?.findings?.map((f: { title: string }) => f.title)));
check("y marca lo raro (Carla sin CBU)", task.report.findings.some((f: { title: string }) => /Carla|CBU/.test(f.title)));

// ─── Aislamiento forzando IDs ───
check("otro estudio no ve la liquidación", (await liq.runView(B, runs["2026-10"])) === null);
check("otro estudio no la aprueba ni la re-liquida", (await throws(() => liq.approve(B, actorB, dec.id))) !== null && (await throws(() => liq.reliquidate(B, actorB, dec.id))) !== null);
check("otro estudio no exporta ni ve recibos ajenos", (await throws(() => liq.exportRun(B, actorB, runs["2026-10"], "lsd"))) !== null && (await liq.receiptOf(B, itemOf(oct, ana).id)) === null);
check("otro estudio no edita el legajo ni carga novedades a empleados ajenos", (await throws(() => liq.saveEmployeePayroll(B, actorB, ana, { cctKey: "comercio", category: "VA", basicOverride: 1, hours: null, affiliated: false, cbu: null, legajo: null }))) !== null && (await throws(() => liq.addNovelty(B, actorB, { employeeId: ana, period: "2026-12", kind: "adelanto", quantity: null, amount: 1, detail: null }))) !== null);
check("otra organización del mismo estudio tampoco", (await liq.runView({ ...A, organizationId: d.orgs.norte }, runs["2026-10"])) === null && (await throws(() => liq.addNovelty({ ...A, organizationId: d.orgs.norte }, actorA, { employeeId: ana, period: "2026-12", kind: "adelanto", quantity: null, amount: 1, detail: null }))) !== null);
check("forzar la organización ajena no liquida a sus empleados", (await throws(() => liq.liquidate({ ...B, organizationId: A.organizationId }, actorB, { period: "2026-09", kind: "vacaciones" }))) !== null);
const ctxB = { studioId: B.studioId, actor: { id: actorB.id, email: actorB.email, name: "Admin B", role: "dueno" as const }, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };
check("el Vigía de otro estudio no liquida una organización ajena", (await executeTool("liquidar_sueldos", { organizacion_id: A.organizationId, periodo: "2026-12" }, ctxB)).status === "denegado");
check("sin permiso de gestión no se liquida", (await throws(() => liq.liquidate({ ...A, canManage: false }, actorA, { period: "2026-12", kind: "vacaciones" }))) !== null);

await sql`delete from tenant_modules where studio_id = ${A.studioId} and module_key = 'agent'`;
await sql`delete from cct_scales`;
await sql.end();
console.log(fails ? `\n${fails} fallas` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
