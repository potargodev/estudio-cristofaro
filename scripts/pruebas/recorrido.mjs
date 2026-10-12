// Recorrido de diseño: entra con cada perfil de la demo, sigue los links
// internos de su espacio (hasta N pantallas) y en cada una mide, a 390 y a
// 1440 px: desborde horizontal, texto de menos de 11 px, alturas de controles
// fuera del sistema (36/44 px), títulos de bloque en la serif y errores de JS.
//
//   PW=... node --env-file=.env.local scripts/pruebas/recorrido.mjs [máximo por perfil]
import { createHmac, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const { chromium } = await import(process.env.PW ?? "playwright");
const BASE = process.env.FARO_URL ?? "http://localhost:3000";
const MAX = Number(process.argv[2] ?? 60);
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const PERFILES = {
  persona: { email: "persona@demo.faro.local", start: ["/personal", "/cajas", "/bitacora", "/grupos", "/contador", "/mensajes", "/vigia"] },
  autonomo: { email: "autonomo@demo.faro.local", start: ["/personal", "/cajas", "/facturacion", "/flotas", "/contador"] },
  estudio: { email: "duena.estudio@demo.faro.local", start: ["/admin", "/admin/organizaciones", "/admin/vencimientos", "/admin/solicitudes", "/admin/tareas", "/admin/comercial", "/admin/honorarios", "/admin/configuracion"] },
  organizacion: { email: "duena.organizacion@demo.faro.local", start: ["/portal", "/portal/vencimientos", "/portal/documentos", "/portal/solicitudes", "/portal/empresa"] },
  empleado: { email: "empleada@demo.faro.local", start: ["/portal/empleado", "/portal/recibos", "/portal/rendiciones"] },
  manager: { email: "owner@faro.test", start: ["/faro-manager", "/faro-manager/tenants", "/faro-manager/planes", "/faro-manager/red", "/faro-manager/auditoria", "/faro-manager/demo"] },
};
const SKIP = /\/api\/|\/salir|signout|logout|\.csv|\.pdf|download|archivo|exportar|\/ingresar|\/login|\/legal|\/ayuda\/|#|mailto:|tel:|wa\.me|\/f\/|\/caja\/|\/invitacion|\/oauth/i;

async function cookieFor(email) {
  const [u] = await sql`select id from users where email = ${email}`;
  if (!u) return null;
  const token = randomBytes(24).toString("base64url");
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${u.id}, now() + interval '1 day')`;
  return encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(token).digest("base64")}`);
}
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const issues = [];
let visited = 0;
for (const [perfil, cfg] of Object.entries(PERFILES)) {
  const cookie = await cookieFor(cfg.email);
  if (!cookie) continue;
  const ctxs = {};
  for (const w of [390, 1440]) {
    ctxs[w] = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: "reduce" });
    await ctxs[w].addCookies([{ name: "better-auth.session_token", value: cookie, domain: "localhost", path: "/" }]);
  }
  const queue = [...cfg.start];
  const seen = new Set();
  while (queue.length && seen.size < MAX) {
    const path = queue.shift();
    const key = path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id").replace(/\?.*$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    for (const w of [1440, 390]) {
      const p = await ctxs[w].newPage();
      const errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      let res;
      try {
        res = await p.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 30000 });
        await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
      } catch (e) {
        issues.push({ perfil, path, w, tipo: "no cargó", detalle: e.message.split("\n")[0] });
        await p.close();
        continue;
      }
      visited++;
      const status = res?.status() ?? 0;
      if (status >= 500) issues.push({ perfil, path, w, tipo: `HTTP ${status}`, detalle: "" });
      const m = await p.evaluate(() => {
        const main = document.querySelector("main") ?? document.body;
        const vis = (e) => e.offsetParent !== null && getComputedStyle(e).visibility !== "hidden";
        const tiny = [...main.querySelectorAll("*")].filter((e) => vis(e) && e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1) && parseFloat(getComputedStyle(e).fontSize) < 10.9 && !e.closest("svg,[aria-hidden=true],.sr-only")).map((e) => `${Math.round(parseFloat(getComputedStyle(e).fontSize))}px «${e.textContent.trim().slice(0, 30)}»`);
        const ctrls = [...main.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]):not([type=file]):not([type=color]):not([data-free]), select:not([aria-hidden=true])")].filter(vis).map((e) => Math.round(e.getBoundingClientRect().height)).filter((h) => h > 4 && h !== 36 && h !== 44);
        const btns = [...main.querySelectorAll("button, a[class*='bg-navy'], a[class*='border-navy']")].filter((e) => vis(e) && e.textContent.trim().length > 2 && !e.closest("table,[role=tablist],nav,[role=menu]") && getComputedStyle(e).display.includes("flex")).map((e) => Math.round(e.getBoundingClientRect().height)).filter((h) => h > 0 && h < 30);
        const serif = [...main.querySelectorAll("h2, h3, h4")].filter((e) => vis(e) && /Gilda/.test(getComputedStyle(e).fontFamily)).map((e) => e.textContent.trim().slice(0, 30));
        const links = [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href"));
        return { over: document.documentElement.scrollWidth - innerWidth, tiny: [...new Set(tiny)].slice(0, 4), ctrls: [...new Set(ctrls)], btns: [...new Set(btns)], serif, links };
      });
      if (m.over > 1) issues.push({ perfil, path, w, tipo: "desborde", detalle: `${m.over} px` });
      if (m.tiny.length) issues.push({ perfil, path, w, tipo: "texto chico", detalle: m.tiny.join(" · ") });
      if (m.ctrls.length) issues.push({ perfil, path, w, tipo: "alto de campo", detalle: m.ctrls.join("/") });
      if (w === 1440 && m.btns.length) issues.push({ perfil, path, w, tipo: "botón bajo", detalle: m.btns.join("/") });
      if (w === 1440 && m.serif.length) issues.push({ perfil, path, w, tipo: "título en serif", detalle: m.serif.join(" · ") });
      if (errs.length) issues.push({ perfil, path, w, tipo: "error JS", detalle: errs[0].slice(0, 120) });
      if (w === 1440) for (const l of m.links) if (!SKIP.test(l) && l.split("/")[1] === path.split("/")[1]) queue.push(l);
      await p.close();
    }
  }
  for (const c of Object.values(ctxs)) await c.close();
  console.log(`${perfil}: ${seen.size} pantallas`);
}
const byType = {};
for (const i of issues) byType[i.tipo] = (byType[i.tipo] ?? 0) + 1;
console.log(`\n${visited} cargas · ${issues.length} hallazgos`, byType);
for (const i of issues) console.log(`- [${i.tipo}] ${i.perfil} ${i.path} @${i.w}: ${i.detalle}`);
writeFileSync(process.env.SALIDA ?? "/tmp/recorrido.json", JSON.stringify(issues, null, 1));
await browser.close();
await sql.end();
