// F4 en el navegador: Automatizaciones del Vigía, borrador desde una frase,
// plantilla «Cobro con recordatorios» de punta a punta (evento → acción
// sensible en Aprobaciones → espera → condición con dato vivo), flujo armado
// en el canvas con disparador webhook (idempotencia), pausa y reanudación,
// registro de corridas y aislamiento.
//
//   PW=/ruta/a/playwright node --env-file=.env.local scripts/pruebas/flujos-navegador.mjs

import postgres from "postgres";
import { BASE, check, data, failures } from "./lib.mjs";

const { chromium } = await import(process.env.PW ?? "playwright");
const d = data();
const sql = postgres(process.env.DATABASE_URL);
const A = d.studios.A;
const NORTE = d.orgs.norte;
const cron = async () => (await fetch(`${BASE}/api/flujos/cron`, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } })).json();

await sql`delete from flows where studio_id = ${A}`;
await sql`delete from flow_events where studio_id = ${A}`;
await sql`delete from tasks where studio_id = ${A} and source = 'flujo'`;
await sql`delete from approvals where studio_id = ${A} and (origin = 'flujo' or status = 'pendiente')`;
await sql`delete from fee_charges where studio_id = ${A} and concept like 'Flujo%'`;
await sql`delete from fee_plans where studio_id = ${A} and concept = 'Flujo de prueba'`;

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function as(cookie, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
  const [name, value] = cookie.split("=");
  await ctx.addCookies([{ name, value, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  page.on("dialog", (dlg) => dlg.accept());
  return page;
}
const errors = [];
const seen = async (p, text, timeout = 20000) => p.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).then(() => true, () => false);
const is404 = async (p) => (await p.content()).includes("404") || (await seen(p, "no existe", 3000));
const a = await as(d.cookies.adminA);
a.on("pageerror", (e) => errors.push(e.message));

// ─── Automatizaciones y frase ───
await a.goto(`${BASE}/admin/vigia?tab=automatizaciones`);
check("pestaña Automatizaciones del Vigía con plantillas", (await seen(a, "Plantillas")) && (await seen(a, "Cobro con recordatorios")), errors.join(" | "));
await a.getByLabel("Contale al Vigía qué querés automatizar").fill("cada vez que entre una factura de proveedor, avisale a administración");
await a.getByRole("button", { name: "Armar el flujo" }).click();
check("borrador armado desde la frase", await seen(a, "Armamos un borrador"));
// El canvas se carga diferido: esperar a que aparezca
await a.locator(".react-flow__node").first().waitFor({ timeout: 20000 }).catch(() => undefined);
check("canvas con el disparador y la acción", (await a.locator(".react-flow__node").count()) === 2 && (await seen(a, "Se leyó un documento con IA")));
await a.getByRole("button", { name: "Activar" }).click();
check("flujo de la frase activado", await seen(a, "Flujo activo"));

// ─── Plantilla «Cobro con recordatorios» ───
await a.goto(`${BASE}/admin/vigia?tab=automatizaciones`);
await a.getByRole("button", { name: "Usar «Cobro con recordatorios»" }).click();
await seen(a, "Flujo creado en borrador");
const cobroId = a.url().match(/flujos\/([0-9a-f-]{36})/)[1];
await a.locator(".react-flow__node").first().waitFor({ timeout: 20000 }).catch(() => undefined);
check("plantilla en el canvas con 6 pasos", (await a.locator(".react-flow__node").count()) === 6);
await a.getByRole("button", { name: "Activar" }).click();
check("plantilla activada", await seen(a, "Flujo activo"));
const period = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
const [plan] = await sql`insert into fee_plans (studio_id, organization_id, concept, amount, start_month) values (${A}, ${NORTE}, 'Flujo de prueba', 5000000, ${period}) returning id`;
await sql`delete from fee_charges where fee_plan_id = ${plan.id}`;
await a.goto(`${BASE}/admin/honorarios`);
await a.getByRole("button", { name: "Generar" }).click();
await seen(a, "Generamos");
const [ev] = await sql`select * from flow_events where studio_id = ${A} and name = 'honorarios.cargo_generado'`;
check("el módulo emitió el evento", !!ev && ev.payload.organizacion_id === NORTE);
await cron();
const [run] = await sql`select * from flow_runs where flow_id = ${cobroId}`;
check("corrida esperando la aprobación del cobro", run?.status === "esperando" && !!run.waiting_approval_id, JSON.stringify(run?.status));
await a.goto(`${BASE}/admin/vigia?tab=propuestas`);
check("el cobro del flujo está en Propuestas para aprobar", await seen(a, "Enviar un cobro al cliente"));
const [appr] = await sql`select id, origin from approvals where id = ${run.waiting_approval_id}`;
check("propuesta con origen flujo", appr.origin === "flujo");
await a.getByRole("button", { name: "Aprobar", exact: true }).first().click();
await a.getByRole("button", { name: "Aprobar y ejecutar" }).click();
check("aprobada y ejecutada desde la bandeja", await seen(a, "Aprobada y ejecutada"));
await cron();
const [run2] = await sql`select status, next_attempt_at from flow_runs where id = ${run.id}`;
check("aprobado: sigue hasta la espera de 7 días", run2.status === "esperando" && run2.next_attempt_at > new Date(Date.now() + 6 * 86400000), JSON.stringify(run2));
await sql`update flow_steps set started_at = now() - interval '8 days' where run_id = ${run.id} and kind = 'espera'`;
await sql`update flow_runs set next_attempt_at = now() where id = ${run.id}`;
await cron();
const [run3] = await sql`select status, waiting_approval_id from flow_runs where id = ${run.id}`;
const condStep = (await sql`select output from flow_steps where run_id = ${run.id} and kind = 'condicion'`)[0];
check("condición con el dato vivo: el cargo sigue pendiente → reenvía (otra aprobación)", condStep?.output?.resultado === "si" && run3.status === "esperando" && run3.waiting_approval_id !== run.waiting_approval_id, JSON.stringify({ condStep, run3 }));
await sql`update approvals set status = 'rechazada', reason = 'No hace falta' where id = ${run3.waiting_approval_id}`;
await cron();
const [run4] = await sql`select status, error from flow_runs where id = ${run.id}`;
check("rechazado en Aprobaciones → la corrida termina", run4.status === "rechazada" && /No hace falta/.test(run4.error ?? ""));
await a.goto(`${BASE}/admin/vigia/flujos/${cobroId}/corridas/${run.id}`);
check("registro paso a paso de la corrida", (await seen(a, "condicion")) && (await seen(a, "espera")) && (await seen(a, "Rechazado")));

// ─── Canvas: flujo en blanco con webhook ───
await a.goto(`${BASE}/admin/vigia?tab=automatizaciones`);
await a.getByRole("button", { name: "Flujo en blanco" }).click();
await seen(a, "Flujo creado en borrador");
const blankId = a.url().match(/flujos\/([0-9a-f-]{36})/)[1];
await a.locator(".react-flow__node").first().click();
await a.getByLabel("Se dispara").selectOption("webhook");
await a.getByRole("button", { name: "+ Acción" }).click();
await a.getByLabel("Título").fill("Llegó un pedido de {{evento.cliente}}");
const src = a.locator(".react-flow__node").nth(0).locator(".react-flow__handle-bottom");
const dst = a.locator(".react-flow__node").nth(1).locator(".react-flow__handle-top");
await src.dragTo(dst);
check("conectados en el canvas", (await a.locator(".react-flow__edge").count()) === 1);
await a.getByRole("button", { name: "Guardar" }).click();
check("guardado sin observaciones", (await seen(a, "Guardado.")) && !(await seen(a, "Antes de activarlo", 1500)));
await a.getByRole("button", { name: "Activar" }).click();
await seen(a, "Flujo activo");
const url = (await a.locator("code").first().innerText()).trim();
check("URL del webhook visible", url.includes("/api/flujos/webhook/"));
const post = (body, key) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) });
const r1 = await post({ cliente: "Agencia Norte" }, "pedido-1");
const r2 = await post({ cliente: "Agencia Norte" }, "pedido-1");
check("webhook: crea la corrida y no la repite con la misma clave", r1.status === 201 && r2.status === 200);
check("webhook con token inválido → 404", (await fetch(`${BASE}/api/flujos/webhook/token-que-no-existe-123456`, { method: "POST", body: "{}" })).status === 404);
const before = (await sql`select count(*)::int n from notifications where title = 'Llegó un pedido de Agencia Norte'`)[0].n;
await cron();
const [wrun] = await sql`select status from flow_runs where flow_id = ${blankId}`;
const after = (await sql`select count(*)::int n from notifications where title = 'Llegó un pedido de Agencia Norte'`)[0].n;
check("corrida completada: aviso al equipo con el dato interpolado", wrun.status === "completada" && after > before, JSON.stringify(wrun));
// Pausa y reanudación
await a.goto(`${BASE}/admin/vigia/flujos/${blankId}`);
await a.getByRole("button", { name: "Pausar" }).click();
check("pausado", await seen(a, "Flujo pausado"));
check("pausado: el webhook no dispara", (await post({ cliente: "X" }, "pedido-2")).status === 404);
await a.getByRole("button", { name: "Reanudar" }).click();
check("reanudado", await seen(a, "Flujo activo"));
check("reanudado: vuelve a disparar", (await post({ cliente: "Y" }, "pedido-3")).status === 201);

// ─── Aislamiento y permisos ───
const b = await as(d.cookies.adminB);
await b.goto(`${BASE}/admin/vigia/flujos/${blankId}`);
check("otro estudio forzando el ID del flujo → 404", await is404(b));
const colab = await as(d.cookies.colaboradorA);
await colab.goto(`${BASE}/admin/vigia?tab=automatizaciones`);
check("colaborador: sin pestaña Automatizaciones", !(await seen(colab, "Plantillas", 3000)));
const aud = await sql`select action from audit_log where studio_id = ${A} and action like 'flujo.%'`;
check("auditoría de flujos", ["flujo.creado", "flujo.activado", "flujo.editado", "flujo.pausado", "flujo.reanudado"].every((x) => aud.some((r) => r.action === x)));

check("sin errores de la página", errors.length === 0, errors.join(" | "));
await sql`update fee_plans set active = false where id = ${plan.id}`;
await sql`update flows set status = 'pausado' where studio_id = ${A}`;
await browser.close();
await sql.end();
console.log(failures ? `\n${failures} fallaron` : "\nTodo bien");
process.exit(failures ? 1 : 0);
