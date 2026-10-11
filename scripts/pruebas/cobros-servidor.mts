// F7 del lado del servidor: tareas periódicas de suscripciones (fin de prueba,
// gracia, suspensión, cancelación) y de honorarios (recordatorios
// escalonados sin repetir), herramientas del Vigía (enviar un cobro va a
// Aprobaciones), webhooks firmados entre cuentas y aislamiento forzando IDs.
// Correr después de cobros-navegador.mjs (usa sus cuentas y cargos).
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/cobros-servidor.mts

import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { markPaid, runFeeJobs, sendCharge, voidCharge } from "../../src/modules/billing/fees.ts";
import { BillingError } from "../../src/modules/billing/mp.ts";
import { runSubscriptionJobs } from "../../src/modules/billing/subscriptions.ts";
import { decideApproval, executeTool } from "../../src/modules/tools/index.ts";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!);
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};
const A = d.studios.A;
const SB = d.studios.B;
const P = d.studios.personal;
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A", role: "dueno" as const };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com", name: "Admin B", role: "dueno" as const };
const ctxA = { studioId: A, actor: actorA, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };
const ago = (days: number) => new Date(Date.now() - days * 86400000);

// ─── Suscripciones ───
await sql`update faro_subscriptions set status = 'activa', cancel_at_period_end = false, past_due_since = ${ago(8)}, current_period_end = ${new Date(Date.now() + 20 * 86400000)} where studio_id = ${SB}`;
await runSubscriptionJobs();
let [s] = await sql`select status from faro_subscriptions where studio_id = ${SB}`;
let [t] = await sql`select status, suspended_reason from studios where id = ${SB}`;
check("más de 7 días sin pagar → suspendida", s.status === "suspendida" && t.status === "suspendido" && /Pago pendiente/.test(t.suspended_reason ?? ""), JSON.stringify({ s, t }));
await sql`update faro_subscriptions set status = 'morosa', past_due_since = ${ago(3)} where studio_id = ${SB}`;
await sql`update studios set status = 'activo', suspended_reason = null where id = ${SB}`;
await runSubscriptionJobs();
[s] = await sql`select status from faro_subscriptions where studio_id = ${SB}`;
check("dentro de la gracia: sigue morosa", s.status === "morosa");
await sql`update faro_subscriptions set status = 'activa', past_due_since = null, cancel_at_period_end = true, current_period_end = ${ago(1)} where studio_id = ${SB}`;
await runSubscriptionJobs();
[s] = await sql`select status from faro_subscriptions where studio_id = ${SB}`;
[t] = await sql`select status, plan_key from studios where id = ${SB}`;
// Con Inicial gratis (principios §20), un estudio que cancela vuelve a Inicial en vez de suspenderse
check("cancelada al terminar el período: el estudio vuelve a Inicial gratis", s.status === "cancelada" && t.status === "activo" && t.plan_key === "inicial", JSON.stringify(t));
await sql`update studios set status = 'activo', suspended_reason = null, plan_key = 'inicial' where id = ${SB}`;
// Autónomo en prueba de Pro que no pagó: vuelve a Gratis
await sql`delete from faro_subscriptions where studio_id = ${P}`;
await sql`insert into faro_subscriptions (studio_id, plan_key, status, trial_ends_at) values (${P}, 'autonomo_pro', 'prueba', ${ago(1)})`;
await sql`update studios set plan_key = 'autonomo_pro', status = 'prueba' where id = ${P}`;
await runSubscriptionJobs();
const [ps] = await sql`select status, plan_key from faro_subscriptions where studio_id = ${P}`;
const [pt] = await sql`select status, plan_key from studios where id = ${P}`;
check("autónomo sin pagar al terminar la prueba → Gratis, sin suspender", ps.status === "activa" && ps.plan_key === "autonomo_gratis" && pt.status === "activo" && pt.plan_key === "autonomo_gratis", JSON.stringify({ ps, pt }));
// Aviso de fin de prueba una sola vez
await sql`delete from faro_subscriptions where studio_id = ${P}`;
await sql`insert into faro_subscriptions (studio_id, plan_key, status, trial_ends_at) values (${P}, 'autonomo_pro', 'prueba', ${new Date(Date.now() + 5 * 86400000)})`;
await runSubscriptionJobs();
await runSubscriptionJobs();
const [pn] = await sql`select notices from faro_subscriptions where studio_id = ${P}`;
check("aviso de fin de prueba (7 días) una sola vez", JSON.stringify(pn.notices) === JSON.stringify(["prueba-7"]), JSON.stringify(pn.notices));
await sql`delete from faro_subscriptions where studio_id = ${P}`;
await sql`update studios set plan_key = 'autonomo_gratis', status = 'activo' where id = ${P}`;

// ─── Honorarios: recordatorios escalonados ───
const due = new Date(Date.now() + 3 * 86400000 - 3 * 3600_000).toISOString().slice(0, 10);
const [c] = await sql`insert into fee_charges (studio_id, organization_id, concept, amount, due_date) values (${A}, ${d.orgs.norte}, 'Recordatorio de prueba', 500000, ${due}) returning id`;
await runFeeJobs();
let [cr] = await sql`select reminders_sent from fee_charges where id = ${c.id}`;
check("recordatorio 3 días antes", JSON.stringify(cr.reminders_sent) === "[-3]", JSON.stringify(cr.reminders_sent));
await runFeeJobs();
[cr] = await sql`select reminders_sent from fee_charges where id = ${c.id}`;
check("no se repite el mismo paso", JSON.stringify(cr.reminders_sent) === "[-3]");
await sql`update billing_settings set reminders = false where studio_id = ${A}`;
await sql`update fee_charges set due_date = current_date where id = ${c.id}`;
await runFeeJobs();
[cr] = await sql`select reminders_sent from fee_charges where id = ${c.id}`;
check("con los recordatorios apagados no se manda", JSON.stringify(cr.reminders_sent) === "[-3]");
await sql`update billing_settings set reminders = true where studio_id = ${A}`;

// ─── Vigía ───
const pend = await executeTool("cobros_pendientes", {}, ctxA);
check("Vigía: cobros pendientes", pend.status === "ok" && (pend as { result: { total: number } }).result.total >= 1);
const est = await executeTool("estado_de_cuenta", { organizacion_id: d.orgs.norte }, ctxA);
check("Vigía: estado de cuenta", est.status === "ok" && (est as { result: { pagado: number } }).result.pagado === 110000, JSON.stringify(est).slice(0, 160));
const env = await executeTool("enviar_cobro", { cargo_id: c.id }, ctxA);
check("Vigía: enviar un cobro va a Aprobaciones", env.status === "aprobacion");
const before = (await sql`select last_reminder_at from fee_charges where id = ${c.id}`)[0].last_reminder_at;
const dec = await decideApproval((env as { approvalId: string }).approvalId, { ...actorA, studioId: A }, { approve: true });
const after = (await sql`select last_reminder_at from fee_charges where id = ${c.id}`)[0].last_reminder_at;
check("al aprobarlo se envía", (dec as { status: string }).status !== "error" && after > before, JSON.stringify(dec).slice(0, 120));
const ctxB = { ...ctxA, studioId: SB, actor: actorB };
check("Vigía: otro estudio no puede enviar el cobro de A", (await executeTool("enviar_cobro", { cargo_id: c.id }, ctxB)).status !== "aprobacion");

// ─── Aislamiento forzando IDs ───
for (const [label, fn] of [
  ["enviar un cargo de otro estudio", () => sendCharge(SB, c.id, actorB)],
  ["marcar pagado un cargo de otro estudio", () => markPaid(SB, actorB, c.id, "efectivo")],
  ["anular un cargo de otro estudio", () => voidCharge(SB, actorB, c.id)],
] as const) {
  let threw = false;
  try {
    await fn();
  } catch (e) {
    threw = e instanceof BillingError || (e as Error).name === "BillingError" || /no está pendiente/.test((e as Error).message);
    if (!threw) console.log((e as Error).message);
  }
  check(`${label} → error`, threw);
}
check("el cargo sigue pendiente", (await sql`select status from fee_charges where id = ${c.id}`)[0].status === "pendiente");

// ─── Webhook de un cargo de A notificado a la cuenta de otro tenant ───
const [hon] = await sql`select mp_payment_id from mp_payments where kind = 'hon' and studio_id = ${A} limit 1`;
const ts = String(Date.now());
const rid = randomUUID();
const sig = createHmac("sha256", "mock-webhook-secret").update(`id:${hon.mp_payment_id};request-id:${rid};ts:${ts};`).digest("hex");
const res = await fetch(`http://localhost:3000/api/mercadopago/webhook?cuenta=${P}&data.id=${hon.mp_payment_id}&type=payment`, { method: "POST", headers: { "Content-Type": "application/json", "x-signature": `ts=${ts},v1=${sig}`, "x-request-id": rid }, body: "{}" });
const body = (await res.json()) as { result: string };
check("un pago de honorarios de A notificado a otra cuenta no se aplica", body.result === "referencia de otra cuenta", body.result);
const old = String(Date.now() - 3600_000);
const sigOld = createHmac("sha256", "mock-webhook-secret").update(`id:${hon.mp_payment_id};request-id:${rid};ts:${old};`).digest("hex");
const replay = await fetch(`http://localhost:3000/api/mercadopago/webhook?cuenta=${A}&data.id=${hon.mp_payment_id}&type=payment`, { method: "POST", headers: { "x-signature": `ts=${old},v1=${sigOld}`, "x-request-id": rid }, body: "{}" });
check("firma vieja (repetición) → 401", replay.status === 401);

await sql`delete from fee_charges where id = ${c.id}`;
await sql.end();
console.log(fails ? `\n${fails} fallaron` : "\nTodo bien");
process.exit(fails ? 1 : 0);
