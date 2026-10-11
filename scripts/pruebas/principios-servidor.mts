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

// ─── Etapa 3 · Cajas, caja de negocio y sueldo del dueño (§10, §11, §17) ───
if (stage("3")) {
  const cj = await import("../../src/modules/cajas/server.ts");
  const cat = await import("../../src/modules/cajas/catalog.ts");
  const bit = await import("../../src/modules/bitacora/server.ts");
  const { createTenant } = await import("../../src/lib/faro/tenants.ts");
  const ts = Date.now();
  const mk = async (i: number, kind: "persona" | "personal" = "persona") => {
    const email = `cajas-${ts}-${i}@prueba.local`;
    const r = await createTenant({ kind, name: `Caja ${i}`, owner: { name: `Caja ${i}`, email, password: "clave-larga-123" }, via: "manual", ...(kind === "personal" ? { cuit: "20111111112" } : {}) } as never);
    if (!r.ok) throw new Error(r.message);
    return { id: r.userId, studioId: r.studioId, name: `Caja ${i}`, email };
  };
  const A = await mk(1);
  const B = await mk(2);
  const today = new Date().toISOString().slice(0, 10);

  // Migración de datos: lo marcado «de mi actividad» pasa a la caja de negocio sin perder nada
  await bit.ensureCategories(A.id);
  const [e1] = await sql`insert into bitacora_entries (user_id, kind, amount, date, description, professional, deductible, note) values (${A.id}, 'gasto', 1500000, ${today}, 'Licencia Adobe', true, true, 'anual') returning id`;
  const [e2] = await sql`insert into bitacora_entries (user_id, kind, amount, date, description) values (${A.id}, 'gasto', 300000, ${today}, 'Super') returning id`;
  const mig = readFileSync(new URL("../../drizzle/0037_cajas.sql", import.meta.url), "utf8").split("--> statement-breakpoint");
  const dataSql = mig.slice(mig.findIndex((x) => x.includes("-- Datos")));
  for (const st of dataSql) await sql.unsafe(st);
  const biz = await cj.businessBoxOf(A.id);
  const [moved] = biz ? await sql`select * from box_entries where box_id = ${biz.id} and origin_id = ${e1.id}` : [];
  const [orig] = await sql`select deleted_at, moved_to_box_entry_id from bitacora_entries where id = ${e1.id}`;
  check("migración: caja de negocio abierta para quien marcó gastos de su actividad", !!biz);
  check("migración: el gasto pasó con monto, deducible, nota y registro original", !!moved && Number(moved.amount) === 1500000 && moved.deductible && moved.note === "anual" && moved.raw?.id === e1.id && moved.source === "bitacora");
  check("migración: el de la Bitácora queda borrado y vinculado (no se duplica)", !!orig.deleted_at && orig.moved_to_box_entry_id === moved?.id);
  for (const st of dataSql) await sql.unsafe(st);
  check("migración: correrla de nuevo no duplica", (await sql`select count(*)::int n from box_entries where origin_id = ${e1.id}`)[0].n === 1);
  check("lo personal sigue en lo personal", !(await sql`select deleted_at from bitacora_entries where description = 'Super' and user_id = ${A.id}`)[0].deleted_at);
  let threw = false;
  try {
    await bit.restoreEntry(A.id, e1.id);
  } catch (e) {
    threw = e instanceof bit.BitacoraError;
  }
  check("un movimiento movido no se puede restaurar en lo personal", threw);

  // Mis cajas
  const boxesA = await cj.myBoxes(A.id);
  check("Mis cajas: personal y negocio, cada una con su gente", boxesA.some((b) => b.kind === "personal") && boxesA.some((b) => b.kind === "negocio" && b.members.length === 1));
  check("una sola caja de negocio por persona", (await cj.openBusinessBox(A)).id === biz!.id);
  const autonomo = await mk(3, "personal");
  const migAut = dataSql;
  for (const st of migAut.slice(0, 2)) await sql.unsafe(st);
  check("migración: un autónomo tiene su caja de negocio", !!(await cj.businessBoxOf(autonomo.id)));

  // Aislamiento forzando IDs
  check("caja ajena: boxFor da null", (await cj.boxFor(B.id, biz!.id)) === null);
  const fails2 = async (fn: () => Promise<unknown>) => fn().then(() => false, (e) => e instanceof cj.CajaError);
  check("cargar en una caja ajena: error", await fails2(() => cj.addBusinessEntry(B, biz!.id, { kind: "gasto", amount: 100, date: today, category: "otros", description: "Intruso" })));
  check("ver movimientos de una caja ajena: error", await fails2(() => cj.boxEntries(B, biz!.id, today.slice(0, 7))));
  check("borrar un movimiento de una caja ajena: error", await fails2(() => cj.deleteBoxEntry(B, biz!.id, moved.id)));
  check("pagarse el sueldo de un negocio ajeno: error", await fails2(() => cj.paySalary(B, biz!.id, { amount: 1000 })));
  check("mover a su negocio un gasto ajeno: error", await fails2(() => cj.moveToBusiness(B, e2.id)));

  // Sugerencia de mover y mover
  const [lic] = await sql`insert into bitacora_entries (user_id, kind, amount, date, description) values (${A.id}, 'gasto', 2500000, ${today}, 'Licencia Figma') returning id`;
  const hints = await cj.businessHints(A.id);
  check("«Licencia Figma» en lo personal: Faro sugiere moverla", hints.some((h) => h.entry.id === lic.id) && !hints.some((h) => h.entry.description === "Super"));
  const mv = await cj.moveToBusiness(A, lic.id);
  check("moverla: queda en el negocio como software", mv.category === "software" && mv.box_id === biz!.id);
  check("y deja de sugerirse", !(await cj.businessHints(A.id)).some((h) => h.entry.id === lic.id));
  check("mover queda en la auditoría", (await sql`select count(*)::int n from audit_log where actor_id = ${A.id} and action = 'caja.mover_a_negocio'`)[0].n === 1);

  // Sueldo del dueño: el único movimiento del negocio a lo personal
  await cj.addBusinessEntry(A, biz!.id, { kind: "ingreso", amount: 50000000, date: today, category: "ventas", description: "Cobro cliente", invoiced: true });
  const t = await cj.paySalary(A, biz!.id, { amount: 20000000 });
  const [inBiz] = await sql`select kind from box_entries where transfer_id = ${t.id}`;
  const [inPers] = await sql`select kind, amount from bitacora_entries where transfer_id = ${t.id}`;
  check("sueldo: retiro en el negocio e ingreso en lo personal, unidos", inBiz?.kind === "retiro" && inPers?.kind === "ingreso" && Number(inPers.amount) === 20000000);
  const sum = await cj.businessSummary(A, biz!.id, today.slice(0, 7));
  check("el sueldo no es un gasto de la actividad: resultado y caja por separado", sum.salary === 20000000 && sum.result === 50000000 - 1500000 - 2500000 && sum.left === sum.result - 20000000);
  threw = false;
  try {
    await bit.updateEntry(A.id, (await sql`select id from bitacora_entries where transfer_id = ${t.id}`)[0].id, { kind: "ingreso", amount: 1, date: today, description: "x" });
  } catch (e) {
    threw = e instanceof bit.BitacoraError;
  }
  check("cada caja es un mundo cerrado: el sueldo no se edita desde la Bitácora", threw);
  await cj.deleteTransfer(A, t.id);
  check("borrar el sueldo lo borra de las dos cajas", (await sql`select count(*)::int n from box_entries where transfer_id = ${t.id} and deleted_at is null`)[0].n === 0 && (await sql`select count(*)::int n from bitacora_entries where transfer_id = ${t.id} and deleted_at is null`)[0].n === 0);
  const ap = await cj.contribute(A, biz!.id, { amount: 1000000 });
  check("aporte: gasto en lo personal y aporte en el negocio", (await sql`select kind from bitacora_entries where transfer_id = ${ap.id}`)[0].kind === "gasto" && (await sql`select kind from box_entries where transfer_id = ${ap.id}`)[0].kind === "aporte");
  // Sueldo configurado: se registra una sola vez por fecha
  await cj.setSalary(A, biz!.id, { amount: 15000000, frequency: "mensual", nextDate: today, active: true });
  const n1 = await cj.runSalaryJobs(today);
  const n2 = await cj.runSalaryJobs(today);
  const [sal] = await sql`select next_date from box_salaries where box_id = ${biz!.id}`;
  check("sueldo automático: se registra una vez por fecha y avanza a la próxima", n1 >= 1 && n2 === 0 && new Date(sal.next_date).toISOString().slice(0, 10) > today && (await sql`select count(*)::int n from box_transfers where salary_id is not null and user_id = ${A.id}`)[0].n === 1);
  check("sueldo auditado", (await sql`select count(*)::int n from audit_log where actor_id = ${A.id} and action in ('caja.sueldo', 'caja.sueldo_configurado')`)[0].n >= 2);
  // Sueldo sugerido como dato
  const sg = cat.suggestedSalary([60000000, 40000000, 50000000]);
  check("sueldo sugerido: promedio y cifra que deja un 30 % (dato)", sg!.average === 50000000 && sg!.suggestion === 35000000);
  check("sin resultado positivo, no sugiere cifra", cat.suggestedSalary([-1000, -2000])!.suggestion === 0);

  // Vigía: lo del trabajo va a la caja de negocio
  const c = await import("../../src/modules/copilot/server.ts");
  const { savePlatformAi } = await import("../../src/modules/copilot/platform.ts");
  const [savedAi] = await sql`select * from platform_ai where id = 'default'`;
  await savePlatformAi(d.users.adminA, { provider: "openai_compatible", apiKey: "clave-de-prueba", baseUrl: "http://localhost:4010/v1", modelPrimary: "faro-mock", modelFallback: null, transcription: "openai", freeTier: false, limits: {}, dailyCap: null, monthlyCap: null, priceIn: 0.1, priceOut: 0.4 } as never);
  const [m] = await sql`insert into copilot_messages (user_id, role, kind, text, status) values (${A.id}, 'usuario', 'texto', '12000 de hosting para el negocio', 'procesando') returning id`;
  const res = await c.processMessage(m.id);
  const [prop] = await sql`select * from copilot_proposals where message_id = ${res.replyId!}`;
  check("Vigía: «12000 de hosting para el negocio» → tarjeta de la caja de negocio", !!prop && prop.preview.data.box === "negocio" && prop.preview.data.category === "software", JSON.stringify(prop?.preview));
  const u = { id: A.id, name: A.name, email: A.email, studioId: A.studioId, role: "titular" };
  const r = await c.confirmProposal(u as never, prop.id);
  check("al confirmar queda en la caja de negocio, no en la Bitácora", r.type === "movimiento_caja" && (await sql`select box_id, source from box_entries where id = ${r.id}`)[0].source === "vigia");
  await c.undoProposal(u as never, prop.id);
  check("deshacer la borra de la caja", !!(await sql`select deleted_at from box_entries where id = ${r.id}`)[0].deleted_at);
  if (savedAi) await sql`update platform_ai set ${sql(savedAi)} where id = 'default'`;
  else await sql`delete from platform_ai where id = 'default'`;
  for (const x of [A, B, autonomo]) {
    await sql`delete from studios where id = ${x.studioId}`;
    await sql`delete from users where id = ${x.id}`;
  }
}

// ─── Etapa 4 · Registro compartido (§16, §18) ───
if (stage("4")) {
  const sh = await import("../../src/modules/cajas/shared.ts");
  const { CajaError } = await import("../../src/modules/cajas/server.ts");
  const { createTenant } = await import("../../src/lib/faro/tenants.ts");
  const ts = Date.now();
  const mk = async (name: string) => {
    const email = `compartida-${ts}-${name}@prueba.local`.toLowerCase();
    const r = await createTenant({ kind: "persona", name, owner: { name, email, password: "clave-larga-123" }, via: "manual" });
    if (!r.ok) throw new Error(r.message);
    return { id: r.userId, studioId: r.studioId, name, email, role: "titular" };
  };
  const A = await mk("Ana");
  const B = await mk("Beto");
  const C = await mk("Ceci");
  const err = (fn: () => Promise<unknown>) => fn().then(() => false, (e) => e instanceof CajaError);
  const box = await sh.createSharedBox(A, "pareja");
  check("opción prearmada: «Pareja», sin ponerle nombre", box.name === "Pareja" && box.purpose === "pareja" && box.kind === "compartida");
  check("una opción que no existe: error", await err(() => sh.createSharedBox(A, "cualquiera")));
  const link = await sh.boxInviteLink(A, box.id);
  const token = link.split("/caja/")[1];
  check("invitación por enlace (para WhatsApp)", /\/caja\/[0-9a-f-]{36}\./.test(link) && (await sh.boxByInvite(token))?.box.id === box.id);
  check("un enlace falso no sirve", (await sh.boxByInvite(`${box.id}.falso-falso-falso-falso`)) === null);
  await sh.joinBox(B, token);
  check("Beto se suma con su cuenta", (await sh.activeMembers(box.id)).length === 2);

  // Aislamiento: Ceci no es integrante
  check("no integrante: ver movimientos, error", await err(() => sh.sharedEntries(C, box.id)));
  check("no integrante: ver el desglose, error", await err(() => sh.sharedBreakdown(C, box.id)));
  check("no integrante: cargar, error", await err(() => sh.addSharedEntry(C, box.id, { kind: "gasto", amount: 100, description: "x", mode: "registrar" })));
  check("no integrante: pedir el enlace, error", await err(() => sh.boxInviteLink(C, box.id)));

  // Cena de $3.000: solo registrar
  const r1 = await sh.addSharedEntry(A, box.id, { kind: "gasto", amount: 300000, description: "Cena", category: "salidas", mode: "registrar", alsoPersonal: true });
  let b = await sh.sharedBreakdown(A, box.id);
  check("cena, solo registrar: queda que Ana puso $3.000 y nadie debe nada", b.members.find((m) => m.userId === A.id)!.put === 300000 && b.debts.length === 0);
  const [p1] = await sql`select amount, box_entry_id from bitacora_entries where id = ${r1.personalEntryId}`;
  check("una sola carga, dos destinos: también en la Bitácora de Ana ($3.000)", Number(p1?.amount) === 300000 && p1.box_entry_id === r1.id);
  await sh.deleteSharedEntry(A, box.id, r1.id);
  check("borrarla de la caja la borra también de la Bitácora", !!(await sql`select deleted_at from bitacora_entries where id = ${r1.personalEntryId}`)[0].deleted_at);

  // Cena de $3.000: dividir
  const r2 = await sh.addSharedEntry(A, box.id, { kind: "gasto", amount: 300000, description: "Cena", category: "salidas", mode: "dividir", alsoPersonal: true });
  b = await sh.sharedBreakdown(A, box.id);
  check("cena, dividir: Beto le debe $1.500 a Ana, pendiente", b.debts.length === 1 && b.debts[0].from === B.id && b.debts[0].to === A.id && b.debts[0].amount === 150000 && b.members.find((m) => m.userId === B.id)!.owes === 150000);
  check("en la Bitácora de Ana queda su parte ($1.500)", Number((await sql`select amount from bitacora_entries where id = ${r2.personalEntryId}`)[0].amount) === 150000);
  check("Ana no puede confirmar la parte de Beto", await err(() => sh.confirmSharePaid(A, box.id, r2.id)).then(async () => (await sh.sharedBreakdown(A, box.id)).debts.length === 1));
  check("Ceci no puede confirmar nada (forzando el ID)", await err(() => sh.confirmSharePaid(C, box.id, r2.id)));
  await sh.confirmSharePaid(B, box.id, r2.id);
  b = await sh.sharedBreakdown(A, box.id);
  check("Beto confirma que pagó: sin deuda, cuenta para él y están parejos", b.debts.length === 0 && b.members.find((m) => m.userId === B.id)!.put === 150000 && b.even);
  check("confirmación auditada", (await sql`select count(*)::int n from audit_log where actor_id = ${B.id} and action = 'caja.confirmar_parte'`)[0].n === 1);

  // Confirmación de pago: lo que carga otra persona a nombre de Ana
  const r3 = await sh.addSharedEntry(B, box.id, { kind: "gasto", amount: 80000, description: "Alimento del perro", category: "mascota", paidBy: A.id, mode: "registrar" });
  b = await sh.sharedBreakdown(A, box.id);
  check("Beto carga que pagó Ana: no cuenta hasta que Ana confirme", r3.status === "pendiente" && b.members.find((m) => m.userId === A.id)!.pendingConfirm === 80000);
  check("Beto no puede confirmarlo por Ana", await err(() => sh.confirmEntry(B, box.id, r3.id)));
  await sh.confirmEntry(A, box.id, r3.id);
  b = await sh.sharedBreakdown(A, box.id);
  check("Ana confirma: ahora cuenta", b.members.find((m) => m.userId === A.id)!.pendingConfirm === 0 && b.members.find((m) => m.userId === A.id)!.put === 230000);

  // Metas de ahorro dentro de la caja
  const g = await sh.createGoal(A, box.id, "Vacaciones", 50000000);
  await sh.addSharedEntry(B, box.id, { kind: "ahorro", amount: 2000000, description: "Ahorro", mode: "registrar", goalId: g.id });
  b = await sh.sharedBreakdown(A, box.id);
  check("ahorro por meta dentro de la caja, con quién puso cuánto", b.goals[0].saved === 2000000 && b.goals[0].byMember[0].userId === B.id);
  const other = await sh.createSharedBox(C, "amigos");
  const gOther = await sh.createGoal(C, other.id, "Asado", 100000);
  check("una meta de otra caja no se puede usar (forzando el ID)", await err(() => sh.addSharedEntry(A, box.id, { kind: "ahorro", amount: 100, description: "x", mode: "registrar", goalId: gOther.id })));

  // Salir con deudas: no
  await sh.addSharedEntry(A, box.id, { kind: "gasto", amount: 100000, description: "Súper", category: "super", mode: "dividir" });
  check("no se puede salir con partes pendientes", await err(() => sh.leaveBox(B, box.id)));

  // Padres y abuelos: por el fin, puede entrar cualquiera
  const padres = await sh.createSharedBox(A, "padres");
  await sh.joinBox(C, (await sh.boxInviteLink(A, padres.id)).split("/caja/")[1]);
  check("«Padres y abuelos»: se suma cualquiera (Ceci, una prima)", (await sh.activeMembers(padres.id)).some((m) => m.id === C.id));
  const old = (await sh.boxInviteLink(A, padres.id)).split("/caja/")[1];
  await sh.boxInviteLink(A, padres.id, true);
  check("renovar el enlace invalida el anterior", (await sh.boxByInvite(old)) === null);
  check("la caja de pareja sigue sin mostrarle nada a Ceci", await err(() => sh.sharedEntries(C, box.id)));

  // Hogar → caja de pareja (sin mover nada)
  const [hogar] = await sql`insert into bitacora_shares (owner_id, member_id, invited_email, token, permission, status) values (${A.id}, ${C.id}, ${C.email}, ${`tok-${ts}`}, 'ver', 'activa') returning id`;
  const fromHogar = await sh.pairBoxFromHogar(A, hogar.id);
  check("Hogar: se arma la caja de pareja con las dos personas y el Hogar sigue", (await sh.activeMembers(fromHogar.id)).length === 2 && (await sql`select status from bitacora_shares where id = ${hogar.id}`)[0].status === "activa");
  check("Hogar ajeno (forzando el ID): error", await err(() => sh.pairBoxFromHogar(B, hogar.id)));

  // Vigía: «pagué 3000 la cena con mi pareja»
  const c = await import("../../src/modules/copilot/server.ts");
  const { savePlatformAi } = await import("../../src/modules/copilot/platform.ts");
  const [savedAi] = await sql`select * from platform_ai where id = 'default'`;
  await savePlatformAi(d.users.adminA, { provider: "openai_compatible", apiKey: "clave-de-prueba", baseUrl: "http://localhost:4010/v1", modelPrimary: "faro-mock", modelFallback: null, transcription: "openai", freeTier: false, limits: {}, dailyCap: null, monthlyCap: null, priceIn: 0.1, priceOut: 0.4 } as never);
  await sql`update boxes set archived_at = now() where id = ${fromHogar.id}`;
  const say = async (text: string) => {
    const [m] = await sql`insert into copilot_messages (user_id, role, kind, text, status) values (${A.id}, 'usuario', 'texto', ${text}, 'procesando') returning id`;
    const res = await c.processMessage(m.id);
    return (await sql`select * from copilot_proposals where message_id = ${res.replyId!}`)[0];
  };
  const prop = await say("pagué 3000 la cena con mi pareja");
  check("Vigía: propone la tarjeta de la caja de pareja con los dos finales", prop?.tool === "registrar_en_caja_compartida" && prop.preview.data.boxId === box.id && prop.preview.needsConfirm && /Solo registrar/.test(prop.preview.lines.join(" ")) && /Dividir/.test(prop.preview.lines.join(" ")), JSON.stringify(prop?.preview));
  let threw = false;
  try {
    await c.confirmProposal(A as never, prop.id);
  } catch {
    threw = true;
  }
  check("sin elegir final no se confirma", threw);
  const done = await c.confirmProposal(A as never, prop.id, { final: "dividir" });
  const [e] = await sql`select mode, amount, source from box_entries where id = ${done.id}`;
  const [share] = await sql`select amount, paid_at from box_entry_shares where entry_id = ${done.id} and user_id = ${B.id}`;
  check("«Dividir»: Beto debe $1.500, pendiente hasta que confirme", e.mode === "dividir" && Number(e.amount) === 300000 && Number(share.amount) === 150000 && share.paid_at === null && e.source === "vigia");
  const prop2 = await say("pagué 3000 la cena con mi pareja");
  const done2 = await c.confirmProposal(A as never, prop2.id, { final: "registrar" });
  const [e2] = await sql`select mode from box_entries where id = ${done2.id}`;
  check("«Solo registrar»: queda que Ana puso $3.000, sin partes", e2.mode === "registrar" && (await sql`select count(*)::int n from box_entry_shares where entry_id = ${done2.id}`)[0].n === 0);
  await c.undoProposal(A as never, prop2.id);
  check("deshacer la carga del Vigía la borra de la caja", !!(await sql`select deleted_at from box_entries where id = ${done2.id}`)[0].deleted_at);
  if (savedAi) await sql`update platform_ai set ${sql(savedAi)} where id = 'default'`;
  else await sql`delete from platform_ai where id = 'default'`;
  for (const x of [A, B, C]) {
    await sql`delete from studios where id = ${x.studioId}`;
    await sql`delete from users where id = ${x.id}`;
  }
}

console.log(fails ? `\n${fails} fallas` : "\nTodo bien");
await sql.end();
process.exit(fails ? 1 : 0);
