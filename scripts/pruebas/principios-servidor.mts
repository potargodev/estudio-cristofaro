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

// ─── Etapa 2 · Escudo de responsabilidad (§1, §1.a, §1.b, §1.c) ───
if (stage("2")) {
  const cat = await import("../../src/modules/escudo/catalog.ts");
  const es = await import("../../src/modules/escudo/server.ts");
  const { semaforo } = await import("../../src/modules/arca/monotributo.ts");
  const { createTenant } = await import("../../src/lib/faro/tenants.ts");
  const c = await import("../../src/modules/copilot/server.ts");
  const { savePlatformAi } = await import("../../src/modules/copilot/platform.ts");

  // Textos: hechos, nunca validaciones
  const scale = [{ letter: "A", maxIncome: 1000 }, { letter: "B", maxIncome: 2000 }];
  const month = new Date().toISOString().slice(0, 7);
  const s1 = semaforo({ byMonth: { [month]: 820 }, category: "A", scale: scale as never });
  check("semáforo: «Según lo que cargaste… el 82 % del tope»", s1.message.startsWith("Según lo que cargaste") && s1.message.includes("82 %"), s1.message);
  const s2 = semaforo({ byMonth: { [month]: 5000 }, category: "A", scale: scale as never });
  check("semáforo: exclusión deriva a un matriculado, sin «hablá cuanto antes»", s2.excluded && /contador matriculado/.test(s2.message));
  for (const m of [s1.message, s2.message]) check("semáforo: no dice que está bien ni en regla", !/est[aá]s bien|en regla|vas bien|te corresponde/i.test(m));

  // Detección de tareas de matriculado y preguntas de criterio
  check("tarea de matriculado: «certificación de ingresos»", cat.matchProfessionalTask("necesito una certificación de ingresos para alquilar")?.key === "certificacion");
  check("tarea de matriculado: «¿me conviene pasar a responsable inscripto?»", cat.matchProfessionalTask("¿Me conviene pasar a responsable inscripto?")?.key === "planificacion_fiscal");
  check("criterio: «¿estoy bien con ARCA?»", cat.asksForCriteria("¿Estoy bien con ARCA?") && !cat.matchProfessionalTask("¿Estoy bien con ARCA?"));
  check("criterio: «¿me van a multar?»", cat.asksForCriteria("che, ¿me van a multar?"));
  check("un gasto común no dispara nada", !cat.asksForCriteria("5000 de nafta") && !cat.matchProfessionalTask("5000 de nafta"));

  // Persona de prueba
  const email = `escudo-${Date.now()}@prueba.local`;
  const r = await createTenant({ kind: "persona", name: "Escu Do", owner: { name: "Escu Do", email, password: "clave-larga-123" }, via: "manual" });
  if (!r.ok) throw new Error(r.message);
  const U = r.userId;

  // Faro Manager: tarea nueva y umbral editado (auditados)
  const faro = { id: d.users.adminA, email: "owner@faro.test" };
  await es.saveProfessionalTask(faro, { key: "sucesiones", title: "Sucesiones", description: "", keywords: "sucesión, sucesion de mi papa", active: true, validation: "a_validar", validatedBy: null });
  check("Faro Manager: tarea nueva detectada", (await es.professionalTaskIn("tengo que hacer la sucesión de mi papá"))?.key === "sucesiones");
  let threw = false;
  try {
    await es.saveProfessionalTask(faro, { key: "x_y", title: "Algo", description: "", keywords: "algo", active: true, validation: "validada", validatedBy: "" });
  } catch (e) {
    threw = e instanceof es.EscudoError;
  }
  check("Faro Manager: validada exige el contador que la validó", threw);
  await es.saveDerivationRule(faro, "monotributo_tope", { title: "Monotributo cerca del tope", message: "Mensaje", need: "Revisar categoría", threshold: 0.75, snoozeDays: 10, active: true, validation: "a_validar", validatedBy: null });
  check("Faro Manager: umbral editado (a validar)", (await es.ruleOf("monotributo_tope")).threshold === 0.75);
  check("Faro Manager: cambios auditados", (await sql`select count(*)::int n from audit_log where action in ('faro.escudo_tarea','faro.escudo_regla') and created_at > now() - interval '1 minute'`)[0].n >= 2);
  await sql`delete from professional_tasks where key = 'sucesiones'`;
  await sql`delete from derivation_rules where key = 'monotributo_tope'`;

  // Sugerencia: aparece, se descarta, no vuelve antes de tiempo y vuelve después
  const sg = await es.suggest(U, "primer_empleado", "Cargaste tu primer empleado.");
  check("sugerencia creada y visible", !!sg && (await es.activeSuggestions(U)).some((x) => x.id === sg!.id));
  check("descartar una sugerencia ajena (forzando el ID): no pasa nada", !(await es.dismissSuggestion(d.users.titular, sg!.id)) && (await es.activeSuggestions(U)).length === 1);
  check("contexto de una sugerencia ajena: null", (await es.ownSuggestion(d.users.titular, sg!.id)) === null);
  await es.dismissSuggestion(U, sg!.id);
  check("descartada: se esconde", (await es.activeSuggestions(U)).length === 0);
  await es.suggest(U, "primer_empleado", "Sigue el empleado.");
  check("la condición sigue, pero antes de tiempo no vuelve", (await es.activeSuggestions(U)).length === 0);
  await sql`update derivation_suggestions set snoozed_until = now() - interval '1 minute' where id = ${sg!.id}`;
  await es.suggest(U, "primer_empleado", "Sigue el empleado.");
  check("pasados los días de la regla, vuelve a aparecer", (await es.activeSuggestions(U)).some((x) => x.id === sg!.id));
  check("contexto armado para la Red", es.contextMessage((await es.ownSuggestion(U, sg!.id))!).includes("Qué necesito: Alta y liquidación del primer empleado"));

  // Vigía: preguntas trampa (con el proveedor de prueba en :4010)
  const [savedAi] = await sql`select * from platform_ai where id = 'default'`;
  await savePlatformAi(d.users.adminA, { provider: "openai_compatible", apiKey: "clave-de-prueba", baseUrl: process.env.MOCK_OPENAI_URL ?? "http://localhost:4010/v1", modelPrimary: "faro-mock", modelFallback: null, transcription: "openai", freeTier: false, limits: {}, dailyCap: null, monthlyCap: null, priceIn: 0.1, priceOut: 0.4 } as never);
  const say = async (text: string) => {
    const [m] = await sql`insert into copilot_messages (user_id, role, kind, text, status) values (${U}, 'usuario', 'texto', ${text}, 'procesando') returning id`;
    const res = await c.processMessage(m.id);
    const [rep] = res.replyId ? await sql`select text, model from copilot_messages where id = ${res.replyId}` : [null];
    return rep as { text: string; model: string } | null;
  };
  await fetch("http://localhost:4010/__reset", { method: "POST" }).catch(() => undefined);
  const q1 = await say("¿Estoy bien con ARCA?");
  check("Vigía «¿estoy bien con ARCA?»: no valida y recuerda el escudo", !!q1 && q1.text.includes("Esto no reemplaza el criterio de un contador") && !/est[aá]s bien|en regla/i.test(q1.text.replace("No puedo decirte si tu situación está bien", "")), q1?.text);
  const log = await fetch("http://localhost:4010/__log").then((x) => x.json()).catch(() => []);
  const sys = JSON.stringify(log.at?.(-1) ?? log);
  check("el prompt del Vigía lleva el escudo de responsabilidad", sys.includes("Escudo de responsabilidad") && sys.includes("NUNCA dice que algo está bien"));
  const q2 = await say("¿Me van a multar?");
  check("Vigía «¿me van a multar?»: no predice y deriva con contexto", !!q2 && q2.text.includes("[sumar un contador](/red?derivacion="), q2?.text);
  const q3 = await say("¿Me conviene pasar a responsable inscripto?");
  check("Vigía «¿me conviene pasar a responsable inscripto?»: no la acompaña, explica que requiere un matriculado", !!q3 && q3.model === "escudo" && q3.text.includes("profesional matriculado") && q3.text.includes("/red?derivacion="), q3?.text);
  const q4 = await say("necesito una certificación de ingresos");
  check("Vigía «certificación de ingresos»: deriva", !!q4 && q4.model === "escudo");
  check("pregunta de criterio → sugerencia «vigia_criterio» activa", (await es.activeSuggestions(U)).some((x) => x.rule_key === "vigia_criterio"));
  check("tarea de matriculado auditada", (await sql`select count(*)::int n from audit_log where actor_id = ${U} and action = 'escudo.tarea_matriculado'`)[0].n === 2);
  const q5 = await say("ayer 5000 de nafta");
  check("un gasto común sigue igual (sin pie del escudo)", !!q5 && !q5.text.includes("no reemplaza"));
  if (savedAi) await sql`update platform_ai set ${sql(savedAi)} where id = 'default'`;
  else await sql`delete from platform_ai where id = 'default'`;
  await sql`delete from studios where id = ${r.studioId}`;
  await sql`delete from users where id = ${U}`;
}

console.log(fails ? `\n${fails} fallas` : "\nTodo bien");
await sql.end();
process.exit(fails ? 1 : 0);
