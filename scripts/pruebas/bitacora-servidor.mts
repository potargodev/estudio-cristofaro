// Bitácora (F8) del lado del servidor: aislamiento forzando IDs en cada
// función que recibe un ID del navegador, resumen semanal y coach del Vigía.
// Correr después de bitacora-navegador.mjs (usa sus datos).
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/bitacora-servidor.mts

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { decideProposal } from "../../src/modules/bitacora/connections.ts";
import { confirmImport, previewRows, undoImport } from "../../src/modules/bitacora/imports.ts";
import { addToGoal, archiveGoal, markProfessional, PlanningError, saveBudget } from "../../src/modules/bitacora/planning.ts";
import { dismissInsight, setRecurringStatus } from "../../src/modules/bitacora/recurring.ts";
import { revokeShare, sharedAccess } from "../../src/modules/bitacora/shares.ts";
import { weeklySummary } from "../../src/modules/bitacora/weekly.ts";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!);
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};
const T = d.users.titular;
const B = d.users.adminB;
const intruder = { id: B, studioId: d.studios.B, email: "b@ejemplo.com", name: "Intruso", role: "dueno", tenantKind: "studio" };

// Propuesta de otra persona: aceptar forzando el ID no crea nada
const [prop] = await sql`insert into bitacora_proposals (user_id, source, external_id, detected, description, amount, date) values (${T}, 'gmail', ${`x-${Date.now()}`}, 'servicio', 'Prueba', 1000, current_date) returning id`;
await decideProposal(B, prop.id, true, 5000);
const [p2] = await sql`select status from bitacora_proposals where id = ${prop.id}`;
check("propuesta ajena: sigue pendiente", p2.status === "pendiente");
check("y no se creó un movimiento para el intruso", (await sql`select count(*)::int n from bitacora_entries where user_id = ${B} and description = 'Prueba'`)[0].n === 0);

// Importación ajena
const [imp] = await sql`insert into bitacora_imports (user_id, source, file_name, rows, total) values (${T}, 'csv', 'mio.csv', ${sql.json([["Fecha", "D", "I"], ["01/02/2026", "Kiosco", "-100"]])}, 1) returning id`;
check("vista previa ajena: null", (await previewRows(B, imp.id)) === null);
let threw = false;
try {
  await confirmImport(B, imp.id, { date: 0, description: 1, amount: 2, skipHeader: true }, null);
} catch {
  threw = true;
}
check("confirmar importación ajena: error", threw);
check("deshacer importación ajena: 0", (await undoImport(B, imp.id)) === 0);

// Metas, sobres, fijos y avisos ajenos
const [goal] = await sql`select id from bitacora_goals where user_id = ${T} limit 1`;
threw = false;
try {
  await addToGoal(B, goal.id, 100000, null);
} catch (e) {
  threw = e instanceof PlanningError;
}
check("sumar a una meta ajena: error", threw);
await archiveGoal(B, goal.id);
check("archivar meta ajena: no pasa nada", (await sql`select archived from bitacora_goals where id = ${goal.id}`)[0].archived === false);
const [cat] = await sql`select id from bitacora_categories where user_id = ${T} limit 1`;
threw = false;
try {
  await saveBudget(B, cat.id, 100);
} catch {
  threw = true;
}
check("sobre en una categoría ajena: error", threw && (await sql`select count(*)::int n from bitacora_budgets where user_id = ${B}`)[0].n === 0);
const [rec] = await sql`select id, status from bitacora_recurring where user_id = ${T} limit 1`;
await setRecurringStatus(B, rec.id, { status: "descartado" });
check("fijo ajeno: no cambia", (await sql`select status from bitacora_recurring where id = ${rec.id}`)[0].status === rec.status);
const [ins] = await sql`select id from bitacora_insights where user_id = ${T} and status <> 'descartado' limit 1`;
if (ins) {
  await dismissInsight(B, ins.id);
  check("aviso ajeno: sigue visible", (await sql`select status from bitacora_insights where id = ${ins.id}`)[0].status !== "descartado");
}
const [entry] = await sql`select id, professional from bitacora_entries where user_id = ${T} and deleted_at is null limit 1`;
threw = false;
try {
  await markProfessional(intruder, entry.id, { professional: true, deductible: true });
} catch (e) {
  threw = e instanceof PlanningError;
}
check("marcar como profesional un movimiento ajeno: error", threw);

// Compartida: revocada no da acceso; nadie revoca la de otros
const [sh] = await sql`insert into bitacora_shares (owner_id, invited_email, token, permission, member_id, status) values (${T}, 'otra@ejemplo.com', ${`tok${Date.now()}aaaaaaaaaaaaaaaaaa`}, 'cargar', ${d.users.empleadaNorte}, 'activa') returning id`;
check("compartida activa: acceso para quien la aceptó", !!(await sharedAccess(d.users.empleadaNorte, sh.id)));
check("compartida: sin acceso para otra persona", (await sharedAccess(B, sh.id)) === null);
await revokeShare(intruder, sh.id);
check("un tercero no la puede revocar", (await sql`select status from bitacora_shares where id = ${sh.id}`)[0].status === "activa");
await sql`update bitacora_shares set status = 'revocada' where id = ${sh.id}`;
check("revocada: sin acceso", (await sharedAccess(d.users.empleadaNorte, sh.id)) === null);

// Resumen semanal
const w = await weeklySummary(T);
check("resumen semanal con totales y categorías", w.count > 0 && w.lines.length >= 2, w.lines.join(" "));

await sql`delete from bitacora_imports where id = ${imp.id}`;
await sql`delete from bitacora_proposals where id = ${prop.id}`;
await sql.end();
console.log(fails ? `\n${fails} fallaron` : "\nTodo bien");
process.exit(fails ? 1 : 0);
