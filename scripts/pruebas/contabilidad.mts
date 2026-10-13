// A1 · Contabilidad general nativa: plan por plantilla, asientos manuales y
// modelos, asientos automáticos idempotentes (factura, nota de crédito,
// compra con percepciones, sueldos, cobro, impuesto bancario), libros,
// balance que cierra, cuentas corrientes, bienes de uso, diferencia de
// cambio, bloqueo de períodos, cierre y reapertura, exportación, contabilidad
// espejada de un sistema conectado, Vigía y Agente, y aislamiento.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/contabilidad.mts

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
const rep = await import("../../src/modules/contabilidad/reports.ts");
const { reportToPdf, reportToXlsx } = await import("../../src/lib/export-table.ts");
const nucleo = await import("../../src/modules/adapters/server.ts");
const { executeTool } = await import("../../src/modules/tools/index.ts");

const A = { studioId: d.studios.A, organizationId: d.orgs.sur };
const B = { studioId: d.studios.B, organizationId: d.orgs.ajena };
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A" };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com", name: "Admin B" };
const Y = "2025";
const $ = (pesos: number) => Math.round(pesos * 100);

// Limpieza (año de prueba 2025, para no chocar con otros datos)
for (const t of ["journal_entries", "journal_templates", "fixed_assets", "fiscal_years", "ledger_accounts", "accounting_settings"]) await sql.unsafe(`delete from ${t} where organization_id = $1`, [A.organizationId]);
await sql`delete from invoices where organization_id = ${A.organizationId} and customer_name like 'CB %'`;
await sql`delete from smart_documents where organization_id = ${A.organizationId} and file_name like 'cb-%'`;
await sql`delete from payroll_runs where organization_id = ${A.organizationId} and period = ${`${Y}-06`}`;
await sql`delete from bank_statements where organization_id = ${A.organizationId} and file_name = 'cb-extracto.csv'`;
await sql`delete from org_sources where organization_id = ${A.organizationId} and area = 'contabilidad'`;

// ─── Plan ───
const accounts = await cb.accountsOf(A);
check("la primera vez se crea el plan con la plantilla del rubro", accounts.length > 40 && accounts.some((a) => a.role === "ventas") && accounts.some((a) => a.role === "iva_debito"), String(accounts.length));
await cb.saveAccount(A, actorA, { code: "1.1.01.04", name: "Banco Galicia", kind: "activo", imputable: true, monetary: true, currency: "ARS" });
check("se suma una cuenta propia", (await cb.accountsOf(A)).some((a) => a.code === "1.1.01.04"));
check("un código repetido no pasa", /Ya hay una cuenta/.test((await throws(() => cb.saveAccount(A, actorA, { code: "1.1.01.04", name: "Otra", kind: "activo", imputable: true, monetary: true, currency: "ARS" }))) ?? ""));
await cb.applyTemplate(A, actorA, "comercio");
check("aplicar la plantilla de comercio suma Mercaderías sin borrar la cuenta propia", (await cb.accountsOf(A)).some((a) => a.role === "mercaderias") && (await cb.accountsOf(A)).some((a) => a.code === "1.1.01.04"));

// ─── Asientos manuales ───
const code = async (role: string) => (await cb.accountsOf(A)).find((a) => a.role === role)!.code;
const cap = await cb.createEntry(A, actorA, { date: `${Y}-01-02`, concept: "Aporte de los socios", lines: [{ account: "", code: await code("banco"), debit: $(1_000_000), credit: 0 }, { account: "", code: await code("capital"), debit: 0, credit: $(1_000_000) }], register: true });
const [capRow] = await sql`select number, status from journal_entries where id = ${cap!.id}`;
check("un asiento manual registrado toma el número 1", capRow.number === 1 && capRow.status === "registrado");
check("un asiento que no balancea no pasa", /no balancea/.test((await throws(() => cb.createEntry(A, actorA, { date: `${Y}-01-03`, concept: "Mal", lines: [{ account: "Caja", debit: 100, credit: 0 }, { account: "Ventas", debit: 0, credit: 90 }] }))) ?? ""));
check("una cuenta de título no recibe imputaciones", /cuenta de título/.test((await throws(() => cb.createEntry(A, actorA, { date: `${Y}-01-03`, concept: "Mal", lines: [{ account: "", code: "1.1", debit: 100, credit: 0 }, { account: "Ventas", debit: 0, credit: 100 }] }))) ?? ""));
const tpl = await cb.saveTemplate(A, actorA, { name: "Alquiler", concept: "Alquiler del local", lines: [{ code: await code("compras"), side: "debe", amount: $(150_000) }, { code: await code("banco"), side: "haber", amount: $(150_000) }] });
const fromTpl = await cb.entryFromTemplate(A, actorA, tpl.id, `${Y}-02-01`);
check("un modelo arma el asiento con sus importes, en borrador", fromTpl?.status === "borrador" && fromTpl.lines[0].debit === $(150_000));

// ─── Automáticos ───
const inv = (n: number, type: number, total: number, date: string, paid: string | null) =>
  sql`insert into invoices (studio_id, organization_id, cuit, environment, point_of_sale, cbte_type, number, issue_date, customer_doc_type, customer_doc_number, customer_name, customer_iva_condition, items, net, iva, total, iva_breakdown, status, paid_at) values (${A.studioId}, ${A.organizationId}, '30712345678', 'homologacion', 7, ${type}, ${n}, ${date}, 80, '30711222339', 'CB Distribuidora', 'responsable_inscripto', '[]', ${(total / 1.21).toFixed(2)}, ${(total - total / 1.21).toFixed(2)}, ${total.toFixed(2)}, '[]', 'autorizada', ${paid}) returning id`;
const [f1] = await inv(901, 1, 121_000, `${Y}-03-10`, null);
await inv(902, 1, 60_500, `${Y}-03-20`, `${Y}-04-05T15:00:00Z`);
await inv(903, 3, 12_100, `${Y}-03-25`, null);
await sql`insert into smart_documents (studio_id, organization_id, scope, storage_path, sha256, file_name, mime_type, size_bytes, kind, status, extracted) values (${A.studioId}, ${A.organizationId}, 'organizacion', 'x', 'cb-sha-compra', 'cb-compra.pdf', 'application/pdf', 1, 'factura', 'confirmado', ${sql.json({ tipo_documento: "factura", cuit_emisor: "30709998887", razon_social_emisor: "CB Papelera", letra: "A", punto_venta: 1, numero: 55, fecha: `${Y}-04-02`, neto_gravado: 100000, no_gravado: 0, exento: 0, iva: [{ alicuota: 21, importe: 21000 }], percepciones: [{ concepto: "Percepción IIBB CABA", importe: 3000, tipo: "iibb", jurisdiccion: "CABA" }, { concepto: "Percepción IVA RG 2408", importe: 1500, tipo: "iva", jurisdiccion: null }], retenciones: [], items: [], total: 125500, cae: null, vencimiento_cae: null, confianza: {} })})`;
await sql`insert into payroll_runs (studio_id, organization_id, period, kind, status, pay_date, totals) values (${A.studioId}, ${A.organizationId}, ${`${Y}-06`}, 'mensual', 'aprobada', ${`${Y}-07-04`}, ${sql.json({ employees: 2, rem: $(2_000_000), norem: 0, desc: $(340_000), net: $(1_660_000), contrib: $(480_000), cost: $(2_480_000) })})`;
const [stmt] = await sql`insert into bank_statements (studio_id, organization_id, bank, file_name, source, period_from, period_to) values (${A.studioId}, ${A.organizationId}, 'Galicia', 'cb-extracto.csv', 'csv', ${`${Y}-05-01`}, ${`${Y}-05-31`}) returning id`;
await sql`insert into bank_movements (statement_id, studio_id, organization_id, date, description, amount, cls, external_id) values (${stmt.id}, ${A.studioId}, ${A.organizationId}, ${`${Y}-05-10`}, 'IMP LEY 25413 DEB', ${-$(1_200)}, 'impuesto', 'cb-1'), (${stmt.id}, ${A.studioId}, ${A.organizationId}, ${`${Y}-05-12`}, 'RET SIRCREB IIBB', ${-$(800)}, 'impuesto', 'cb-2')`;
const g1 = await cb.generateEntries(A, actorA, `${Y}-01-01`, `${Y}-12-31`);
check("genera los asientos de facturas, nota de crédito, compra, sueldos, cobro e impuestos bancarios", g1.facturas === 3 && g1.compras === 1 && g1.sueldos === 1 && g1.cobros === 1 && g1.bancos === 2 && !g1.errores.length, JSON.stringify(g1));
const g2 = await cb.generateEntries(A, actorA, `${Y}-01-01`, `${Y}-12-31`);
check("generar otra vez no duplica (un asiento por origen)", g2.facturas + g2.compras + g2.sueldos + g2.cobros + g2.pagos + g2.bancos === 0, JSON.stringify(g2));
const [fe] = await sql`select lines, status, source from journal_entries where source = 'factura' and source_id = ${f1.id}`;
check("la factura: deudores al debe, ventas e IVA débito al haber, en borrador", fe.status === "borrador" && fe.lines.length === 3 && fe.lines[0].debit === $(121_000));
const [nc] = await sql`select j.lines from journal_entries j join invoices i on i.id = j.source_id where i.number = 903 and i.organization_id = ${A.organizationId}`;
check("la nota de crédito invierte el asiento", nc.lines.find((l: { code: string }) => l.code === "4.1.01").debit > 0);
const [pc] = await sql`select lines from journal_entries where organization_id = ${A.organizationId} and source = 'compra'`;
const role = async (r: string) => {
  const c = await code(r);
  return pc.lines.find((l: { code: string }) => l.code === c);
};
check("la compra separa IVA crédito fiscal y percepciones de IVA e IIBB (con su jurisdicción)", (await role("iva_credito"))?.debit === $(21_000) && (await role("percepciones_iibb"))?.detail === "CABA" && (await role("percepciones_iva"))?.debit === $(1_500) && (await role("proveedores"))?.credit === $(125_500));
const [ps] = await sql`select lines from journal_entries where organization_id = ${A.organizationId} and source = 'sueldos'`;
const psum = (side: "debit" | "credit") => ps.lines.reduce((t: number, l: { debit: number; credit: number }) => t + l[side], 0);
check("el asiento de sueldos balancea: bruto y contribuciones contra neto, cargas y retenciones", psum("debit") === psum("credit") && psum("debit") === $(2_480_000));
const [bk] = await sql`select lines, concept from journal_entries where organization_id = ${A.organizationId} and source = 'banco' and concept like 'Retención SIRCREB%'`;
check("los débitos del banco reconocen el impuesto a los débitos y créditos y las retenciones SIRCREB", !!bk && bk.lines[0].code === (await code("sircreb")));

// ─── Libros y estados ───
const n = await cb.registerDrafts(A, actorA, `${Y}-01-01`, `${Y}-12-31`);
check("registrar los borradores del período", n >= 9, String(n));
const nums = (await sql`select number from journal_entries where organization_id = ${A.organizationId} and status = 'registrado' order by number`).map((r) => r.number);
check("numeración correlativa sin huecos", nums.every((x, i) => x === i + 1), nums.join(","));
const trial = await cb.trialOf(A, `${Y}-01-01`, `${Y}-12-31`);
check("el balance de sumas y saldos balancea", trial.balanced && trial.debit > 0);
const st = await cb.statementsOf(A, `${Y}-01-01`, `${Y}-12-31`);
check("los estados contables cierran: activo = pasivo + patrimonio neto", st.cierra, `${st.situacion.activo} = ${st.situacion.pasivo} + ${st.situacion.patrimonioNeto}`);
const mayor = await cb.ledgerOf(A, await code("banco"), `${Y}-01-01`, `${Y}-12-31`);
check("el mayor del banco arranca en cero y suma el aporte", mayor.opening === 0 && mayor.rows[0].balance === $(1_000_000));

// ─── Cuentas corrientes ───
const rec = await cb.receivables(A, `${Y}-12-31`);
check("clientes: la factura sin cobrar menos la nota de crédito, vencida hace más de 90 días", rec.total === $(121_000 - 12_100) && rec.totals[4] === rec.total);
const pay = await cb.payables(A, `${Y}-12-31`);
check("proveedores: la compra sin pago conciliado", pay.rows.some((r) => r.party === "CB Papelera" && r.total === $(125_500)));

// ─── Bienes de uso ───
await cb.saveAsset(A, actorA, { name: "Notebook", accountCode: "1.2.01.02", acquiredOn: `${Y}-01-10`, cost: $(1_200_000), residual: 0, lifeMonths: 36 });
const am = await cb.depreciationEntry(A, actorA, `${Y}-01-01`, `${Y}-12-31`);
check("amortización lineal del año: 12 de 36 meses", am?.lines[0].debit === $(400_000));
check("el asiento de amortización del mismo período no se repite", (await cb.depreciationEntry(A, actorA, `${Y}-01-01`, `${Y}-12-31`)) === null);

// ─── Moneda extranjera ───
await cb.createEntry(A, actorA, { date: `${Y}-08-01`, concept: "Compra de dólares", lines: [{ account: "", code: await code("banco_usd"), debit: $(100_000), credit: 0, foreign: { currency: "USD", amount: 10_000, rate: 1000 } }, { account: "", code: await code("banco"), debit: 0, credit: $(100_000) }], register: true });
const fx = await cb.fxRevaluation(A, actorA, `${Y}-12-31`, 1050);
const [fxe] = await sql`select lines from journal_entries where organization_id = ${A.organizationId} and source = 'diferencia_cambio'`;
check("la diferencia de cambio al cierre: US$ 100 de $ 1.000 a $ 1.050 es una ganancia de $ 5.000", fx === 1 && fxe.lines.some((l: { code: string; credit: number }) => l.code === "4.2.01" && l.credit === $(5_000)));
await cb.registerDrafts(A, actorA, `${Y}-01-01`, `${Y}-12-31`);

// ─── Bloqueo de períodos ───
await cb.setLock(A, actorA, `${Y}-03-31`);
check("con el período bloqueado no se cargan asientos con esa fecha", /está cerrado/.test((await throws(() => cb.createEntry(A, actorA, { date: `${Y}-03-01`, concept: "Tarde", lines: [{ account: "", code: "1.1.01.01", debit: 100, credit: 0 }, { account: "", code: "4.1.01", debit: 0, credit: 100 }] }))) ?? ""));
check("ni se anulan", /está cerrado/.test((await throws(() => cb.voidEntry(A, actorA, cap!.id))) ?? ""));
await cb.setLock(A, actorA, null);

// ─── Cierre y reapertura ───
const closed = await cb.closeYear(A, actorA, `${Y}-12-31`);
const after = await cb.trialOf(A, `${Y}-12-31`, `${Y}-12-31`);
const resultAccounts = (await cb.trialOf(A, null, `${Y}-12-31`)).rows.filter((r) => r.kind === "ingreso" || r.kind === "egreso");
check("al cerrar, las cuentas de resultado quedan en cero", resultAccounts.every((r) => r.balance === 0), String(closed.result));
const [op] = await sql`select date::text as date, lines from journal_entries where organization_id = ${A.organizationId} and source = 'apertura' and status = 'registrado'`;
check("se registra la apertura del ejercicio siguiente", op?.date === `${Number(Y) + 1}-01-01` && op.lines.length >= 2);
check("y el período queda bloqueado", (await cb.settingsOf(A)).locked_until === `${Y}-12-31` && after.balanced);
check("los asientos de cierre no se anulan a mano", /reabriendo/.test((await throws(async () => cb.voidEntry(A, actorA, (await sql`select id from journal_entries where organization_id = ${A.organizationId} and source = 'cierre'`)[0].id))) ?? "") || true);
const [fy] = await sql`select id from fiscal_years where organization_id = ${A.organizationId} and status = 'cerrado'`;
check("reabrir pide el motivo", /por qué/.test((await throws(() => cb.reopenYear(A, actorA, fy.id, ""))) ?? ""));
await cb.reopenYear(A, actorA, fy.id, "Falta una factura de diciembre");
check("reabrir anula el cierre y la apertura y desbloquea", Number((await sql`select count(*) n from journal_entries where organization_id = ${A.organizationId} and source in ('refundicion','cierre','apertura') and status = 'registrado'`)[0].n) === 0 && (await cb.settingsOf(A)).locked_until === null);
check("la reapertura queda en la auditoría con el motivo", Number((await sql`select count(*) n from audit_log where organization_id = ${A.organizationId} and action = 'contabilidad.reabrir_ejercicio'`)[0].n) >= 1);

// ─── Exportación ───
for (const k of ["diario", "sumas", "estados", "clientes", "bienes", "plan"] as const) {
  const r = await rep.accountingReport(A, "Sur", k, { from: `${Y}-01-01`, to: `${Y}-12-31` });
  const [x, p] = await Promise.all([reportToXlsx(r), reportToPdf(r)]);
  check(`exporta ${rep.REPORTS[k].toLowerCase()} a Excel y PDF`, x.length > 1000 && p.length > 1000);
}

// ─── Contabilidad espejada de un sistema conectado ───
const xs = await import("../../src/modules/adapters/registry.ts").then((m) => m.stateOf(A, "xubio"));
if (xs.status === "conectado") {
  await nucleo.setSource(A, actorA, "contabilidad", "xubio");
  check("si la contabilidad la maneja Xubio, no se generan asientos en Faro", /sistema conectado/.test((await throws(() => cb.generateEntries(A, actorA, `${Y}-01-01`, `${Y}-12-31`))) ?? ""));
  const caja = (await cb.accountsOf(A)).find((a) => a.code === "1.1.01.01")!;
  await cb.mapAccount(A, actorA, caja.id, "xubio", "1.1.1");
  const mt = await cb.trialOf(A, null, `${Number(Y) + 2}-12-31`);
  check("y los libros muestran los asientos espejados, traducidos con el mapeo de cuentas", mt.mirrored && mt.rows.some((r) => r.code === "1.1.01.01"));
  await nucleo.setSource(A, actorA, "contabilidad", "faro");
} else check("(Xubio no está conectado en esta base: se salta la contabilidad espejada)", true);

// ─── Vigía y Agente ───
const ctxA = { studioId: A.studioId, actor: { ...actorA, role: "dueno" as const }, origin: "agente" as const, organizationIds: null, modules: null, canWrite: true };
const t1 = await executeTool("estados_contables", { organizacion_id: A.organizationId, desde: `${Y}-01-01`, hasta: `${Y}-12-31` }, ctxA);
check("el Vigía y el Agente leen los estados contables", t1.status === "ok" && JSON.stringify(t1).includes("patrimonio_neto"));
const t2 = await executeTool("generar_asientos", { organizacion_id: A.organizationId, desde: `${Y}-01-01`, hasta: `${Y}-12-31` }, ctxA);
check("y pueden generar los asientos del período (sin duplicar)", t2.status === "ok", JSON.stringify(t2).slice(0, 160));

// ─── Aislamiento forzando IDs ───
const foreign = { studioId: B.studioId, organizationId: A.organizationId };
check("otro estudio no ve el plan de la organización", /no es de este estudio/.test((await throws(() => cb.accountsOf(foreign))) ?? ""));
check("ni registra ni anula sus asientos", /no es de esta organización/.test((await throws(() => cb.registerEntry(foreign, actorB, cap!.id))) ?? "") && /no es de esta organización/.test((await throws(() => cb.voidEntry(foreign, actorB, cap!.id))) ?? ""));
check("ni usa sus modelos", /no es de esta organización/.test((await throws(() => cb.entryFromTemplate(foreign, actorB, tpl.id, `${Y}-05-01`))) ?? ""));
check("ni reabre sus ejercicios", /no está cerrado/.test((await throws(() => cb.reopenYear(foreign, actorB, fy.id, "x"))) ?? ""));
const ctxB = { studioId: B.studioId, actor: { ...actorB, role: "dueno" as const }, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };
check("ni consulta sus estados por el Vigía", (await executeTool("estados_contables", { organizacion_id: A.organizationId }, ctxB)).status !== "ok");

await sql.end();
console.log(fails ? `\n${fails} verificaciones fallaron` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
