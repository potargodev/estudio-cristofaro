// Principios de producto en el navegador (390 px y escritorio, claro y oscuro),
// etapa por etapa. Correr después de datos.mjs, con el servidor en :3000.
//
//   PW=/ruta/a/playwright node --env-file=.env.local scripts/pruebas/principios-navegador.mjs [etapa]

import { createHmac, randomBytes } from "node:crypto";
import postgres from "postgres";
import { BASE, check, data, failures } from "./lib.mjs";

const { chromium } = await import(process.env.PW ?? "playwright");
const d = data();
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const only = process.argv[2];
const stage = (n) => !only || only === n;
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];

/** Cookie de sesión firmada para un usuario (como datos.mjs) */
async function cookieFor(userId) {
  const token = randomBytes(24).toString("base64url");
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${userId}, now() + interval '1 day')`;
  const sig = createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(token).digest("base64");
  return `better-auth.session_token=${encodeURIComponent(`${token}.${sig}`)}`;
}
/** Persona de prueba (tenant persona con su usuario titular) */
async function persona(email, name) {
  const [u0] = await sql`select id, studio_id from users where email = ${email}`;
  if (u0) return u0;
  const slug = `p-${randomBytes(4).toString("hex")}`;
  const [s] = await sql`insert into studios (slug, name, kind, plan_key, status) values (${slug}, ${name}, 'persona', 'persona_gratis', 'activo') returning id`;
  const [u] = await sql`insert into users (name, email, email_verified, role, studio_id) values (${name}, ${email}, true, 'titular', ${s.id}) returning id, studio_id`;
  await sql`update studios set owner_user_id = ${u.id} where id = ${s.id}`;
  await sql`insert into organizations (studio_id, name, status) values (${s.id}, ${name}, 'activa')`;
  return u;
}
async function as(cookie, { width = 390, dark = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: dark ? "dark" : "light" });
  if (cookie) {
    const [name, value] = cookie.split("=");
    await ctx.addCookies([{ name, value, domain: "localhost", path: "/" }]);
  }
  const page = await ctx.newPage();
  page.on("dialog", (dlg) => dlg.accept());
  page.on("pageerror", (e) => errors.push(e.message));
  return page;
}
const seen = async (p, text, timeout = 15000) => p.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).then(() => true, () => false);
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ─── Etapa 1 · Inicial gratis ───
if (stage("1")) {
  const pub = await as(null);
  await pub.goto(`${BASE}/precios`);
  await pub.getByRole("tab", { name: "Para estudios" }).click();
  check("/precios: Inicial gratis y sin prueba", (await seen(pub, "Gratis, sin prueba ni débito")) && (await seen(pub, "¿El plan Inicial es gratis de verdad?")));
  check("/precios: sin el precio viejo", !(await pub.evaluate(() => document.body.innerText.includes("USD 49"))));
  check("/precios en 390 px sin scroll horizontal", await noHScroll(pub));
  await pub.goto(`${BASE}/faro`);
  await pub.getByRole("tab", { name: /Contadores independientes/ }).first().click().catch(() => pub.getByText("Contadores independientes").first().click());
  check("/faro: estudios empiezan gratis", await seen(pub, "Hasta 5 organizaciones gratis con el plan Inicial"));
  await pub.goto(`${BASE}/faro/registro?tipo=studio`);
  check("registro: Inicial gratis", await seen(pub, "Estudios · Inicial, gratis"));

  await sql`update studios set plan_key = 'inicial', status = 'activo', trial_ends_at = null where id = ${d.studios.B}`;
  for (const dark of [false, true]) {
    const b = await as(d.cookies.adminB, { dark, width: dark ? 1280 : 390 });
    await b.goto(`${BASE}/admin/configuracion/plan`);
    check(`Plan y facturación (${dark ? "oscuro, escritorio" : "claro, 390 px"}): Inicial gratis sin débito ni prueba`, (await seen(b, "Gratis, sin vencimiento")) && (await seen(b, "Sin débito (plan gratis)")) && !(await b.evaluate(() => document.body.innerText.includes("Estás en la prueba gratis"))));
    check(`Plan y facturación sin scroll horizontal (${dark ? "oscuro" : "claro"})`, await noHScroll(b));
  }
  const [owner] = await sql`update users set two_factor_enabled = true where faro_role = 'faro_owner' returning id`;
  const fm = await as(await cookieFor(owner.id), { width: 1280 });
  await fm.goto(`${BASE}/faro-manager/planes`);
  check("Faro Manager: Inicial gratis sin prueba ni extra", await seen(fm, "Plan gratis: sin prueba, sin débito ni organizaciones extra."));
}

check("sin errores de JavaScript", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
await sql.end();
process.exit(failures ? 1 : 0);
