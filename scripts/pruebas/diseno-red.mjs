// Red Contable visible y clara (Diseño · etapa 6), con la demo cargada:
// entradas en todos los espacios, las dos vistas, el badge de candidatos
// nuevos, el interruptor de personas, empresas y Flotas, y 390 px / oscuro.
//   PW=... node --env-file=.env.local scripts/pruebas/diseno-red.mjs
import { createHmac, randomBytes } from "node:crypto";
import postgres from "postgres";
import { BASE, check, failures } from "./lib.mjs";

const { chromium } = await import(process.env.PW ?? "playwright");
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const seen = async (p, text, timeout = 15000) => p.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).then(() => true, () => false);
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
async function as(email, { width = 1280, dark = false } = {}) {
  const [u] = await sql`select id from users where email = ${email}`;
  const token = randomBytes(24).toString("base64url");
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${u.id}, now() + interval '1 day')`;
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: dark ? "dark" : "light" });
  await ctx.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(token).digest("base64")}`), domain: "localhost", path: "/" }]);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
}
const [demo] = await sql`select count(*)::int n from studios where is_demo`;
if (!demo.n) {
  console.log("Cargá la demo antes: npm run demo:seed");
  process.exit(1);
}
const DUENA = "duena.estudio@demo.faro.local";
const [u] = await sql`select id from users where email = ${DUENA}`;
await sql`update user_preferences set data = data - 'redSeenAt' where user_id = ${u.id}`;
// Idempotente: la empresa de la demo arranca sin postulación
await sql`delete from seeker_profiles where user_id = (select id from users where email = 'duena.organizacion@demo.faro.local')`;

// Estudio: badge de candidatos nuevos y las dos vistas
const e = await as(DUENA);
await e.goto(`${BASE}/admin`);
const badge = await e.locator("aside nav a[href='/admin/comercial']").innerText();
check("estudio: Comercial muestra candidatos nuevos de la Red", /\d/.test(badge), badge.replace(/\s+/g, " "));
await e.goto(`${BASE}/admin/comercial/consultas`);
check("estudio: «Buscar clientes» es la segunda pestaña de Comercial, con su badge", (await e.locator("nav[aria-label='Secciones'] li").nth(1).innerText()).match(/Buscar clientes\s*\d+/) !== null);
await e.goto(`${BASE}/admin/comercial/buscar-clientes`);
const cards = (await e.locator("[data-buscando]").allInnerTexts()).join(" ");
check("vista Postulaciones: anónimas y marcadas si coinciden con el perfil", (await seen(e, "Coincide con tu perfil")) && !/Diego|Mateo|Valentina|Ramón|Elena|@/.test(cards), cards.slice(0, 80));
check("vista Postulaciones: explica cómo funciona", await seen(e, "sin nombre ni contacto"));
await e.goto(`${BASE}/admin/comercial/consultas`);
check("mirar las postulaciones apaga el badge", !/Buscar clientes\s*\d+/.test(await e.locator("nav[aria-label='Secciones']").first().innerText()));
await e.goto(`${BASE}/admin/comercial/buscar-clientes?vista=estudios`);
check("vista Estudios y contadores: los estudios de la Red", (await e.locator("[data-estudio]").count()) >= 3 && (await seen(e, "Paz Contables (demo)")));
for (const [w, dark] of [[390, false], [1280, true]]) {
  const v = await as(DUENA, { width: w, dark });
  for (const path of ["/admin/comercial/buscar-clientes", "/admin/comercial/buscar-clientes?vista=estudios"]) {
    await v.goto(`${BASE}${path}`);
    await v.waitForLoadState("networkidle");
    check(`estudio ${path} (${w} px${dark ? ", oscuro" : ""}): sin scroll horizontal`, await noHScroll(v));
  }
}

// Persona: entrada en Contador y las dos vistas
const p = await as("persona@demo.faro.local", { width: 390 });
await p.goto(`${BASE}/contador`);
check("persona: Contador con las pestañas Mi contador y Red Contable", (await p.getByRole("link", { name: "Mi contador" }).count()) > 0 && (await p.getByRole("link", { name: "Red Contable" }).count()) > 0);
check("persona: acceso visible a «Disponible, busco contador»", (await seen(p, "Que los estudios te encuentren")) || (await seen(p, "Conectada")));
await p.goto(`${BASE}/red-contable`);
check("persona: Red Contable con las vistas Estudios y contadores y Mi postulación", (await p.getByRole("link", { name: "Estudios y contadores" }).count()) > 0 && (await p.getByRole("link", { name: /Mi postulación/ }).count()) > 0);
check("persona: 390 px sin scroll horizontal en la Red", await noHScroll(p));
const diego = await as("diego.luna@demo.faro.local", { width: 390 });
await diego.goto(`${BASE}/contador/disponible`);
check("Mi postulación: interruptor visible y estado «Visible en la Red»", (await diego.getByRole("checkbox", { name: "Disponible, busco contador" }).isChecked()) && (await seen(diego, "Visible en la Red")));
check("Mi postulación: contactos con su estado", (await seen(diego, "Ferreyra & Asociados (demo)")) && (await seen(diego, "Aceptado")));
check("Mi postulación: 390 px sin scroll horizontal", await noHScroll(diego));

// Organización: la empresa activa su postulación y un estudio la contacta
const org = await as("duena.organizacion@demo.faro.local");
await org.goto(`${BASE}/portal/empresa`);
check("organización: Empresa tiene la pestaña Red Contable", (await org.getByRole("link", { name: "Red Contable" }).count()) > 0);
await org.goto(`${BASE}/portal/red-contable`);
await org.getByRole("checkbox", { name: "Disponible, busco contador" }).check();
await org.locator("select[name=province]").selectOption("Mendoza");
await org.locator('input[name=needs][value="sueldos"]').check();
await org.getByRole("button", { name: "Guardar", exact: true }).click();
check("organización: la empresa queda visible", await seen(org, "ven a la empresa sin su nombre"));
const small = await as("dueno.paz@demo.faro.local");
await small.goto(`${BASE}/admin/comercial/buscar-clientes?provincia=Mendoza&tipo=empresa`);
check("otro estudio la ve como «Empresa», sin nombre", (await small.locator("[data-buscando=empresa]").count()) >= 1 && !(await small.evaluate(() => /Agencia Creativa Norte|Dana Lagos/.test(document.body.innerText))));
await small.locator("[data-buscando=empresa]").filter({ hasText: "Sueldos" }).first().getByRole("button", { name: "Contactar" }).click();
await seen(small, "Contacto enviado");
await org.goto(`${BASE}/portal/red-contable`);
await org.getByRole("button", { name: "Aceptar", exact: true }).click();
check("la empresa acepta y el estudio ve su contacto", await seen(org, "el estudio ya ve tus datos"));
await small.goto(`${BASE}/admin/comercial/buscar-clientes`);
check("el estudio ve el nombre y el mail recién al aceptar", await seen(small, "duena.organizacion@demo.faro.local"));
const empleada = await as("empleada@demo.faro.local");
await empleada.goto(`${BASE}/portal/red-contable`);
check("la empleada no maneja la Red de la empresa", !(await empleada.evaluate(() => document.body.innerText.includes("Disponible, busco contador"))));

// Flota: el Capitán ve el interruptor
const cap = await as("autonomo@demo.faro.local");
const [f] = await sql`select id from fleets where is_demo and name like 'Diseñadores%'`;
await cap.goto(`${BASE}/flotas/${f.id}`);
check("Flota: el Capitán ve «Disponible, busco contador»", await seen(cap, "Disponible, busco contador"));

check("sin errores de JavaScript", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
await sql.end();
process.exit(failures ? 1 : 0);
