// Capturas de pantallas de la app a 1440 y 390 px, en claro y oscuro (diseño).
//
//   PW=/ruta/a/playwright node --env-file=.env.local scripts/pruebas/capturas.mjs <carpeta> [filtro]
//
// Usa los usuarios de datos.mjs (o de la demo si existe .demo.json) y una
// sesión firmada como las pruebas. Guarda <carpeta>/<perfil>-<pantalla>-<ancho>-<tema>.png

import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import postgres from "postgres";

const { chromium } = await import(process.env.PW ?? "playwright");
const BASE = process.env.FARO_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "capturas";
const filter = process.argv[3] ?? "";
mkdirSync(out, { recursive: true });
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

const LEGAL = JSON.parse(readFileSync(new URL("../../src/modules/legal/legal.generated.json", import.meta.url), "utf8"));
async function cookieFor(email) {
  const [u] = await sql`select id from users where email = ${email}`;
  if (!u) return null;
  // Capturas limpias: sin la guía ni el aviso de términos nuevos
  await sql`insert into user_preferences (user_id, data) values (${u.id}, ${sql.json({ guide: false })}) on conflict (user_id) do update set data = user_preferences.data || ${sql.json({ guide: false })}`;
  for (const d of LEGAL.filter((x) => ["terminos", "privacidad"].includes(x.key))) await sql`insert into legal_acceptances (user_id, document, version) values (${u.id}, ${d.key}, ${d.version}) on conflict do nothing`;
  const token = randomBytes(24).toString("base64url");
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${u.id}, now() + interval '1 day')`;
  const sig = createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(token).digest("base64");
  return `${encodeURIComponent(`${token}.${sig}`)}`;
}

const demo = existsSync(new URL("./.demo.json", import.meta.url)) ? JSON.parse(readFileSync(new URL("./.demo.json", import.meta.url), "utf8")) : null;
const P = demo?.perfiles ?? {
  estudio: process.env.ADMIN_EMAIL,
  persona: "titular@ejemplo.com",
  organizacion: "duena@agencianorte.com.ar",
  empleado: "empleada@agencianorte.com.ar",
  manager: "owner@faro.test",
};
const ROUTES = JSON.parse(readFileSync(process.env.RUTAS ?? new URL("./capturas-rutas.json", import.meta.url), "utf8"));

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let n = 0;
for (const [perfil, routes] of Object.entries(ROUTES)) {
  const email = P[perfil];
  const cookie = perfil === "publico" ? null : email ? await cookieFor(email) : null;
  if (perfil !== "publico" && !cookie) {
    console.log(`— sin usuario para ${perfil}`);
    continue;
  }
  for (const [name, path] of Object.entries(routes)) {
    if (filter && !`${perfil}-${name}`.includes(filter)) continue;
    for (const width of [1440, 390]) {
      for (const theme of ["light", "dark"]) {
        const ctx = await browser.newContext({ viewport: { width, height: width > 500 ? 900 : 844 }, deviceScaleFactor: 1, colorScheme: theme, reducedMotion: "reduce" });
        if (cookie) await ctx.addCookies([{ name: "better-auth.session_token", value: cookie, domain: "localhost", path: "/" }]);
        await ctx.addInitScript((t) => {
          try {
            localStorage.setItem("faro-tema", t);
          } catch {}
        }, theme);
        const page = await ctx.newPage();
        try {
          await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 });
          await page.waitForTimeout(400);
          await page.screenshot({ path: `${out}/${perfil}-${name}-${width}-${theme === "light" ? "claro" : "oscuro"}.png`, fullPage: true });
          n++;
        } catch (e) {
          console.log(`✘ ${perfil}/${name} ${width} ${theme}: ${e.message.split("\n")[0]}`);
        }
        await ctx.close();
      }
    }
  }
}
console.log(`${n} capturas en ${out}`);
await browser.close();
await sql.end();
