// QA visual al píxel: entra con los 6 perfiles de la demo, recorre sus
// pantallas (más las de §2.q: Agente, Stock, Sueldos, Libro IVA y
// Conciliación) a 390 y 1.440 px, en claro y oscuro, y corre el detector
// (scripts/prueba./qa/detector.mjs) sobre cada una. Con --estados abre además
// los menús y desplegables, recorre el foco con el teclado, pasa el mouse por
// el primer bloque y, a 1.440, colapsa el sidebar. Falla (código 1) ante
// cualquier defecto: es `npm run qa:visual` y corre en la regresión.
//
//   node --env-file=.env.local scripts/pruebas/qa-visual.mjs [--estados] [--max=N] [--perfil=estudio] [--capturas=dir]
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { detect } from "./qa/detector.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? true]));
const pw = await import(process.env.PW ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
const { chromium } = pw.chromium ? pw : pw.default;
const BASE = process.env.FARO_URL ?? "http://localhost:3000";
const MAX = Number(args.max ?? 40);
const SHOTS = typeof args.capturas === "string" ? args.capturas : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

const org = async (pattern) => (await sql`select o.id from organizations o join studios s on s.id = o.studio_id where s.name like 'Ferreyra%' and o.name ilike ${pattern} limit 1`)[0]?.id;
const payrollOrg = (await sql`select r.organization_id id from payroll_runs r join studios s on s.id = r.studio_id where s.name like 'Ferreyra%' limit 1`)[0]?.id;
const run = payrollOrg ? (await sql`select id from payroll_runs where organization_id = ${payrollOrg} order by created_at desc limit 1`)[0]?.id : null;
const bankOrg = (await sql`select b.organization_id id from bank_statements b join studios s on s.id = b.studio_id where s.name like 'Ferreyra%' limit 1`)[0]?.id;
const lola = await org("Indumentaria Lola%");
const invo = (await sql`select i.id, i.organization_id org from invoices i join studios s on s.id = i.studio_id where s.name like 'Ferreyra%' and i.status = 'autorizada' limit 1`)[0];
const stmt = bankOrg ? (await sql`select id from bank_statements where organization_id = ${bankOrg} limit 1`)[0]?.id : null;
const task = (await sql`select t.id from agent_tasks t join studios s on s.id = t.studio_id where s.name like 'Ferreyra%' limit 1`)[0]?.id;
const store = lola ? (await sql`select id from stock_stores where organization_id = ${lola} and platform = 'tiendanube' limit 1`)[0]?.id : null;
const nuevas = [
  "/admin/vigia?tab=agente",
  task && `/admin/vigia/agente/${task}`,
  payrollOrg && `/admin/organizaciones/${payrollOrg}?tab=sueldos`,
  payrollOrg && `/admin/organizaciones/${payrollOrg}/sueldos/liquidacion`,
  payrollOrg && `/admin/organizaciones/${payrollOrg}/sueldos/liquidacion?ver=novedades`,
  payrollOrg && `/admin/organizaciones/${payrollOrg}/sueldos/liquidacion?ver=ajustes`,
  run && `/admin/organizaciones/${payrollOrg}/sueldos/liquidacion/${run}`,
  run && `/admin/organizaciones/${payrollOrg}/sueldos/liquidacion/${run}?ver=informes`,
  stmt && `/admin/organizaciones/${bankOrg}/conciliacion/${stmt}`,
  invo && `/admin/organizaciones/${invo.org}/arca/${invo.id}`,
  invo && `/admin/organizaciones/${invo.org}?tab=documentos`,
  run && `/admin/organizaciones/${payrollOrg}/sueldos/liquidacion/${run}?ver=cambios`,
  payrollOrg && `/admin/organizaciones/${payrollOrg}?tab=iva`,
  bankOrg && `/admin/organizaciones/${bankOrg}?tab=conciliacion`,
  lola && `/admin/organizaciones/${lola}?tab=stock`,
  lola && `/admin/organizaciones/${lola}?tab=stock&ver=movimientos`,
  lola && `/admin/organizaciones/${lola}?tab=stock&ver=conteo`,
  store && `/admin/organizaciones/${lola}?tab=stock&ver=tiendas&tienda=${store}`,
  lola && `/admin/organizaciones/${lola}?tab=stock&ver=sin-vincular`,
  lola && `/admin/organizaciones/${lola}?tab=stock&ver=inventario`,
  // Parte A: núcleo, contabilidad y ajuste por inflación
  payrollOrg && `/admin/organizaciones/${payrollOrg}?tab=sistemas`,
  ...["asientos", "plan", "libros", "estados", "ctacte", "bienes", "moneda", "inflacion", "cierre"].map((v) => payrollOrg && `/admin/organizaciones/${payrollOrg}?tab=contabilidad&ver=${v}`),
].filter(Boolean);

const PERFILES = {
  persona: { email: "persona@demo.faro.local", start: ["/personal", "/cajas", "/bitacora", "/grupos", "/contador", "/mensajes", "/vigia"] },
  autonomo: { email: "autonomo@demo.faro.local", start: ["/personal", "/facturacion", "/facturacion/stock", "/facturacion/ajustes", "/cajas", "/flotas", "/contador"] },
  estudio: { email: "duena.estudio@demo.faro.local", start: ["/admin", ...nuevas, "/admin/organizaciones", "/admin/vencimientos", "/admin/solicitudes", "/admin/tareas", "/admin/comercial", "/admin/honorarios", "/admin/configuracion"] },
  organizacion: { email: "duena.organizacion@demo.faro.local", start: ["/portal", "/portal/vencimientos", "/portal/documentos", "/portal/solicitudes", "/portal/empresa"] },
  empleado: { email: "empleada@demo.faro.local", start: ["/portal/empleado", "/portal/recibos", "/portal/rendiciones"] },
  manager: { email: "owner@faro.test", start: ["/faro-manager", "/faro-manager/tenants", "/faro-manager/planes", "/faro-manager/convenios", "/faro-manager/indices", "/faro-manager/escudo", "/faro-manager/red", "/faro-manager/auditoria", "/faro-manager/demo"] },
  publico: { email: null, start: ["/", "/faro", "/faro/precios", "/ingresar", "/ayuda", "/servicios", "/contacto"] },
};
const SKIP = /\/api\/|\/salir|signout|logout|\.csv|\.pdf|download|archivo|exportar|\/login|\/legal|#|mailto:|tel:|wa\.me|\/f\/|\/caja\/|\/invitacion|\/oauth/i;

async function cookieFor(email) {
  const [u] = await sql`select id from users where email = ${email}`;
  if (!u) return null;
  // Cada corrida arranca con la barra lateral abierta (una anterior pudo dejarla colapsada)
  await sql`update user_preferences set data = data - 'sidebar' where user_id = ${u.id}`;
  const token = randomBytes(24).toString("base64url");
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${u.id}, now() + interval '1 day')`;
  return encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(token).digest("base64")}`);
}

const VARIANTS = [
  [1440, "light"],
  [390, "light"],
  [1440, "dark"],
  [390, "dark"],
];
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const issues = [];
let loads = 0;
let states = 0;

async function scan(p, ctx) {
  const found = await p.evaluate(detect, {});
  states++;
  for (const f of found) issues.push({ ...ctx, ...f });
  if (SHOTS && found.length) {
    const name = `${ctx.perfil}-${ctx.path.replace(/[^a-z0-9]+/gi, "_").slice(0, 60)}-${ctx.w}-${ctx.scheme}-${ctx.estado.replace(/[^a-z0-9]+/gi, "_")}.png`;
    await p.screenshot({ path: `${SHOTS}/${name}`, fullPage: ctx.estado === "pantalla" }).catch(() => undefined);
  }
  return found.length;
}

async function settle(p) {
  await p.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => undefined);
  await p.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await p.waitForTimeout(150);
}

async function recorrer(perfil, cfg) {
  const cookie = cfg.email ? await cookieFor(cfg.email) : "";
  if (cookie === null) return;
  const ctxs = {};
  for (const [w, scheme] of VARIANTS) {
    ctxs[`${w}-${scheme}`] = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires", reducedMotion: "reduce", colorScheme: scheme });
    if (cookie) await ctxs[`${w}-${scheme}`].addCookies([{ name: "better-auth.session_token", value: cookie, domain: "localhost", path: "/" }]);
  }
  const queue = [...cfg.start];
  const seen = new Set();
  while (queue.length && seen.size < MAX + cfg.start.length) {
    const path = queue.shift();
    const key = path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id");
    if (seen.has(key)) continue;
    seen.add(key);
    for (const [w, scheme] of VARIANTS) {
      const p = await ctxs[`${w}-${scheme}`].newPage();
      const errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      let res;
      try {
        res = await p.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 30000 });
      } catch (e) {
        issues.push({ perfil, path, w, scheme, estado: "pantalla", tipo: "no cargó", detalle: e.message.split("\n")[0] });
        await p.close();
        continue;
      }
      await settle(p);
      loads++;
      const ctx = { perfil, path, w, scheme, estado: "pantalla" };
      if ((res?.status() ?? 0) >= 500) issues.push({ ...ctx, tipo: `HTTP ${res.status()}`, detalle: "" });
      await scan(p, ctx);
      if (args.estados) {
        // Menús y desplegables: cada disparador visible, de a uno
        const triggers = await p.$$("button[aria-haspopup]:not([disabled]), [aria-expanded=false]:not([disabled])");
        let n = 0;
        for (const t of triggers) {
          if (n >= 8) break;
          if (!(await t.isVisible().catch(() => false))) continue;
          const label = ((await t.getAttribute("aria-label")) || (await t.textContent()) || "").trim().slice(0, 30);
          try {
            await t.click({ timeout: 2000 });
            await p.waitForTimeout(250);
            await scan(p, { ...ctx, estado: `menú «${label}»` });
            await p.keyboard.press("Escape");
            await p.waitForTimeout(100);
            if (p.url() !== `${BASE}${path}` && !p.url().startsWith(`${BASE}${path.split("?")[0]}`)) await p.goto(`${BASE}${path}`, { waitUntil: "load" });
          } catch {
            /* un disparador que se fue con el menú anterior */
          }
          n++;
        }
        // Foco con teclado: 6 tabulaciones
        await p.keyboard.press("Tab");
        for (let i = 0; i < 6; i++) {
          await p.keyboard.press("Tab");
          await p.waitForTimeout(40);
        }
        await scan(p, { ...ctx, estado: "foco con teclado" });
        // Hover sobre el primer bloque interactivo de la pantalla
        const hov = await p.$("main a, main button");
        if (hov && (await hov.isVisible().catch(() => false))) {
          await hov.hover().catch(() => undefined);
          await p.waitForTimeout(120);
          await scan(p, { ...ctx, estado: "hover" });
        }
        // Sidebar colapsado (escritorio)
        if (w === 1440) {
          const col = await p.$('button[aria-label^="Contraer la barra lateral"]');
          if (col) {
            await col.click().catch(() => undefined);
            await p.waitForTimeout(300);
            await scan(p, { ...ctx, estado: "sidebar colapsado" });
            const exp = await p.$('button[aria-label^="Expandir"]');
            if (exp) await exp.click().catch(() => undefined);
            await p.waitForTimeout(200);
          }
        } else {
          const open = await p.$('button[aria-label^="Más: el menú completo"]');
          if (open && (await open.isVisible().catch(() => false))) {
            await open.click().catch(() => undefined);
            await p.waitForTimeout(300);
            await scan(p, { ...ctx, estado: "menú del celular" });
            await p.keyboard.press("Escape");
          }
        }
      }
      if (errs.length) {
        // Un error de hidratación (#418) aparece a veces solo con el servidor muy cargado y React se
        // recupera solo con el mismo resultado: se vuelve a cargar una vez y cuenta si se repite.
        const again = [];
        if (errs.every((m) => m.includes("#418"))) {
          const q = await ctxs[`${w}-${scheme}`].newPage();
          q.on("pageerror", (e) => again.push(e.message));
          await q.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 30000 }).catch(() => undefined);
          await settle(q);
          await q.close();
        }
        if (!errs.every((m) => m.includes("#418")) || again.length) issues.push({ ...ctx, tipo: "error JS", detalle: (again[0] ?? errs[0]).slice(0, 160) });
      }
      if (w === 1440 && scheme === "light") {
        const links = await p.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href")));
        const root = path.split("/")[1];
        for (const l of links) if (!SKIP.test(l) && l.split("/")[1] === root && !l.startsWith("/ayuda/")) queue.push(l);
      }
      await p.close();
    }
  }
  for (const c of Object.values(ctxs)) await c.close();
  console.log(`${perfil}: ${seen.size} pantallas`);
}

// Los perfiles se recorren de a varios a la vez (--paralelo=N, 3 por defecto): cada uno con sus contextos
const pendientes = Object.entries(PERFILES).filter(([perfil]) => !args.perfil || args.perfil === perfil);
await Promise.all(
  Array.from({ length: Math.max(1, Number(args.paralelo ?? 3)) }, async () => {
    while (pendientes.length) await recorrer(...pendientes.shift());
  }),
);
await browser.close();

const byType = {};
for (const i of issues) byType[i.tipo] = (byType[i.tipo] ?? 0) + 1;
const out = process.env.SALIDA ?? "/tmp/qa-visual.json";
writeFileSync(out, JSON.stringify(issues, null, 1));
console.log(`\n${loads} cargas · ${states} estados medidos · ${issues.length} hallazgos`);
for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1])) console.log(`  ${v.toString().padStart(5)}  ${k}`);
console.log(`Detalle en ${out}`);
for (const i of issues.slice(0, Number(args.mostrar ?? 40))) console.log(`✘ [${i.tipo}] ${i.perfil} ${i.path} ${i.w} ${i.scheme} ${i.estado} · ${i.sel ?? ""} «${i.texto ?? ""}» ${i.detalle ?? ""}`);
if (!issues.length) console.log("✔ sin defectos visuales");
await sql.end();
process.exit(issues.length ? 1 : 0);
