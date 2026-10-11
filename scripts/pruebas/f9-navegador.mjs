// F9 en el navegador: Red Contable (mapa y «Agendar llamada» de punta a
// punta), consulta con IA desde el portal → revisión y aprobación en el
// estudio → respuesta en el portal, indicadores (pestañas y permisos), marca
// blanca (colores en el portal, ingreso por dominio propio y ruteo por host),
// WhatsApp (pantalla del cliente, comprobante entrante por el simulador,
// Configuración → Avanzado y Faro Manager) y aislamiento. Mobile y escritorio,
// claro y oscuro.
//
// Correr después de f9-servidor.mts (usa la cuenta de WhatsApp y el número verificado).
//   PW=/ruta/a/playwright node --env-file=.env.local scripts/pruebas/f9-navegador.mjs

import postgres from "postgres";
import { BASE, check, data, failures } from "./lib.mjs";

const { chromium } = await import(process.env.PW ?? "playwright");
const d = data();
const sql = postgres(process.env.DATABASE_URL);
const A = d.studios.A;
const NORTE = d.orgs.norte;
const WA = process.env.WHATSAPP_API_URL ?? "http://localhost:4080";
const DOM = "portal.norte-prueba.com.ar";

// Red: ficha publicada y agenda pública con horarios todos los días
await sql`insert into directory_profiles (studio_id, published, accepting_clients, headline, province, city, modality, services, license_body, license_number, license_holder, license_status, published_at)
  values (${A}, true, true, 'Contadores para pymes', 'Santa Fe', 'Rosario', 'ambas', '{monotributo}', 'CPCE', '123', 'Titular', 'verificada', now())
  on conflict (studio_id) do update set published = true, accepting_clients = true, province = 'Santa Fe', license_status = 'verificada'`;
const allDay = Object.fromEntries(["1", "2", "3", "4", "5", "6", "7"].map((k) => [k, [{ start: "00:00", end: "23:30" }]]));
await sql`insert into availability (user_id, studio_id, active, public, weekly, min_notice_hours) values (${d.users.adminA}, ${A}, true, true, ${sql.json(allDay)}, 1)
  on conflict (user_id) do update set active = true, public = true, weekly = ${sql.json(allDay)}, min_notice_hours = 1`;
await sql`delete from bookings where studio_id = ${A} and email = 'red-prueba@ejemplo.com'`;
const [{ slug }] = await sql`select slug from studios where id = ${A}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: [`--host-resolver-rules=MAP ${DOM} 127.0.0.1`] });
async function as(cookie, { width = 1280, theme = "light" } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
  if (cookie) {
    const [name, value] = cookie.split("=");
    await ctx.addCookies([{ name, value, domain: "localhost", path: "/" }]);
  }
  const page = await ctx.newPage();
  page.on("dialog", (dlg) => dlg.accept());
  page.on("pageerror", (e) => errors.push(e.message));
  return page;
}
const errors = [];
const seen = async (p, text, timeout = 20000) => p.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).then(() => true, () => false);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

// ── Red Contable ──
const pub = await as(null, { width: 390 });
await pub.goto(`${BASE}/red-contable?vista=mapa`);
check("Red: vista de mapa con el estudio en su provincia", (await pub.locator(`svg a[href="/red-contable/${slug}"]`).count()) === 1 && (await seen(pub, "Santa Fe")));
check("Red: la pestaña Lista conserva la vista", (await pub.getByRole("link", { name: "Lista" }).getAttribute("href")) === "/red-contable");
check("Red (mobile): sin scroll horizontal", !(await overflow(pub)));
await pub.goto(`${BASE}/red-contable/${slug}`);
await pub.getByRole("link", { name: "Agendar llamada" }).click();
await pub.waitForURL(/\/agendar$/);
await pub.locator('[role="radiogroup"][aria-label="Día"] [role="radio"]').first().click();
await pub.locator('[role="radiogroup"][aria-labelledby="slot-label"] [role="radio"]').first().click();
await pub.fill("#name", "Persona de la Red");
await pub.fill("#email", "red-prueba@ejemplo.com");
await pub.getByRole("button", { name: "Confirmar llamada" }).click();
check("Red: llamada agendada con el estudio elegido", await seen(pub, "Tu llamada está confirmada"));
const [bk] = await sql`select b.studio_id, b.reason, l.id as lead from bookings b left join leads l on l.id = b.lead_id where b.email = 'red-prueba@ejemplo.com'`;
check("Red: la reserva y el contacto quedan en ese estudio, con el origen", bk?.studio_id === A && bk.reason?.startsWith("Desde la Red") && !!bk.lead);
await pub.goto(`${BASE}/red-contable/no-existe/agendar`);
check("Red: un estudio inexistente no tiene agenda", (await pub.content()).includes("404") || (await seen(pub, "no existe", 4000)));

// ── Consulta con IA: portal → estudio → portal ──
await sql`delete from ai_consults where organization_id = ${NORTE}`;
const cli = await as(d.cookies.duenaNorte, { width: 390 });
await cli.goto(`${BASE}/portal/solicitudes/nueva`);
check("Portal: el tema de la consulta aparece (plan con consultas con IA)", (await cli.locator("#tema").count()) === 1);
await cli.selectOption("#type", "consulta");
await cli.selectOption("#tema", "laboral");
await cli.fill("#subject", "Aguinaldo de diciembre");
await cli.fill("#body", "¿Hasta cuándo tengo para pagar el aguinaldo?");
await cli.getByRole("button", { name: "Enviar solicitud" }).click();
await cli.waitForURL(/\/portal\/solicitudes\/[0-9a-f-]{36}/);
const reqId = cli.url().match(/solicitudes\/([0-9a-f-]{36})/)[1];
let draft = null;
for (let i = 0; i < 30 && !draft; i++) {
  [draft] = await sql`select id, status from ai_consults where request_id = ${reqId} and status = 'borrador'`;
  if (!draft) await new Promise((r) => setTimeout(r, 500));
}
check("Consulta: la IA preparó el borrador después de responderle al cliente", !!draft);
check("Portal: el cliente no ve el borrador", !(await cli.content()).includes("Gracias por tu consulta"));
const st = await as(d.cookies.adminA);
await st.goto(`${BASE}/admin/solicitudes?ia=1`);
check("Estudio: filtro «Respuestas de la IA para revisar»", await seen(st, "Respuestas de la IA para revisar"));
await st.goto(`${BASE}/admin/solicitudes?id=${reqId}`);
check("Estudio: el borrador aparece arriba de la conversación", await seen(st, "respuesta preparada por la IA"));
const box = st.locator('textarea[name="body"]').first();
await box.fill(`${await box.inputValue()} Revisado por el estudio.`);
await st.getByRole("button", { name: "Aprobar y enviar" }).click();
check("Estudio: respuesta enviada", await seen(st, "Respuesta enviada al cliente"));
await cli.goto(`${BASE}/portal/solicitudes/${reqId}`);
check("Portal: el cliente ve la respuesta aprobada", await seen(cli, "Revisado por el estudio."));
const [cons] = await sql`select status, edited from ai_consults where request_id = ${reqId}`;
check("Consulta: aprobada y marcada como editada", cons.status === "aprobada" && cons.edited === true);

// ── Cartera y tareas ──
await st.goto(`${BASE}/admin/tareas`);
check("Tareas: ítem del grupo Operación y vista tabla", (await st.getByRole("link", { name: "Tareas" }).count()) > 0 && (await seen(st, "Pedir extractos")));
await st.goto(`${BASE}/admin/tareas?vista=kanban`);
check("Tareas: kanban con columnas", (await seen(st, "En curso")) && (await seen(st, "Hecha")));
await st.goto(`${BASE}/admin/tareas?vista=calendario`);
check("Tareas: calendario del mes", await seen(st, "Pedir extractos"));
const bt = await as(d.cookies.adminB);
await bt.goto(`${BASE}/admin`);
check("Plan Inicial: Tareas no aparece en el menú", (await bt.getByRole("link", { name: "Tareas", exact: true }).count()) === 0);

// ── Indicadores ──
await st.goto(`${BASE}/admin?tab=indicadores`);
check("Indicadores del estudio en Inicio", await seen(st, "Honorarios cobrados por mes"));
await st.goto(`${BASE}/admin/organizaciones/${NORTE}?tab=indicadores`);
check("Indicadores de la organización en la ficha", await seen(st, "Ventas y gastos por mes"));
const col = await as(d.cookies.colaboradorA);
await col.goto(`${BASE}/admin`);
check("Colaborador: sin pestaña Indicadores", (await col.getByRole("link", { name: "Indicadores" }).count()) === 0);
const dark = await as(d.cookies.adminA, { width: 390, theme: "dark" });
await dark.goto(`${BASE}/admin?tab=indicadores`);
check("Indicadores (mobile, oscuro): sin scroll horizontal", (await seen(dark, "Organizaciones activas")) && !(await overflow(dark)));

// ── Marca blanca ──
await st.goto(`${BASE}/admin/configuracion/avanzado`);
check("Configuración → Avanzado → Marca blanca", await seen(st, "Marca del portal"));
await st.locator('input[name="display_name"]').fill("Estudio Norte Marca");
await st.locator('input[name="primary"]').fill("#123456");
await st.getByRole("button", { name: "Guardar marca" }).click();
check("Marca guardada", await seen(st, "Marca guardada"));
await cli.goto(`${BASE}/portal`);
const vars = await cli.evaluate(() => document.querySelector(".admin-shell")?.getAttribute("style") ?? "");
check("Portal: colores del estudio y «Con tecnología de Faro»", vars.includes("#123456") && (await cli.content()).includes("Con tecnología de Faro"));
const cont = await as(d.cookies.contadorA);
await cont.goto(`${BASE}/admin/configuracion/avanzado`);
check("Contador: no entra a Avanzado", !(await seen(cont, "Marca del portal", 4000)));
const host = await (await browser.newContext()).newPage();
await host.goto(`http://${DOM}:3000/`);
check("Dominio propio: la raíz es el ingreso al portal con la marca", (await seen(host, "Estudio Norte Marca")) && (await seen(host, "Con tecnología de Faro")));
check("Dominio propio: sin «Continuar con Google»", !(await seen(host, "Google", 2000)));
await host.goto(`http://${DOM}:3000/admin`);
check("Dominio propio: el backoffice no se sirve ahí", /\/portal(\/login)?$/.test(new URL(host.url()).pathname));
await host.goto(`http://${DOM}:3000/faro`);
check("Dominio propio: la landing de Faro tampoco", new URL(host.url()).pathname.startsWith("/portal"));

// ── WhatsApp ──
await cli.goto(`${BASE}/portal/mas`);
await cli.getByRole("link", { name: /WhatsApp/ }).click();
check("Portal: WhatsApp con el número verificado", await seen(cli, "Tu número verificado"));
const [acc] = await sql`select phone_number_id from whatsapp_accounts where studio_id is null`;
const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000500010d0a2db40000000049454e44ae426082", "hex").toString("base64");
const before = (await sql`select count(*)::int n from smart_documents where organization_id = ${NORTE}`)[0].n + (await sql`select count(*)::int n from documents where organization_id = ${NORTE} and external_source = 'whatsapp'`)[0].n;
const inb = await (await fetch(`${WA}/__inbound`, { method: "POST", body: JSON.stringify({ webhook: `${BASE}/api/whatsapp/webhook`, app_secret: "app-secret-de-prueba", phone_number_id: acc.phone_number_id, from: "5491122334455", image_base64: png, mime: "image/png", text: "ticket del súper" }) })).json();
const after = (await sql`select count(*)::int n from smart_documents where organization_id = ${NORTE}`)[0].n + (await sql`select count(*)::int n from documents where organization_id = ${NORTE} and external_source = 'whatsapp'`)[0].n;
check("WhatsApp: el comprobante entra a la organización", inb.webhook?.status === 200 && after === before + 1, JSON.stringify(inb.webhook));
const replies = (await (await fetch(`${WA}/__sent`)).json()).sent.filter((m) => m.type === "text" && m.to === "5491122334455");
check("WhatsApp: le confirmamos al cliente que lo recibimos", replies.some((m) => m.text.body.startsWith("¡Recibido!")));
await st.goto(`${BASE}/admin/configuracion/avanzado?tab=whatsapp`);
check("Configuración → Avanzado → WhatsApp: plantillas y mensajes", (await seen(st, "faro_aviso_general")) && (await seen(st, "Últimos mensajes")));
await st.goto(`${BASE}/faro-manager/whatsapp`);
check("Faro Manager → Plataforma → WhatsApp", (await seen(st, "Número de Faro")) && (await seen(st, "Últimos webhooks")));
const b = await as(d.cookies.adminB);
await b.goto(`${BASE}/admin/configuracion/avanzado?tab=whatsapp`);
check("Plan Inicial: WhatsApp bloqueado con el plan que lo incluye", await seen(b, "viene con el plan Avanzado"));

check("Sin errores de JavaScript", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
await sql.end();
console.log(failures ? `\n${failures} fallas` : "\nTodo OK");
process.exit(failures ? 1 : 0);
