// §2.q etapa 3: conciliación con tolerancias y asientos de ajuste. Sugerencia
// dentro de la tolerancia (con puntaje y motivo), fuera de la tolerancia no
// cruza, asiento de ajuste en borrador o automático según el interruptor, uno
// con muchos, muchos con uno, deshacer y aislamiento forzando IDs.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/conciliacion-tolerancias.mts

import { createHash } from "node:crypto";
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
const br = await import("../../src/modules/bank-rec/server.ts");
const { setAutomation } = await import("../../src/modules/agent/automations.ts");

const A = { studioId: d.studios.A, organizationId: d.orgs.sur };
const B = { studioId: d.studios.B, organizationId: d.orgs.ajena };
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", role: "dueno", studioId: d.studios.A };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com" };

// Limpieza y módulo
await sql`insert into tenant_modules (studio_id, module_key, enabled) values (${A.studioId}, 'bank_rec', true), (${B.studioId}, 'bank_rec', true) on conflict (studio_id, module_key) do update set enabled = true, expires_at = null`;
await sql`delete from journal_entries where organization_id = ${A.organizationId}`;
await sql`delete from bank_matches where organization_id = ${A.organizationId}`;
await sql`delete from bank_statements where organization_id = ${A.organizationId}`;
await sql`delete from bank_accounts where organization_id = ${A.organizationId}`;
await sql`delete from smart_documents where organization_id = ${A.organizationId} and file_name like 'conc-%'`;
await sql`delete from automation_switches where studio_id = ${A.studioId} and action = 'conciliacion.ajuste'`;

// Comprobantes recibidos confirmados (los candidatos de los pagos)
const docs: Record<string, string> = {};
async function received(key: string, name: string, cuit: string, total: number, fecha: string) {
  const [r] = await sql`insert into smart_documents (studio_id, organization_id, scope, storage_path, file_name, mime_type, size_bytes, sha256, status, extracted, supplier_cuit, confirmed_at)
    values (${A.studioId}, ${A.organizationId}, 'organizacion', 'x', ${`conc-${key}.pdf`}, 'application/pdf', 1, ${createHash("sha256").update(key).digest("hex")}, 'confirmado', ${sql.json({ tipo_documento: "factura", cuit_emisor: cuit, razon_social_emisor: name, fecha, total, numero: null, iva: [], percepciones: [] })}, ${cuit}, now()) returning id`;
  docs[key] = r.id;
}
await received("papelera", "Papelera Sur SA", "30712345671", 10000, "2026-10-01");
await received("lejana", "Imprenta Lejana", "30709998885", 7777, "2026-09-01");
await received("oeste1", "Distribuidora Oeste SA", "30500010912", 10000, "2026-10-02");
await received("oeste2", "Distribuidora Oeste SA", "30500010912", 12000, "2026-10-03");
await received("oeste3", "Distribuidora Oeste SA", "30500010912", 8000, "2026-10-04");
await received("norte", "Imprenta Norte SRL", "30711111112", 50000, "2026-10-05");
await received("redondeo", "Kiosco Central", "20111111112", 4999.6, "2026-10-06");

const csv = `Fecha,Descripción,Importe
03/10/2026,PAGO PAPELERA SUR,-10015.00
12/10/2026,PAGO IMPRENTA LEJANA,-7777.00
10/10/2026,TRANSF 30500010912 DISTRIBUIDORA OESTE,-30000.00
07/10/2026,TRANSF IMPRENTA NORTE ANTICIPO,-20000.00
09/10/2026,TRANSF IMPRENTA NORTE SALDO,-30000.00
07/10/2026,PAGO KIOSCO CENTRAL,-5000.00
`;
const st = await br.importStatement(A, actorA, new File([csv], "extracto-octubre.csv", { type: "text/csv" }), "Banco Nación", "CC 123");
const [acc] = await br.listAccounts(A);
check("la cuenta bancaria se crea con el extracto", !!acc && acc.bank === "Banco Nación" && acc.label === "CC 123");
await br.saveAccount(A, actorA, acc.id, { days: 5, kind: "fijo", value: 20, ledger: "Banco Nación CC", rounding: "Diferencias de redondeo", fees: "Gastos bancarios", receivable: "Deudores por ventas", payable: "Proveedores" });
const mov = async (desc: string) => (await sql`select * from bank_movements where statement_id = ${st.id} and description = ${desc}`)[0];

// ─── Tolerancias ───
const pap = await mov("PAGO PAPELERA SUR");
check("dentro de la tolerancia: sugerencia con puntaje y motivo", pap.status === "sugerido" && pap.match_id === docs.papelera && Number(pap.match_score) > 0.6 && pap.match_reasons.some((r: string) => r.includes("diferencia de $ 15,00")), JSON.stringify(pap.match_reasons));
const lej = await mov("PAGO IMPRENTA LEJANA");
check("fuera de la tolerancia de fecha (11 días con 5 de tolerancia): no sugiere", lej.status === "sin_conciliar");
await br.saveAccount(A, actorA, acc.id, { days: 5, kind: "fijo", value: 10, ledger: "Banco Nación CC", rounding: "Diferencias de redondeo", fees: "Gastos bancarios", receivable: "Deudores por ventas", payable: "Proveedores" });
check("con $ 10 de tolerancia, la diferencia de $ 15 ya no se sugiere", (await mov("PAGO PAPELERA SUR")).status === "sin_conciliar");
check("y no se puede conciliar a mano: supera la tolerancia", /supera la tolerancia/.test((await throws(() => br.confirmMatch(A, actorA, pap.id, docs.papelera))) ?? ""));
await br.saveAccount(A, actorA, acc.id, { days: 5, kind: "fijo", value: 20, ledger: "Banco Nación CC", rounding: "Diferencias de redondeo", fees: "Gastos bancarios", receivable: "Deudores por ventas", payable: "Proveedores" });

// ─── Asiento de ajuste en borrador ───
const r1 = await br.confirmMatch(A, actorA, pap.id);
const [e1] = await sql`select status, lines, source from journal_entries where id = ${r1.entryId}`;
check("diferencia de $ 15: asiento de ajuste en borrador", r1.difference === 1500 && e1?.status === "borrador" && e1.source === "conciliacion");
check("asiento: gastos bancarios contra proveedores, debe = haber", e1.lines[0].account === "Gastos bancarios" && e1.lines[0].debit === 1500 && e1.lines[1].account === "Proveedores" && e1.lines[1].credit === 1500);
await br.registerEntry(A, actorA, r1.entryId!);
check("registrar el asiento", (await sql`select status from journal_entries where id = ${r1.entryId}`)[0].status === "registrado");
check("registrarlo dos veces: error claro", (await throws(() => br.registerEntry(A, actorA, r1.entryId!))) !== null);

// ─── Interruptor: el ajuste se registra solo ───
await setAutomation(actorA, { action: "conciliacion.ajuste", organizationId: A.organizationId, state: "activa" });
const kio = await mov("PAGO KIOSCO CENTRAL");
check("redondeo de $ 0,40 sugerido", kio.status === "sugerido" && kio.match_id === docs.redondeo);
const r2 = await br.confirmMatch(A, actorA, kio.id);
const [e2] = await sql`select status, lines from journal_entries where id = ${r2.entryId}`;
check("con la automatización activa, el ajuste queda registrado", e2.status === "registrado" && e2.lines[0].account === "Diferencias de redondeo" && e2.lines[0].debit === 40);
check("…y la automatización queda en la auditoría", (await sql`select 1 from audit_log where action = 'automatizacion.ejecutar' and entity_id = ${r2.entryId}`).length === 1);

// ─── Uno con muchos ───
const oeste = await mov("TRANSF 30500010912 DISTRIBUIDORA OESTE");
const g1 = oeste.group_suggestion;
check("un pago por tres comprobantes: sugerencia de grupo", oeste.status === "sugerido" && g1?.kind === "1:N" && [docs.oeste1, docs.oeste2, docs.oeste3].every((x) => g1.candidateIds.includes(x)), JSON.stringify(g1));
const r3 = await br.confirmGroup(A, actorA, g1.movementIds, g1.candidateIds);
const [m3] = await sql`select kind, difference from bank_matches where id = ${r3.matchId}`;
check("conciliado uno con muchos, sin diferencia ni asiento", m3.kind === "1:N" && Number(m3.difference) === 0 && !r3.entryId);

// ─── Muchos con uno ───
const ant = await mov("TRANSF IMPRENTA NORTE ANTICIPO");
const g2 = ant.group_suggestion;
check("dos pagos por un comprobante: sugerencia de grupo", g2?.kind === "N:1" && g2.candidateIds[0] === docs.norte && g2.movementIds.length === 2, JSON.stringify(g2));
const r4 = await br.confirmGroup(A, actorA, g2.movementIds, g2.candidateIds);
check("conciliado muchos con uno", (await sql`select count(*)::int n from bank_movements where match_group_id = ${r4.matchId} and status = 'conciliado'`)[0].n === 2);
check("un comprobante ya conciliado no se vuelve a usar", (await throws(() => br.confirmGroup(A, actorA, [lej.id], [docs.norte]))) !== null);
check("no se mezclan muchos con muchos", (await throws(() => br.confirmGroup(A, actorA, [lej.id, pap.id], [docs.oeste1, docs.oeste2]))) !== null);

// ─── Deshacer ───
await br.markMovement(A, actorA, ant.id, "sin_conciliar");
check("deshacer el grupo: los dos movimientos vuelven", (await sql`select count(*)::int n from bank_movements where id in ${sql(g2.movementIds)} and match_group_id is null`)[0].n === 2 && (await sql`select 1 from bank_matches where id = ${r4.matchId}`).length === 0);
await br.markMovement(A, actorA, kio.id, "sin_conciliar");
check("deshacer con el ajuste registrado: el asiento queda anulado", (await sql`select status from journal_entries where id = ${r2.entryId}`)[0].status === "anulado");
const view = await br.statementView(A, st.id);
check("el extracto muestra los grupos y los asientos", !!view && view.groups.length >= 2 && view.entries.length >= 1);

// ─── Aislamiento forzando IDs ───
check("otro estudio no concilia movimientos ajenos", (await throws(() => br.confirmGroup(B, actorB, [lej.id], [docs.lejana]))) !== null);
check("otro estudio no cambia las tolerancias", (await throws(() => br.saveAccount(B, actorB, acc.id, { days: 120, kind: "porcentaje", value: 20, ledger: "", rounding: "", fees: "", receivable: "", payable: "" }))) !== null);
check("otro estudio no registra asientos ajenos", (await throws(() => br.registerEntry(B, actorB, r1.entryId!))) !== null);
check("otra organización del mismo estudio tampoco", (await throws(() => br.confirmGroup({ ...A, organizationId: d.orgs.norte }, actorA, [lej.id], [docs.lejana]))) !== null);
check("otro estudio no ve el extracto", (await br.statementView(B, st.id)) === null);
check("IDs mal formados: error claro", (await throws(() => br.confirmGroup(A, actorA, ["x' or 1=1"], [docs.lejana]))) !== null);

await sql`delete from automation_switches where studio_id = ${A.studioId} and action = 'conciliacion.ajuste'`;
await sql.end();
console.log(fails ? `\n${fails} fallas` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
