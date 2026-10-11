// Principios de producto (docs/principios-producto.md) del lado del servidor,
// etapa por etapa. Correr después de datos.mjs (usa sus estudios).
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/principios-servidor.mts [etapa]

import { readFileSync } from "node:fs";
import postgres from "postgres";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};
const only = process.argv[2];
const stage = (n: string) => !only || only === n;
const SB = d.studios.B;

// ─── Etapa 1 · Inicial gratis (§20) ───
if (stage("1")) {
  const { normalizeFreeSubscriptions, runSubscriptionJobs, ensureSubscription } = await import("../../src/modules/billing/subscriptions.ts");
  const { getPlan } = await import("../../src/lib/faro/plans.ts");
  const { createTenant } = await import("../../src/lib/faro/tenants.ts");
  const { checkLimit } = await import("../../src/lib/faro/entitlements.ts");
  const p = getPlan("inicial")!;
  check("plans.ts: Inicial gratis, sin prueba ni extra, 5 organizaciones y 1 usuario", p.priceUsd === 0 && p.free && p.trialDays === 0 && p.extraOrgUsd === null && p.limits.organizations === 5 && p.limits.staffUsers === 1);
  const [fp] = await sql`select price_usd, free, trial_days, extra_org_usd, limits from faro_plans where key = 'inicial'`;
  check("faro_plans (migración 0035): Inicial gratis", Number(fp.price_usd) === 0 && fp.free && fp.trial_days === 0 && fp.extra_org_usd === null && fp.limits.organizations === 5);

  // Estado viejo: estudio en Inicial con prueba y débito de Mercado Pago
  await sql`delete from faro_subscriptions where studio_id = ${SB}`;
  await sql`delete from audit_log where studio_id = ${SB} and action in ('plan.inicial_gratis', 'suscripcion.plan_gratis')`;
  await sql`update studios set plan_key = 'inicial', status = 'prueba', trial_ends_at = now() + interval '3 days', suspended_reason = null where id = ${SB}`;
  await sql`insert into faro_subscriptions (studio_id, plan_key, status, amount, trial_ends_at, mp_preapproval_id, mp_status) values (${SB}, 'inicial', 'prueba', 6860000, now() + interval '3 days', 'pa-viejo', 'authorized')`;
  const mig = readFileSync(new URL("../../drizzle/0035_inicial_gratis.sql", import.meta.url), "utf8").split("--> statement-breakpoint");
  for (const st of mig.slice(1)) await sql.unsafe(st);
  const [t1] = await sql`select status, trial_ends_at from studios where id = ${SB}`;
  check("migración: el estudio en prueba de Inicial queda activo sin prueba", t1.status === "activo" && t1.trial_ends_at === null);
  check("migración: auditada", (await sql`select count(*)::int n from audit_log where studio_id = ${SB} and action = 'plan.inicial_gratis'`)[0].n >= 1);
  // Sin cuenta de Mercado Pago el débito no se puede cancelar: queda para reintentar
  const n = await normalizeFreeSubscriptions();
  const [s0] = await sql`select status, amount, mp_status, trial_ends_at from faro_subscriptions where studio_id = ${SB}`;
  check("suscripción: activa y sin cobro; débito sin cancelar queda para reintentar", n >= 1 && s0.status === "activa" && Number(s0.amount) === 0 && s0.mp_status === "authorized" && s0.trial_ends_at === null, JSON.stringify(s0));
  check("suscripción: auditada una vez", (await sql`select count(*)::int n from audit_log where studio_id = ${SB} and action = 'suscripcion.plan_gratis'`)[0].n === 1);
  await normalizeFreeSubscriptions();
  check("reintento sin Mercado Pago: no duplica la auditoría", (await sql`select count(*)::int n from audit_log where studio_id = ${SB} and action = 'suscripcion.plan_gratis'`)[0].n === 1);
  await sql`update faro_subscriptions set mp_status = 'cancelled' where studio_id = ${SB}`;
  check("con el débito cancelado: normalizar no repite nada", (await normalizeFreeSubscriptions()) === 0);
  // Suspendido por fin de prueba → reactivado; suspendido por Faro Manager → se respeta
  await sql`update studios set status = 'suspendido', suspended_reason = 'Terminó la prueba de 30 días' where id = ${SB}`;
  for (const st of mig.slice(1)) await sql.unsafe(st);
  check("migración: suspendido por fin de prueba → activo", (await sql`select status from studios where id = ${SB}`)[0].status === "activo");
  await sql`update studios set status = 'suspendido', suspended_reason = 'Uso indebido' where id = ${SB}`;
  for (const st of mig.slice(1)) await sql.unsafe(st);
  check("migración: suspensión manual del Faro Manager se respeta", (await sql`select status from studios where id = ${SB}`)[0].status === "suspendido");
  await sql`update studios set status = 'activo', suspended_reason = null where id = ${SB}`;
  // Sin avisos de fin de prueba para un plan gratis
  await sql`update faro_subscriptions set notices = '[]'::jsonb where studio_id = ${SB}`;
  await runSubscriptionJobs();
  const [s2] = await sql`select status, notices from faro_subscriptions where studio_id = ${SB}`;
  check("tareas: sin aviso de fin de prueba ni cambio de estado", s2.status === "activa" && s2.notices.length === 0);
  const sub = await ensureSubscription(SB);
  check("ensureSubscription en Inicial: activa", sub.status === "activa");
  // Alta de un estudio nuevo: Inicial, activo, sin prueba
  const email = `inicial-${Date.now()}@prueba.local`;
  const r = await createTenant({ kind: "studio", name: "Estudio Gratis", owner: { name: "Gra Tis", email, password: "una-clave-larga" }, via: "registro" });
  const [nt] = r.ok ? await sql`select plan_key, status, trial_ends_at from studios where id = ${r.studioId}` : [null];
  check("alta de estudio: Inicial activo sin prueba", !!nt && nt.plan_key === "inicial" && nt.status === "activo" && nt.trial_ends_at === null, JSON.stringify(nt));
  // Límite de 5 organizaciones sin organización extra
  if (r.ok) {
    for (let i = 0; i < 5; i++) await sql`insert into organizations (studio_id, name, status) values (${r.studioId}, ${`Org ${i}`}, 'activa')`;
    const msg = await checkLimit(r.studioId, "organizations");
    check("Inicial: la sexta organización pide pasar a Profesional", !!msg && /hasta 5/.test(msg) && /Profesional/.test(msg), msg ?? "");
    await sql`delete from studios where id = ${r.studioId}`;
    await sql`delete from users where email = ${email}`;
  }
}

console.log(fails ? `\n${fails} fallas` : "\nTodo bien");
await sql.end();
process.exit(fails ? 1 : 0);
