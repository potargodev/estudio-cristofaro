// Regresión visual por captura: las pantallas y los menús principales, a
// 1.440 px en claro y a 390 px en oscuro, comparados píxel a píxel contra las
// referencias de docs/qa-visual/referencia, tomadas sobre la demo recién cargada
// (en la regresión corre justo después de cargarla). Los números, las fechas y los
// datos que cambian solos se tapan (máscara) para que la comparación mida el
// diseño y no el día. Falla si una captura cambia más del umbral; la imagen
// con la diferencia queda en $SALIDA. Con --actualizar reemplaza las
// referencias (después de revisar el cambio a ojo).
//
//   node --env-file=.env.local scripts/pruebas/qa-capturas.mjs [--actualizar]
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import postgres from "postgres";

const UPDATE = process.argv.includes("--actualizar");
const pw = await import(process.env.PW ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
const { chromium } = pw.chromium ? pw : pw.default;
const BASE = process.env.FARO_URL ?? "http://localhost:3000";
const REF = new URL("../../docs/qa-visual/referencia/", import.meta.url).pathname;
const OUT = process.env.SALIDA ?? "/tmp/qa-capturas";
const MAX_DIFF = 0.004; // 0,4 % de los píxeles
mkdirSync(REF, { recursive: true });
mkdirSync(OUT, { recursive: true });
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

async function cookieFor(email) {
  const [u] = await sql`select id from users where email = ${email}`;
  if (!u) return null;
  // Cada corrida arranca con la barra lateral abierta (una anterior pudo dejarla colapsada)
  await sql`update user_preferences set data = data - 'sidebar' where user_id = ${u.id}`;
  const token = randomBytes(24).toString("base64url");
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${u.id}, now() + interval '1 day')`;
  return encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(token).digest("base64")}`);
}

const clickVisible = async (p, selector) => {
  for (const e of await p.$$(selector)) if (await e.isVisible().catch(() => false)) return void (await e.click());
  throw new Error(`no encontré ${selector}`);
};

// nombre, perfil, ruta, acción (abre un menú), recorte (solo el menú)
const SHOTS = [
  ["estudio-inicio", "estudio", "/admin"],
  ["estudio-organizaciones", "estudio", "/admin/organizaciones"],
  ["estudio-selector-espacios", "estudio", "/admin", async (p) => {
    // En el celular el selector vive en el menú completo
    if ((p.viewportSize()?.width ?? 0) < 1024) await clickVisible(p, 'button[aria-label^="Más: el menú completo"]');
    await p.waitForTimeout(200);
    await clickVisible(p, '[data-tour="espacio"] button');
  }],
  ["estudio-menu-cuenta", "estudio", "/admin", (p) => clickVisible(p, 'button[aria-label^="Tu cuenta"]')],
  ["estudio-avisos", "estudio", "/admin", (p) => clickVisible(p, 'button[aria-label^="Avisos"]')],
  ["estudio-ayuda", "estudio", "/admin", (p) => clickVisible(p, 'button[aria-label="Ayuda y guía"]')],
  ["estudio-busqueda", "estudio", "/admin", (p) => p.keyboard.press("Control+k")],
  ["estudio-sidebar-colapsado", "estudio", "/admin", (p) => clickVisible(p, 'button[aria-label^="Contraer la barra lateral"]'), 1440],
  ["estudio-menu-celular", "estudio", "/admin", (p) => clickVisible(p, 'button[aria-label^="Más: el menú completo"]'), 390],
  ["portal-inicio", "organizacion", "/portal"],
  ["persona-bitacora", "persona", "/bitacora"],
  ["autonomo-facturacion", "autonomo", "/facturacion"],
  ["manager-resumen", "manager", "/faro-manager"],
  ["web-faro", null, "/faro"],
];
const EMAILS = { estudio: "duena.estudio@demo.faro.local", organizacion: "duena.organizacion@demo.faro.local", persona: "persona@demo.faro.local", autonomo: "autonomo@demo.faro.local", manager: "owner@faro.test" };

function compare(a, b) {
  if (a.width !== b.width || a.height !== b.height) return { ratio: 1, diff: null };
  const diff = new PNG({ width: a.width, height: a.height });
  let bad = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    const off = d > 48;
    if (off) bad++;
    diff.data[i] = off ? 255 : a.data[i] * 0.3;
    diff.data[i + 1] = off ? 0 : a.data[i + 1] * 0.3;
    diff.data[i + 2] = off ? 80 : a.data[i + 2] * 0.3;
    diff.data[i + 3] = 255;
  }
  return { ratio: bad / (a.width * a.height), diff };
}

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let fails = 0;
for (const [name, perfil, path, action, only] of SHOTS) {
  for (const [w, scheme] of [
    [1440, "light"],
    [390, "dark"],
  ]) {
    if (only && only !== w) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires", reducedMotion: "reduce", colorScheme: scheme, deviceScaleFactor: 1 });
    if (perfil) await ctx.addCookies([{ name: "better-auth.session_token", value: await cookieFor(EMAILS[perfil]), domain: "localhost", path: "/" }]);
    const p = await ctx.newPage();
    await p.goto(`${BASE}${path}`, { waitUntil: "load" });
    await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
    await p.evaluate(() => document.fonts?.ready);
    // Sin cursor parpadeante ni animaciones residuales
    await p.addStyleTag({ content: "*,*::before,*::after{caret-color:transparent!important;transition:none!important;animation:none!important}" });
    if (action) {
      try {
        await action(p);
      } catch (e) {
        console.log(`✘ ${name} ${w} ${scheme}: ${e.message}`);
        fails++;
        await ctx.close();
        continue;
      }
      await p.waitForTimeout(350);
    }
    const file = `${name}-${w}-${scheme}.png`;
    const mask = [p.locator(".num, time, [data-qa-mask], [aria-live]"), p.locator("text=/\\d{1,2}\\/\\d{1,2}|hace \\d+|\\d{1,2}:\\d{2}|\\d{1,2} (ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)|\\d{4}-\\d{2}|(lun|mar|mié|jue|vie|sáb|dom),/i")];
    const buf = await p.screenshot({ mask, maskColor: "#888888", animations: "disabled" });
    await ctx.close();
    if (UPDATE || !existsSync(`${REF}${file}`)) {
      writeFileSync(`${REF}${file}`, buf);
      console.log(`✔ ${name} ${w} ${scheme}: referencia ${UPDATE ? "actualizada" : "nueva"}`);
      continue;
    }
    const { ratio, diff } = compare(PNG.sync.read(buf), PNG.sync.read(readFileSync(`${REF}${file}`)));
    const ok = ratio <= MAX_DIFF;
    if (!ok) {
      fails++;
      writeFileSync(`${OUT}/${file}`, buf);
      if (diff) writeFileSync(`${OUT}/diferencia-${file}`, PNG.sync.write(diff));
    }
    console.log(`${ok ? "✔" : "✘"} ${name} ${w} ${scheme} · ${(ratio * 100).toFixed(2)} % distinto`);
  }
}
await browser.close();
await sql.end();
console.log(fails ? `\n${fails} capturas cambiaron (ver ${OUT})` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
