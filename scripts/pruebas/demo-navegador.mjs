// Demo (Diseño · etapa 5) en el navegador: cargarla desde el Faro Manager,
// entrar con cada perfil por usuario y contraseña, ver la franja de demo y
// que no aparece nada real, y borrarla sin tocar los datos reales.
//
//   PW=... node --env-file=.env.local scripts/pruebas/demo-navegador.mjs
import { createHmac, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import postgres from "postgres";
import { BASE, check, failures } from "./lib.mjs";

const { chromium } = await import(process.env.PW ?? "playwright");
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const seen = async (p, text, timeout = 20000) => p.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).then(() => true, () => false);
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
async function cookieFor(email) {
  const [u] = await sql`select id from users where email = ${email}`;
  const token = randomBytes(24).toString("base64url");
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${u.id}, now() + interval '1 day')`;
  return encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(token).digest("base64")}`);
}
async function page(cookie, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  if (cookie) await ctx.addCookies([{ name: "better-auth.session_token", value: cookie, domain: "localhost", path: "/" }]);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
}

const real = async () => (await sql`select (select count(*) from studios where not is_demo)::int s, (select count(*) from users where not is_demo)::int u, (select count(*) from obligations o join studios s on s.id = o.studio_id where not s.is_demo)::int o, (select count(*) from bitacora_entries b join users u on u.id = b.user_id where not u.is_demo)::int b`)[0];
const before = await real();

// Faro Manager: cargar la demo (solo el owner)
await sql`update users set two_factor_enabled = true, faro_role = 'faro_owner' where email = 'owner@faro.test'`;
const fm = await page(await cookieFor("owner@faro.test"));
await fm.goto(`${BASE}/faro-manager/demo`);
check("Faro Manager → Plataforma → Demo", await seen(fm, "Un universo de prueba"));
await fm.getByRole("button", { name: /Cargar la demo|Volver a cargar la demo/ }).click();
await fm.getByRole("alertdialog").getByRole("button", { name: "Cargar" }).click();
check("cargar la demo muestra los usuarios de cada perfil", await seen(fm, "Usuarios para recorrer la app", 60000));
const creds = await fm.$$eval("[data-demo-perfil]", (rows) => rows.map((r) => ({ label: r.getAttribute("data-demo-perfil"), email: r.querySelector(".font-mono").textContent.trim(), password: r.querySelector("[data-demo-clave]").textContent.trim() })));
check("seis perfiles con su contraseña", creds.length === 6 && creds.every((c) => /@demo\.faro\.local$/.test(c.email) && c.password.length >= 15));
const [aud] = await sql`select count(*)::int n from audit_log where action = 'demo.cargada' and actor_label = 'owner@faro.test'`;
check("cargar la demo queda en la auditoría (sin contraseñas)", aud.n >= 1 && !(await sql`select metadata::text m from audit_log where action = 'demo.cargada' order by created_at desc limit 1`)[0].m.includes(creds[0].password));
const [st] = await sql`select count(*)::int s from studios where is_demo`;
check("espacios marcados como demo", st.s >= 18);
check("los datos reales no cambiaron al cargar", JSON.stringify(await real()) === JSON.stringify(before));

// Un colaborador del estudio real no ve el botón
const colab = await page(await cookieFor("colaborador@estudiocristofaro.com"));
await colab.goto(`${BASE}/faro-manager/demo`);
check("alguien sin rol de Faro no entra a la demo del Faro Manager", !(await colab.evaluate(() => document.body.innerText.includes("Un universo de prueba"))));

// Entrar con cada perfil por usuario y contraseña
const login = async (c, studio) => {
  const p = await page(null, 390);
  if (studio) {
    await p.goto(`${BASE}/admin/login`);
    await p.getByLabel("Email").fill(c.email);
    await p.getByLabel("Contraseña").fill(c.password);
    await p.getByRole("button", { name: "Ingresar" }).click();
  } else {
    await p.goto(`${BASE}/ingresar`);
    await p.getByRole("tab", { name: /Usuario y contraseña/ }).click();
    await p.locator("#pw-email").fill(c.email);
    await p.locator("#pw-password").fill(c.password);
    await p.getByRole("button", { name: "Ingresar" }).click();
  }
  await p.waitForLoadState("networkidle");
  return p;
};
const by = (l) => creds.find((c) => c.label === l);
const checks = [
  ["Persona", false, "/personal", "Hola, Martina"],
  ["Autónomo", false, "/personal", "Hola, Julián"],
  ["Dueña de estudio", true, "/admin", "Hola, Gabriela"],
  ["Contador", true, "/admin", "Hola, Santiago"],
  ["Dueña de organización", false, "/portal", "Hola, Dana"],
  ["Empleada", false, "/portal", "Hola, Ema"],
];
for (const [label, studio, home, hello] of checks) {
  const p = await login(by(label), studio);
  const ok = await seen(p, hello);
  // Después de ingresar se pasa por /app, que lleva al inicio de su espacio
  check(`${label}: entra con usuario y contraseña y llega a su inicio (${home})`, ok, p.url());
  check(`${label}: franja «Demostración» y sin datos reales`, (await seen(p, "Estos datos son ficticios")) && !(await p.evaluate(() => /Agencia Norte SRL|Consultora Sur SAS|Estudio Cristofaro/.test(document.body.innerText))));
  check(`${label}: 390 px sin scroll horizontal`, await noHScroll(p));
  await p.context().close();
}
// Un usuario real (cliente) sigue sin poder entrar con contraseña
const [realClient] = await sql`select email from users where role = 'cliente' and not is_demo limit 1`;
const rc = await page(null);
await rc.goto(`${BASE}/ingresar`);
await rc.getByRole("tab", { name: /Usuario y contraseña/ }).click();
await rc.locator("#pw-email").fill(realClient.email);
await rc.locator("#pw-password").fill("cualquier-clave-123");
await rc.getByRole("button", { name: "Ingresar" }).click();
check("un cliente real sigue sin entrar con contraseña", await seen(rc, "incorrectos").then(async (a) => a || (await rc.evaluate(() => document.querySelector('[role="alert"]')?.textContent?.length > 0))));

// La dueña del estudio demo ve la Red Contable con estudios y postulaciones
const duena = await page(await cookieFor(by("Dueña de estudio").email));
await duena.goto(`${BASE}/admin/organizaciones`);
check("estudio demo: 20 organizaciones, incluido el nombre largo", (await seen(duena, "Distribuidora Mayorista de Productos Alimenticios")) && (await seen(duena, "Kiosco Don Pepe")));
await duena.goto(`${BASE}/admin/comercial/conexiones`);
check("estudio demo: conexiones en distintos estados", (await seen(duena, "Conectada")) && (await seen(duena, "En cierre")));

// Borrar la demo: solo lo de demo
await fm.reload();
await fm.getByRole("button", { name: "Borrar la demo" }).click();
await fm.getByRole("alertdialog").getByRole("button", { name: "Borrar" }).click();
check("borrar la demo", await seen(fm, "Demo borrada", 60000));
const [left] = await sql`select (select count(*) from studios where is_demo)::int s, (select count(*) from users where is_demo or email like '%@demo.faro.local')::int u, (select count(*) from fleets where is_demo)::int f`;
check("no queda nada de la demo", left.s === 0 && left.u === 0 && left.f === 0, JSON.stringify(left));
check("los datos reales siguen intactos", JSON.stringify(await real()) === JSON.stringify(before), JSON.stringify(await real()));
check("borrar la demo queda en la auditoría", (await sql`select count(*)::int n from audit_log where action = 'demo.borrada'`)[0].n >= 1);
check("sin errores de JavaScript", errors.length === 0, errors.slice(0, 3).join(" | "));
writeFileSync(new URL("./.demo-ultima.json", import.meta.url), JSON.stringify({ at: new Date().toISOString() }));
await browser.close();
await sql.end();
process.exit(failures ? 1 : 0);
