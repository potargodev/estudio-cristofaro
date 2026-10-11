// Medidas de diseño por pantalla (ancho de contenido, título, controles, desbordes a 390 px).
//   PW=... node --env-file=.env.local scripts/pruebas/medidas.mjs
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
const { chromium } = await import(process.env.PW ?? "playwright");
const BASE = process.env.FARO_URL ?? "http://localhost:3000";
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const P = { estudio: process.env.ADMIN_EMAIL, persona: "titular@ejemplo.com", organizacion: "duena@agencianorte.com.ar", empleado: "empleada@agencianorte.com.ar", manager: "owner@faro.test", ...(process.env.PERFILES ? JSON.parse(process.env.PERFILES) : {}) };
const ROUTES = JSON.parse(readFileSync(new URL("./capturas-rutas.json", import.meta.url), "utf8"));
async function cookieFor(email) {
  const [u] = await sql`select id from users where email = ${email}`;
  if (!u) return null;
  const token = randomBytes(24).toString("base64url");
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${u.id}, now() + interval '1 day')`;
  return encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(token).digest("base64")}`);
}
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const rows = [];
for (const [perfil, routes] of Object.entries(ROUTES)) {
  if (perfil === "publico") continue;
  const cookie = await cookieFor(P[perfil]);
  for (const [name, path] of Object.entries(routes)) {
    const r = { pantalla: `${perfil}/${name}` };
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      await ctx.addCookies([{ name: "better-auth.session_token", value: cookie, domain: "localhost", path: "/" }]);
      const page = await ctx.newPage();
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      const m = await page.evaluate(() => {
        const main = document.querySelector("main") ?? document.body;
        const h1 = main.querySelector("h1");
        const inner = h1?.closest("main > div, main > section") ?? main.firstElementChild;
        const controls = [...main.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, button")].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().height));
        const titles = [...main.querySelectorAll("h2, h3")].filter((e) => e.offsetParent).map((e) => Math.round(parseFloat(getComputedStyle(e).fontSize)));
        return {
          contenido: inner ? Math.round(inner.getBoundingClientRect().width) : null,
          h1: h1 ? Math.round(parseFloat(getComputedStyle(h1).fontSize)) : null,
          alturas: [...new Set(controls)].sort((a, b) => a - b).join("/"),
          subtitulos: [...new Set(titles)].sort((a, b) => a - b).join("/"),
          desborde: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      if (width === 1440) Object.assign(r, { ancho: m.contenido, h1: m.h1, alturas: m.alturas, subtitulos: m.subtitulos });
      else r.desborde390 = m.desborde;
      await ctx.close();
    }
    rows.push(r);
  }
}
console.log("| Pantalla | Ancho del contenido (1440) | Título | Alturas de controles | Tamaños de subtítulos | Desborde a 390 px |");
console.log("|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.pantalla} | ${r.ancho} px | ${r.h1 ?? "—"} px | ${r.alturas || "—"} | ${r.subtitulos || "—"} | ${r.desborde390 > 0 ? `**${r.desborde390} px**` : "no"} |`);
await browser.close();
await sql.end();
