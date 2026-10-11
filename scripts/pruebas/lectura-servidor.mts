// F6 del lado del servidor: herramientas del Vigía (lectura y conciliación) y
// aislamiento forzando IDs en las funciones que reciben IDs del navegador.
// Correr después de lectura-navegador.mjs (usa sus datos).
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/lectura-servidor.mts

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { BankRecError, confirmMatch, deleteRule, markMovement } from "../../src/modules/bank-rec/server.ts";
import { confirmDoc, discardDoc, getDoc, readExisting, SmartDocError } from "../../src/modules/smart-docs/server.ts";
import { executeTool } from "../../src/modules/tools/index.ts";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!);
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};
const A = d.studios.A;
const B = d.studios.B;
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A", role: "dueno" as const };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com", name: "Admin B", role: "dueno" as const };
const ctxA = { studioId: A, actor: actorA, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };
const ctxB = { studioId: B, actor: actorB, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };
const colab = { ...ctxA, actor: { id: d.users.colaboradorA, email: "c@ejemplo.com", name: "Colab", role: "colaborador" as const } };

// Vigía
const pend = await executeTool("comprobantes_para_confirmar", { organizacion_id: d.orgs.norte }, ctxA);
check("Vigía: comprobantes para confirmar", pend.status === "ok" && (pend as { result: { total: number } }).result.total >= 1, JSON.stringify(pend).slice(0, 160));
const est = await executeTool("estado_conciliacion", { organizacion_id: d.orgs.norte }, ctxA);
const res = (est as { result?: { ultimo_extracto?: { pagadas: number } } }).result;
check("Vigía: estado de la conciliación con el último extracto", est.status === "ok" && res?.ultimo_extracto?.pagadas === 2, JSON.stringify(est).slice(0, 200));
check("Vigía: conciliación negada a un colaborador", (await executeTool("estado_conciliacion", { organizacion_id: d.orgs.norte }, colab)).status === "denegado");
check("Vigía: otro estudio no ve la conciliación", (await executeTool("estado_conciliacion", { organizacion_id: d.orgs.norte }, ctxB)).status !== "ok");
const [docA] = await sql`select id from documents where studio_id = ${A} and organization_id = ${d.orgs.norte} and name = 'edenor-77.pdf' limit 1`;
const leer = await executeTool("leer_comprobante", { documento_id: docA.id }, ctxB);
check("Vigía: leer un documento de otro estudio → no", leer.status !== "ok" && leer.status !== "aprobacion");
const leerA = await executeTool("leer_comprobante", { documento_id: docA.id }, ctxA);
check("Vigía: leer un documento propio pide confirmación en el chat (escritura, no sensible)", leerA.status === "confirmacion", JSON.stringify(leerA).slice(0, 160));

// Lectura forzando IDs
const scopeB = { studioId: B, organizationId: d.orgs.ajena, ownerUserId: null, scope: "organizacion" as const, canConfirm: true };
const scopeA = { studioId: A, organizationId: d.orgs.norte, ownerUserId: null, scope: "organizacion" as const, canConfirm: true };
const [pendingA] = await sql`select id, extracted from smart_documents where studio_id = ${A} and status = 'para_confirmar' limit 1`;
check("getDoc de otro estudio → null", (await getDoc(scopeB, pendingA.id)) === null);
let threw = false;
try {
  await confirmDoc(scopeB, actorB, pendingA.id, pendingA.extracted, "Compras");
} catch (e) {
  threw = e instanceof SmartDocError;
}
check("confirmar un documento de otro estudio → error", threw);
await discardDoc(scopeB, actorB, pendingA.id);
check("descartar uno de otro estudio no lo toca", (await sql`select status from smart_documents where id = ${pendingA.id}`)[0].status === "para_confirmar");
threw = false;
try {
  await readExisting(scopeB, actorB, docA.id);
} catch (e) {
  threw = e instanceof SmartDocError;
}
check("leer un documento de otra organización → error", threw);
threw = false;
try {
  await confirmDoc({ ...scopeA, canConfirm: false }, actorA, pendingA.id, pendingA.extracted, "Compras");
} catch (e) {
  threw = e instanceof SmartDocError;
}
check("sin permiso de confirmar → error", threw);

// Conciliación forzando IDs
const [mov] = await sql`select id, status from bank_movements where organization_id = ${d.orgs.norte} and status = 'sin_conciliar' limit 1`;
threw = false;
try {
  await markMovement({ studioId: B, organizationId: d.orgs.ajena }, actorB, mov.id, "ignorado");
} catch (e) {
  threw = e instanceof BankRecError;
}
check("marcar un movimiento de otro estudio → error", threw && (await sql`select status from bank_movements where id = ${mov.id}`)[0].status === mov.status);
const [inv] = await sql`select id from invoices where organization_id = ${d.orgs.norte} and status = 'autorizada' limit 1`;
const [movSur] = await sql`insert into bank_statements (studio_id, organization_id, bank, file_name) values (${A}, ${d.orgs.sur}, 'X', 'x.csv') returning id`;
const [m2] = await sql`insert into bank_movements (statement_id, studio_id, organization_id, date, description, amount, cls, external_id) values (${movSur.id}, ${A}, ${d.orgs.sur}, current_date, 'TRANSF', 15000000, 'cobro', ${`t${Date.now()}`}) returning id`;
threw = false;
try {
  await confirmMatch({ studioId: A, organizationId: d.orgs.sur }, actorA, m2.id, inv.id);
} catch (e) {
  threw = e instanceof BankRecError;
}
check("cruzar con un comprobante de otra organización → error", threw);
const [rule] = await sql`select id from bank_rules where studio_id = ${A} limit 1`;
await deleteRule({ studioId: B, organizationId: d.orgs.ajena }, actorB, rule.id);
check("borrar una regla de otro estudio no la borra", (await sql`select count(*)::int n from bank_rules where id = ${rule.id}`)[0].n === 1);
await sql`delete from bank_statements where id = ${movSur.id}`;

await sql.end();
console.log(fails ? `\n${fails} fallaron` : "\nTodo bien");
process.exit(fails ? 1 : 0);
