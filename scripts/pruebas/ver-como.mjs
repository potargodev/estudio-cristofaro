// «Ver como…» (Faro Manager → Plataforma → Demo): solo el owner de Faro, solo
// usuarios de la demo, franja permanente, vuelta en un clic, auditoría y sin
// forma de usarlo para entrar a un espacio real (IDs forzados y cookies).
//
//   npm run demo:seed && node --env-file=.env.local scripts/pruebas/ver-como.mjs
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { BASE, check, failures } from "./lib.mjs";

const pw = await import(process.env.PW ?? "/opt/node22/lib/node_modules/playwright/index.js");
const { chromium } = pw.chromium ? pw : pw.default;
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const OWNER = "verc-owner@faro.test";
const SUPPORT = "verc-soporte@faro.test";

const [home] = await sql`select id from studios where not is_demo order by created_at limit 1`;
for (const [email, role] of [[OWNER, "faro_owner"], [SUPPORT, "faro_support"]])
  await sql`insert into users (name, email, email_verified, role, studio_id, two_factor_enabled, faro_role) values (${email}, ${email}, true, 'dueno', ${home.id}, true, ${role})
    on conflict (email) do update set two_factor_enabled = true, faro_role = excluded.faro_role, active = true, must_change_password = false`;

async function cookieFor(email) {
  const [u] = await sql`select id from users where email = ${email}`;
  const token = randomBytes(24).toString("base64url");
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${u.id}, now() + interval '1 day')`;
  return `${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(token).digest("base64")}`;
}
async function page(email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  await ctx.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(await cookieFor(email)), domain: "localhost", path: "/" }]);
  return ctx.newPage();
}
const text = (p) => p.evaluate(() => document.body.innerText);

// Soporte de Faro: no ve la lista ni puede usar la acción
const sp = await page(SUPPORT);
await sp.goto(`${BASE}/faro-manager/demo`);
check("faro_support no ve «Ver como…»", !(await text(sp)).includes("Ver como…"));

// Owner: lista, entra como la persona de la demo y ve la franja
const p = await page(OWNER);
await p.goto(`${BASE}/faro-manager/demo`);
check("owner ve la lista «Ver como…»", (await text(p)).includes("Ver como…"));
const persona = (await sql`select id, name from users where email = 'persona@demo.faro.local'`)[0];
await p.locator("li", { hasText: persona.name }).getByRole("button", { name: "Ver como" }).click();
await p.waitForURL((u) => !u.pathname.startsWith("/faro-manager"));
check("entra al espacio de la persona demo", new URL(p.url()).pathname.startsWith("/personal"), p.url());
check("franja «Viendo como…» visible", (await text(p)).includes(`Viendo como ${persona.name}`));
await p.goto(`${BASE}/bitacora`);
check("la franja sigue en otra pantalla", (await text(p)).includes("Viendo como"));
const [start] = await sql`select count(*)::int n from audit_log where action = 'demo.ver_como_iniciar' and entity_id = ${persona.id}`;
check("inicio auditado", start.n > 0);

// Durante la simulación no hay poderes de Faro ni acceso a espacios reales
await p.goto(`${BASE}/faro-manager`);
check("sin Faro Manager mientras simula", !new URL(p.url()).pathname.startsWith("/faro-manager"), p.url());
const [realOrg] = await sql`select o.id from organizations o join studios s on s.id = o.studio_id where not s.is_demo limit 1`;
if (realOrg) {
  const r = await p.request.get(`${BASE}/admin/organizaciones/${realOrg.id}`, { maxRedirects: 0 });
  check("organización real forzando el ID: no entra", r.status() !== 200, String(r.status()));
}
// La cookie de «Ver como…» manipulada no muestra nada ni restaura otra sesión
const ctx = p.context();
const jar = await ctx.cookies();
await ctx.addCookies([{ name: "faro_ver_como", value: randomUUID(), domain: "localhost", path: "/" }]);
await p.goto(`${BASE}/personal`);
check("cookie forjada: sin franja", !(await text(p)).includes("Viendo como"));
await ctx.addCookies(jar.filter((c) => c.name === "faro_ver_como"));

// Volver a mi usuario en un clic
await p.goto(`${BASE}/personal`);
await p.getByRole("button", { name: "Volver a mi usuario" }).click();
await p.waitForURL((u) => u.pathname.startsWith("/faro-manager"));
check("vuelve al Faro Manager como owner", (await text(p)).includes("Ver como…"));
const [end] = await sql`select count(*)::int n from audit_log where action = 'demo.ver_como_terminar' and entity_id = ${persona.id}`;
check("fin auditado", end.n > 0);
const [left] = await sql`select count(*)::int n from sessions where user_agent = 'Faro · Ver como' and user_id = ${persona.id}`;
check("la sesión demo se borró", left.n === 0);

// Una cuenta real no se puede elegir (ID forzado en el formulario)
await p.goto(`${BASE}/faro-manager/demo`);
const [realUser] = await sql`select id from users where not is_demo and email = ${SUPPORT}`;
await p.evaluate((id) => {
  const input = document.querySelector('input[name="userId"]');
  input.value = id;
  input.form.requestSubmit();
}, realUser.id);
await p.waitForLoadState("networkidle");
check("usuario real forzado: rechazado", new URL(p.url()).pathname === "/faro-manager/demo" && (await text(p)).includes("Solo se puede ver la app como un usuario de la demo"), p.url());

await browser.close();
await sql.end();
console.log(failures ? `\n${failures} fallas` : "\nTodo en verde");
process.exit(failures ? 1 : 0);
