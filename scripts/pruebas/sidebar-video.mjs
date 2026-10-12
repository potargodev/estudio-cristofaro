// Animación del sidebar (Diseño · etapa 4): graba un video del colapso y la
// expansión, mide los cuadros por segundo y prueba que no bloquea clics y
// que con movimiento reducido el cambio es directo.
//   PW=... node --env-file=.env.local scripts/pruebas/sidebar-video.mjs <carpeta>
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { BASE, check, failures } from "./lib.mjs";

const { chromium } = await import(process.env.PW ?? "playwright");
const out = process.argv[2] ?? "video";
mkdirSync(out, { recursive: true });
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const [u] = await sql`select id from users where email = 'duena.estudio@demo.faro.local'`;
const token = randomBytes(24).toString("base64url");
await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${u.id}, now() + interval '1 day')`;
await sql`insert into user_preferences (user_id, data) values (${u.id}, ${sql.json({ guide: false, sidebar: "expanded" })}) on conflict (user_id) do update set data = user_preferences.data || ${sql.json({ guide: false, sidebar: "expanded" })}`;
const cookie = encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(token).digest("base64")}`);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function ctx(opts = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 810 }, ...opts });
  await c.addCookies([{ name: "better-auth.session_token", value: cookie, domain: "localhost", path: "/" }]);
  return c;
}
/** Cuadros que se pintaron durante ms milisegundos */
const fps = (p, ms) => p.evaluate((ms) => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(Math.round((n * 1000) / (performance.now() - t0))); }; requestAnimationFrame(f); }), ms);

// Cuadros por segundo sin grabar (la grabación del video consume CPU)
{
  const c = await ctx();
  const t = await c.newPage();
  await t.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const [a] = await Promise.all([fps(t, 900), t.getByRole("button", { name: /Contraer la barra lateral/ }).click()]);
  await t.waitForTimeout(900);
  const [b] = await Promise.all([fps(t, 900), t.getByRole("button", { name: /Expandir la barra lateral/ }).click()]);
  check(`sin grabar: ${a} cuadros por segundo al colapsar y ${b} al expandir`, a >= 55 && b >= 55);
  await c.close();
}

// Video
const v = await ctx({ recordVideo: { dir: out, size: { width: 1440, height: 810 } } });
const p = await v.newPage();
await p.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
await p.waitForTimeout(800);
const collapse = p.getByRole("button", { name: /Contraer la barra lateral/ });
const [rate] = await Promise.all([fps(p, 900), collapse.click()]);
check(`colapsar: se mantiene fluido (${rate} cuadros por segundo, grabando video)`, rate >= 45);
await p.waitForTimeout(900);
const bar = p.locator("nav[aria-label='Menú'] ul li a[aria-label]");
check("colapsado: los íconos quedan en la barra superior", (await bar.count()) >= 5);
check("colapsado: no hay etiquetas del sidebar", !(await p.locator("aside nav[aria-label='Menú']").isVisible().catch(() => false)));
await p.waitForTimeout(500);
const expand = p.getByRole("button", { name: /Expandir la barra lateral/ });
const [rate2] = await Promise.all([fps(p, 900), expand.click()]);
check(`expandir: se mantiene fluido (${rate2} cuadros por segundo, grabando video)`, rate2 >= 45);
await p.waitForTimeout(900);
check("expandido: vuelven las etiquetas", await p.locator("aside").getByText("Organizaciones", { exact: true }).isVisible());
// No bloquea clics: durante la animación se puede tocar un link del contenido
await p.getByRole("button", { name: /Contraer la barra lateral/ }).click();
await p.waitForTimeout(80);
await p.getByRole("link", { name: "Ver vencimientos" }).first().click();
await p.waitForURL(/\/admin\/vencimientos/, { timeout: 8000 }).then(() => check("durante la animación los clics funcionan", true), () => check("durante la animación los clics funcionan", false));
await p.waitForTimeout(600);
await p.getByRole("button", { name: /Expandir la barra lateral/ }).click();
await p.waitForTimeout(1200);
await v.close();
const file = readdirSync(out).find((f) => f.endsWith(".webm"));
if (file) renameSync(path.join(out, file), path.join(out, "sidebar.webm"));

// Movimiento reducido: el cambio es directo
const r = await ctx({ reducedMotion: "reduce" });
const q = await r.newPage();
await q.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
await q.getByRole("button", { name: /Contraer la barra lateral/ }).click();
await q.waitForTimeout(60);
check("con movimiento reducido: colapsa al instante", (await q.locator("nav[aria-label='Menú'] ul li a[aria-label]").count()) >= 5 && (await q.locator("aside.keep-dark").count()) === 0);
await q.getByRole("button", { name: /Expandir la barra lateral/ }).click();
await r.close();
await sql`update user_preferences set data = data || ${sql.json({ sidebar: "expanded" })} where user_id = ${u.id}`;
await browser.close();
await sql.end();
process.exit(failures ? 1 : 0);
