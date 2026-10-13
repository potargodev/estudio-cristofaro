// A2 · Ajuste por inflación contable: índices FACPCE traídos de la fuente del
// Faro Manager (simulador en mocks/dolar), meses que faltan y carga manual
// por organización, clasificación monetaria editable, reexpresión, RECPAM,
// asiento en borrador idempotente, nominal vs homogéneo, papel de trabajo,
// balance que cierra con el ajuste, Agente y aislamiento.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/inflacion.mts

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

const cb = await import("../../src/modules/contabilidad/server.ts");
const inf = await import("../../src/modules/contabilidad/inflacion-server.ts");
const rep = await import("../../src/modules/contabilidad/reports.ts");
const { reportToPdf, reportToXlsx } = await import("../../src/lib/export-table.ts");
const { executeTool } = await import("../../src/modules/tools/index.ts");
const { validateLines } = await import("../../src/modules/contabilidad/core.ts");

const FX = process.env.FX_API_URL ?? "http://localhost:4040";
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A" };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com", name: "Admin B" };
await sql`delete from organizations where name = 'Inflación Prueba SA' and studio_id = ${d.studios.A}`;
const [org] = await sql`insert into organizations (studio_id, name, status) values (${d.studios.A}, 'Inflación Prueba SA', 'activa') returning id`;
const A = { studioId: d.studios.A, organizationId: org.id as string };
const END = "2026-12-31";

// ─── Índices del Faro Manager ───
await inf.setIndexSource(actorA, `${FX}/indices/facpce.csv`, "FACPCE (simulador)");
const n = await inf.fetchIndexes(actorA);
check("«Traer ahora» lee la serie de la fuente configurada", n === 37, String(n));
check("una fuente que no es http no se acepta", /http/.test((await throws(() => inf.setIndexSource(actorA, "ftp://x", ""))) ?? ""));
check("la carga queda en la auditoría", (await sql`select 1 from audit_log where action = 'faro.indices_inflacion' and metadata->>'fuente' = 'FACPCE (simulador)'`).length > 0);
const idx = new Map((await inf.platformIndexes()).map((r) => [r.month, Number(r.value)]));

// ─── Datos del ejercicio 2026 ───
const acc = await cb.accountsOf(A);
const code = (role: string) => acc.find((a) => a.role === role)!.code;
const rodados = acc.find((a) => a.name === "Rodados")!.code;
const entry = (date: string, concept: string, lines: [string, number, number][]) => cb.createEntry(A, actorA, { date, concept, register: true, lines: lines.map(([c, debit, credit]) => ({ account: c, code: c, debit, credit })) });
await entry("2026-01-02", "Aporte de capital", [[code("banco"), 100_000_000, 0], [code("capital"), 0, 100_000_000]]);
await entry("2026-03-15", "Compra de rodado", [[rodados, 30_000_000, 0], [code("banco"), 0, 30_000_000]]);
await entry("2026-06-10", "Venta", [[code("deudores"), 10_000_000, 0], [code("ventas"), 0, 10_000_000]]);
await entry("2026-09-05", "Gastos", [[code("compras"), 4_000_000, 0], [code("banco"), 0, 4_000_000]]);

// ─── Meses que faltan y carga manual ───
await sql`delete from inflation_indexes where series = 'facpce' and month = '2026-05'`;
const p0 = await inf.previewAdjustment(A, END);
check("si falta un mes, lo dice y no calcula", p0.missing.join() === "2026-05" && !p0.lines.length, p0.missing.join());
check("y no deja armar el asiento", /Faltan los índices de 2026-05/.test((await throws(() => inf.runAdjustment(A, actorA, END))) ?? ""));
await inf.saveOwnIndexes(A, actorA, END, `2026-05;${String(idx.get("2026-05")).replace(".", ",")}`);
const p1 = await inf.previewAdjustment(A, END);
check("cargado a mano para la organización, ya calcula", !p1.missing.length && p1.used["2026-05"]?.source === "manual");
await inf.fetchIndexes(actorA);

// ─── Clasificación monetaria ───
const cls = await inf.classification(A);
check("la clasificación trae la sugerencia de Faro (Rodados: no monetaria)", cls.find((c) => c.code === rodados)?.suggested === false && cls.find((c) => c.code === code("banco"))?.suggested === true);
const monetary = new Set(cls.filter((c) => c.monetary).map((c) => c.code));
check("guardar sin cambios no toca nada", (await inf.setClassification(A, actorA, monetary)) === 0);
check("marcar Rodados como monetaria es un cambio auditado", (await inf.setClassification(A, actorA, new Set([...monetary, rodados]))) === 1 && (await sql`select 1 from audit_log where action = 'contabilidad.clasificacion_monetaria' and organization_id = ${A.organizationId}`).length > 0);
check("y deja de reexpresarse", !(await inf.previewAdjustment(A, END)).lines.some((l) => l.code === rodados));
await inf.setClassification(A, actorA, monetary);

// ─── Reexpresión, RECPAM y asiento ───
const c = (m: string) => idx.get("2026-12")! / idx.get(m)!;
const adjCapital = Math.round(-100_000_000 * c("2026-01")) + 100_000_000;
const adjRodado = Math.round(30_000_000 * c("2026-03")) - 30_000_000;
const adjVentas = Math.round(-10_000_000 * c("2026-06")) + 10_000_000;
const adjGastos = Math.round(4_000_000 * c("2026-09")) - 4_000_000;
const r1 = await inf.runAdjustment(A, actorA, END);
check("el rodado se reexpresa por su mes de compra", r1.rows.find((r) => r.code === rodados)?.adjustment === adjRodado, `${r1.rows.find((r) => r.code === rodados)?.adjustment} vs ${adjRodado}`);
check("el capital va a «Ajuste de capital» y no se toca la cuenta", r1.lines.some((l) => l.code === code("ajuste_capital") && l.credit === -adjCapital) && !r1.lines.some((l) => l.code === code("capital")));
check("resultados reexpresados por su mes (ventas y gastos)", r1.lines.some((l) => l.code === code("ventas") && l.credit === -adjVentas) && r1.lines.some((l) => l.code === code("compras") && l.debit === adjGastos));
check("las monetarias no se ajustan (banco, deudores)", !r1.lines.some((l) => l.code === code("banco") || l.code === code("deudores")));
const expected = -(adjCapital + adjRodado + adjVentas + adjGastos);
check("RECPAM = contrapartida de los ajustes (pérdida con activos monetarios netos)", r1.recpam === expected && r1.recpam > 0, `${r1.recpam} vs ${expected}`);
check("el asiento balancea", validateLines(r1.lines.map((l) => ({ ...l }))) > 0);
const [je] = await sql`select status, source, lines from journal_entries where id = ${r1.entryId}`;
check("queda en borrador, con origen «ajuste_inflacion»", je.status === "borrador" && je.source === "ajuste_inflacion");
await inf.runAdjustment(A, actorA, END);
check("rehacerlo no duplica el asiento", (await sql`select count(*)::int as n from journal_entries where organization_id = ${A.organizationId} and source = 'ajuste_inflacion' and status <> 'anulado'`)[0].n === 1);
check("el papel de trabajo queda guardado con los índices usados", (await sql`select jsonb_typeof(indexes) as t, recpam::int as recpam from inflation_adjustments where organization_id = ${A.organizationId} and year_end = ${END}`)[0]?.recpam === expected);
check("el ajuste queda en la auditoría", (await sql`select 1 from audit_log where action = 'contabilidad.ajuste_inflacion' and organization_id = ${A.organizationId}`).length > 0);

// ─── Nominal vs homogéneo ───
const cmp = r1.compare.find((x) => x.code === rodados)!;
check("nominal y homogéneo lado a lado", cmp.nominal === 30_000_000 && cmp.homogeneous === 30_000_000 + adjRodado);

// ─── Agente ───
const ctxA = { studioId: A.studioId, actor: { ...actorA, role: "dueno" as const }, origin: "agente" as const, organizationIds: null, modules: null, canWrite: true };
check("desde el chat del Vigía pide confirmación antes de armar el asiento", (await executeTool("ajustar_por_inflacion", { organizacion_id: A.organizationId, cierre: END }, { ...ctxA, origin: "asistente" as const })).status === "confirmacion");
const t = await executeTool("ajustar_por_inflacion", { organizacion_id: A.organizationId, cierre: END }, ctxA);
const tr = (t as { status: string; result?: { recpam: number; resultado_recpam: string } }).result;
check("el Agente ajusta por inflación el ejercicio (borrador)", t.status === "ok" && tr?.recpam === expected / 100 && tr?.resultado_recpam === "pérdida", JSON.stringify(t).slice(0, 200));
const { AGENT_TEMPLATES } = await import("../../src/modules/agent/catalog.ts");
check("y está en las tareas del Agente («ajustá por inflación…»)", AGENT_TEMPLATES.find((x) => x.key === "ajuste_inflacion")?.keywords.test("ajustá por inflación el ejercicio de sur") === true);

// ─── Registrar y estados homogéneos ───
const [cur] = await sql`select id from journal_entries where organization_id = ${A.organizationId} and source = 'ajuste_inflacion' and status = 'borrador'`;
await cb.registerEntry(A, actorA, cur.id);
check("registrado, no se rehace sin anularlo", /ya está registrado/.test((await throws(() => inf.runAdjustment(A, actorA, END))) ?? ""));
const st = await cb.statementsOf(A, "2026-01-01", END);
check("los estados con el ajuste siguen cerrando", st.cierra);
const p2 = await inf.previewAdjustment(A, END);
check("con el ajuste registrado, el nominal no lo incluye y el homogéneo coincide", p2.compare.find((x) => x.code === rodados)?.nominal === 30_000_000 && p2.recpam === expected);

// ─── Papel de trabajo ───
const report = await rep.accountingReport(A, "Inflación Prueba SA", "inflacion", { from: "2026-01-01", to: END });
check("papel de trabajo: índices, reexpresión, nominal/homogéneo y asiento", report.sections.length === 4 && report.sections[0].rows.length === 13);
check("se exporta a Excel y PDF", (await reportToXlsx(report)).length > 1000 && (await reportToPdf(report)).length > 1000);

// ─── Aislamiento forzando IDs ───
const foreign = { studioId: d.studios.B, organizationId: A.organizationId };
check("otro estudio no calcula el ajuste ajeno", /no es de este estudio/.test((await throws(() => inf.previewAdjustment(foreign, END))) ?? ""));
check("ni carga índices para esa organización", /no es de este estudio/.test((await throws(() => inf.saveOwnIndexes(foreign, actorB, END, "2026-05;1"))) ?? ""));
check("ni cambia su clasificación", /no es de este estudio/.test((await throws(() => inf.setClassification(foreign, actorB, new Set()))) ?? ""));
const ctxB = { studioId: d.studios.B, actor: { ...actorB, role: "dueno" as const }, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };
check("ni lo pide por el Agente", (await executeTool("ajustar_por_inflacion", { organizacion_id: A.organizationId, cierre: END }, ctxB)).status !== "ok");

await sql.end();
console.log(fails ? `\n${fails} verificaciones fallaron` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
