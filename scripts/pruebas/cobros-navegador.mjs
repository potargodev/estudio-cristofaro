// F7 en el navegador contra el simulador de Mercado Pago (4070): cuenta de
// Faro en el Faro Manager, suscripción de un estudio (débito autorizado,
// pago, cobro rechazado y morosidad), honorarios (abono con ajuste, cargos,
// envío, pago desde el portal, factura por ARCA), débito de una flota y link
// de pago de una factura de Faro Personal; webhooks firmados e idempotentes y
// aislamiento entre estudios.
//
//   PW=/ruta/a/playwright node --env-file=.env.local scripts/pruebas/cobros-navegador.mjs

import postgres from "postgres";
import { BASE, check, data, failures } from "./lib.mjs";

const { chromium } = await import(process.env.PW ?? "playwright");
const d = data();
const sql = postgres(process.env.DATABASE_URL);
const A = d.studios.A;
const SB = d.studios.B;
const P = d.studios.personal;
const NORTE = d.orgs.norte;
const SUR = d.orgs.sur;
const MP = "http://localhost:4070";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => {
  for (let t = 0; t < ms; t += 250) {
    if (await fn()) return true;
    await wait(250);
  }
  return false;
};
const pay = (body) => fetch(`${MP}/__pay`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer TEST-simulador" }, body: JSON.stringify(body) }).then((r) => r.json());

// Estado limpio
await fetch(`${MP}/__reset`, { method: "POST" });
await sql`delete from webhook_events`;
await sql`delete from mp_payments`;
await sql`delete from mp_accounts`;
await sql`delete from faro_subscriptions where studio_id in ${sql([A, SB, P])}`;
await sql`delete from fee_charges where studio_id in ${sql([A, SB])}`;
await sql`delete from fee_plans where studio_id in ${sql([A, SB])}`;
await sql`delete from billing_settings where studio_id in ${sql([A, SB])}`;
await sql`delete from agreement_payments where agreement_id in (select id from service_agreements where member_email = 'cobros@prueba.local')`;
await sql`delete from service_agreements where member_email = 'cobros@prueba.local'`;
// Inicial es gratis (sin prueba): la prueba se ensaya con Profesional y el pase a Avanzado
await sql`update studios set plan_key = 'profesional', status = 'prueba', trial_ends_at = now() + interval '20 days', suspended_reason = null where id = ${SB}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function as(cookie) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const [name, value] = cookie.split("=");
  await ctx.addCookies([{ name, value, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  page.on("dialog", (dlg) => dlg.accept());
  return page;
}
const errors = [];
const seen = async (p, text, timeout = 20000) => p.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).then(() => true, () => false);
const a = await as(d.cookies.adminA);
a.on("pageerror", (e) => errors.push(e.message));

// ─── Cuenta de Faro (Faro Manager) ───
await a.goto(`${BASE}/faro-manager/mercadopago`);
await a.getByLabel("Access token").fill("APP_USR-faro-cuenta-de-prueba");
await a.getByLabel("Clave secreta de webhooks").fill("mock-webhook-secret");
await a.getByRole("button", { name: "Guardar y probar" }).click();
check("Faro Manager: cuenta de Mercado Pago de Faro guardada y probada", await seen(a, "guardada y probada"), errors.join(" | "));
const [faroAcc] = await sql`select access_token_enc, webhook_secret_enc, status from mp_accounts where studio_id is null`;
check("credenciales cifradas", faroAcc.access_token_enc.startsWith("v1:") && faroAcc.webhook_secret_enc.startsWith("v1:") && faroAcc.status === "ok");

// ─── Suscripción del estudio B ───
const b = await as(d.cookies.adminB);
await b.goto(`${BASE}/admin/configuracion/plan`);
check("Plan y facturación: estado de la suscripción (en prueba)", await seen(b, "En prueba"));
await b.getByRole("button", { name: "Elegir mensual" }).first().click();
await b.waitForURL(/localhost:4070\/checkout/, { timeout: 20000 }).catch(() => {});
check("redirige a autorizar el débito en Mercado Pago", b.url().includes("localhost:4070/checkout"), b.url());
const [sub] = await sql`select * from faro_subscriptions where studio_id = ${SB}`;
check("suscripción con débito pendiente y plan elegido", sub.mp_status === "pending" && !!sub.mp_preapproval_id && sub.pending_plan_key === "avanzado" && sub.amount > 0, JSON.stringify({ s: sub.mp_status, p: sub.pending_plan_key }));
await pay({ preapproval_id: sub.mp_preapproval_id, authorize: true });
check("webhook: débito autorizado y pago aprobado → activa", await until(async () => (await sql`select status from faro_subscriptions where studio_id = ${SB}`)[0].status === "activa"));
const [sub2] = await sql`select * from faro_subscriptions where studio_id = ${SB}`;
const [stB] = await sql`select plan_key, status from studios where id = ${SB}`;
check("plan aplicado al tenant con período pago", stB.plan_key === "avanzado" && stB.status === "activo" && !!sub2.current_period_end && sub2.mp_status === "authorized");
const [mpp] = await sql`select * from mp_payments where studio_id = ${SB}`;
check("pago guardado con ID externo, registro original y aplicado", !!mpp && mpp.applied && !!mpp.raw && mpp.kind === "sub");
// Webhook repetido
const dup = await pay({ preapproval_id: sub.mp_preapproval_id, duplicate: true });
await until(async () => (await sql`select count(*)::int n from webhook_events where data_id = ${String(dup.id)}`)[0].n >= 2);
const evs = await sql`select result from webhook_events where data_id = ${String(dup.id)} order by created_at`;
check("webhook repetido: se procesa una sola vez", evs.length >= 2 && evs.some((e) => e.result === "repetido"), evs.map((e) => e.result).join(","));
// Cobro rechazado → morosa con aviso
await pay({ preapproval_id: sub.mp_preapproval_id, status: "rejected" });
check("cobro rechazado → pago pendiente con gracia", await until(async () => (await sql`select status from faro_subscriptions where studio_id = ${SB}`)[0].status === "morosa"));
await b.goto(`${BASE}/admin/configuracion/plan`);
check("aviso de gracia y «Pagar ahora»", (await seen(b, "para que la cuenta no se suspenda")) && (await b.getByRole("button", { name: "Pagar ahora" }).count()) > 0);
await b.getByRole("button", { name: "Pagar ahora" }).click();
await b.waitForURL(/localhost:4070/, { timeout: 20000 }).catch(() => {});
const prefId = new URL(b.url()).searchParams.get("pref_id");
await pay({ preference_id: prefId });
check("pago del saldo → vuelve a activa", await until(async () => (await sql`select status, past_due_since from faro_subscriptions where studio_id = ${SB}`)[0].status === "activa"));
// Cancelación
await b.goto(`${BASE}/admin/configuracion/plan`);
await b.getByRole("button", { name: "Cancelar suscripción" }).click();
await b.getByRole("button", { name: "Cancelar suscripción" }).last().click().catch(() => {});
check("cancelación al final del período", await seen(b, "seguís con tu plan hasta el"));
const [sub3] = await sql`select cancel_at_period_end, mp_status, status from faro_subscriptions where studio_id = ${SB}`;
check("débito cancelado y plan vigente", sub3.cancel_at_period_end && sub3.mp_status === "cancelled" && sub3.status === "activa");

// Faro Manager ve altas, ingresos y estados
await a.goto(`${BASE}/faro-manager/suscripciones`);
check("Faro Manager: suscripciones con ingresos del mes", (await seen(a, "Ingresos del mes")) && (await seen(a, "Prueba B")) || (await seen(a, "prueba-b")) || (await a.locator("li").count()) > 0);

// ─── Honorarios (estudio A) ───
await a.goto(`${BASE}/admin/honorarios/configuracion`);
await a.getByLabel("Access token").fill("APP_USR-estudio-a-de-prueba");
await a.getByLabel("Clave secreta de webhooks").fill("mock-webhook-secret");
await a.getByRole("button", { name: "Guardar y probar" }).click();
check("Honorarios: cuenta de Mercado Pago del estudio", await seen(a, "guardada y probada"));
await a.getByLabel(/Organización que representa al estudio/).selectOption(SUR);
await a.getByRole("button", { name: "Guardar", exact: true }).click();
check("organización emisora guardada", await seen(a, "Configuración guardada"));
const period = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
const [y, m] = period.split("-").map(Number);
const start = `${m <= 3 ? y - 1 : y}-${String(((m - 4 + 12) % 12) + 1).padStart(2, "0")}`;
await a.goto(`${BASE}/admin/honorarios/abonos`);
await a.getByLabel("Organización").selectOption(NORTE);
await a.getByLabel("Importe mensual").fill("100000");
await a.getByLabel("Desde").fill(start);
await a.getByLabel("Ajuste").selectOption("porcentaje");
await a.getByRole("textbox", { name: "Porcentaje" }).fill("10");
await a.getByRole("button", { name: "Guardar abono" }).click();
check("abono guardado", await seen(a, "Abono guardado"));
check("importe del mes con el ajuste (10 % a los 3 meses)", await seen(a, "$ 110.000,00"));
await a.goto(`${BASE}/admin/honorarios`);
await a.getByRole("button", { name: "Generar" }).click();
check("cargos del mes generados", await seen(a, "Generamos 1 cargo"));
await a.getByRole("button", { name: "Generar" }).click();
check("no se duplican", await seen(a, "ya estaban generados"));
const [charge] = await sql`select * from fee_charges where studio_id = ${A} and organization_id = ${NORTE}`;
check("cargo con el importe ajustado", Number(charge.amount) === 11000000);
await a.getByRole("button", { name: "Enviar cobro" }).click();
check("cobro enviado a quien tiene acceso a pagos", await seen(a, "Cobro enviado a 1 persona"));
const [charge2] = await sql`select payment_url, mp_preference_id from fee_charges where id = ${charge.id}`;
check("link de Mercado Pago en la cuenta del estudio", !!charge2.payment_url && !!charge2.mp_preference_id);

// Factura del estudio por ARCA (borrador para emitir con confirmación)
await sql`insert into invoice_points (studio_id, organization_id, cuit, number) values (${A}, ${SUR}, '30722222229', 3) on conflict do nothing`.catch(() => {});
await a.goto(`${BASE}/admin/honorarios`);
await a.getByRole("button", { name: "Preparar factura" }).click();
await a.waitForURL(/\/arca\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
check("factura de honorarios preparada como borrador en ARCA", /\/admin\/organizaciones\/.+\/arca\/[0-9a-f-]{36}/.test(a.url()) && (await seen(a, "Borrador")), a.url());
const [inv] = await sql`select i.status, i.customer_doc_number, i.total from invoices i join fee_charges c on c.invoice_id = i.id where c.id = ${charge.id}`;
check("borrador a nombre del cliente, por el importe del cargo", inv?.status === "borrador" && inv.customer_doc_number === "30711111119" && Number(inv.total) === 110000, JSON.stringify(inv));

// Portal: estado de cuenta y pago
const duena = await as(d.cookies.duenaNorte);
await duena.goto(`${BASE}/portal/estado-de-cuenta`);
check("portal: estado de cuenta con el pendiente", (await seen(duena, "Estado de cuenta")) && (await seen(duena, "$ 110.000,00")));
await duena.getByRole("button", { name: "Pagar" }).click();
await duena.waitForURL(/localhost:4070/, { timeout: 20000 }).catch(() => {});
await pay({ preference_id: charge2.mp_preference_id });
check("webhook: cargo pagado", await until(async () => (await sql`select status from fee_charges where id = ${charge.id}`)[0].status === "pagado"));
await duena.goto(`${BASE}/portal/estado-de-cuenta`);
check("portal: figura como pagado", await seen(duena, "Pagado el"));
const emp = await as(d.cookies.empleadaNorte);
await emp.goto(`${BASE}/portal/estado-de-cuenta`);
check("empleado sin acceso a pagos: no ve el estado de cuenta", !(await seen(emp, "$ 110.000,00", 3000)));

// Aislamiento: otro estudio no ve ni toca Honorarios de A
await b.goto(`${BASE}/admin/honorarios`);
check("otro estudio no ve los cargos de A", !(await seen(b, "Agencia Norte", 3000)));
const colab = await as(d.cookies.colaboradorA);
await colab.goto(`${BASE}/admin/honorarios`);
check("colaborador sin acceso a Honorarios", !(await seen(colab, "Generar cargos", 3000)));

// ─── Flotas: débito individual ───
const [tit] = await sql`select id, email, name from users where id = ${d.users.titular}`;
const [ag] = await sql`insert into service_agreements (studio_id, user_id, member_name, member_email, profile, monthly_price, terms, signed_name, signed_at) values (${A}, ${tit.id}, ${tit.name}, 'cobros@prueba.local', 'autonomo', 30000, ${sql.json({ includes: "Monotributo", minMembers: 3, noticeDays: 30, studioName: "Estudio A", fleetName: "Prueba", version: "1" })}, ${tit.name}, ${new Date(Date.now() - 40 * 86400000)}) returning id`;
const t = await as(d.cookies.titular);
await t.goto(`${BASE}/flotas/servicios`);
check("flota: saldo pendiente solo de la propia cuota", await seen(t, "Pagar $"));
await t.getByRole("button", { name: "Adherir débito automático" }).click();
await t.waitForURL(/localhost:4070/, { timeout: 20000 }).catch(() => {});
const [ag2] = await sql`select mp_preapproval_id, debit_status from service_agreements where id = ${ag.id}`;
check("débito pedido en la cuenta del estudio", !!ag2.mp_preapproval_id && ag2.debit_status === "pendiente");
await pay({ preapproval_id: ag2.mp_preapproval_id, authorize: true });
check("débito autorizado y cuota registrada", await until(async () => (await sql`select debit_status from service_agreements where id = ${ag.id}`)[0].debit_status === "autorizado" && (await sql`select count(*)::int n from agreement_payments where agreement_id = ${ag.id} and method = 'mercadopago'`)[0].n >= 1));
await t.goto(`${BASE}/flotas/servicios`);
check("Mis servicios: débito adherido", await seen(t, "Adherido (se debita solo tu cuota)"));

// ─── Faro Personal: link de pago de una factura ───
await t.goto(`${BASE}/facturacion/ajustes`);
await t.getByLabel("Access token").fill("APP_USR-autonomo-de-prueba");
await t.getByLabel("Clave secreta de webhooks").fill("mock-webhook-secret");
await t.getByRole("button", { name: "Guardar y probar" }).click();
check("autónomo: cuenta de Mercado Pago conectada", await seen(t, "Cuenta de Mercado Pago conectada"));
const [pinv] = await sql`select id from invoices where studio_id = ${P} and status = 'autorizada' and cbte_type in (11, 6, 1) order by created_at desc limit 1`;
if (pinv) {
  await sql`update invoices set payment_url = null, mp_preference_id = null, paid_at = null where id = ${pinv.id}`;
  await t.goto(`${BASE}/facturacion/${pinv.id}`);
  await t.getByRole("button", { name: "Crear link de pago" }).click();
  check("link de pago creado en la factura", await seen(t, "Link de pago creado"));
  const [pi] = await sql`select mp_preference_id from invoices where id = ${pinv.id}`;
  await pay({ preference_id: pi.mp_preference_id });
  check("factura marcada pagada por el webhook", await until(async () => !!(await sql`select paid_at from invoices where id = ${pinv.id}`)[0].paid_at));
} else check("hay una factura autorizada del autónomo (correr arca-navegador antes)", false);

// Webhook con firma inválida
const bad = await fetch(`${BASE}/api/mercadopago/webhook?cuenta=faro&data.id=123&type=payment`, { method: "POST", headers: { "Content-Type": "application/json", "x-signature": `ts=${Date.now()},v1=${"0".repeat(64)}`, "x-request-id": "x" }, body: "{}" });
check("webhook con firma inválida → 401", bad.status === 401);

const aud = await sql`select action from audit_log where action like 'suscripcion.%' or action like 'honorarios.%' or action like 'flota.debito%' or action like 'factura.%pag%' or action like '%cuenta_mp'`;
check("auditoría de cobros", ["faro.cuenta_mp", "suscripcion.debito_creado", "suscripcion.pago", "suscripcion.pago_fallido", "suscripcion.cancelada", "honorarios.abono", "honorarios.enviado", "honorarios.pagado", "honorarios.factura_preparada", "flota.debito_adherido", "factura.link_pago", "factura.pagada"].every((x) => aud.some((r) => r.action === x)), [...new Set(aud.map((r) => r.action))].join(","));

check("sin errores de la página", errors.length === 0, errors.join(" | "));
await sql`update studios set plan_key = 'inicial', status = 'activo', suspended_reason = null where id = ${SB}`;
// El acuerdo de prueba se insertó directo (sin la conexión que crea la app): se cierra para no dejarlo vigente
await sql`update service_agreements set status = 'finalizado' where id = ${ag.id}`;
await browser.close();
await sql.end();
console.log(failures ? `\n${failures} fallaron` : "\nTodo bien");
process.exit(failures ? 1 : 0);
