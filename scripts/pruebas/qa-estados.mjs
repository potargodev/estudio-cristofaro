// QA visual · estados que el recorrido no ve solo: datos extremos (nombres de
// 80 caracteres, montos de 12 dígitos y negativos, listas de 0 y 200 ítems),
// avisos de éxito y de error largos, formularios con errores, diálogos y
// hojas, el panel del Vigía, la paleta de búsqueda, la campanita, 404, la
// pantalla cargando y el sidebar en plena animación. Corre el detector en cada
// estado y guarda una captura de cada uno (para la revisión de la etapa 3).
// Siembra sus datos en la demo y los borra al terminar.
//
//   node --env-file=.env.local scripts/pruebas/qa-estados.mjs [--capturas=dir]
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { detect } from "./qa/detector.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? true]));
const pw = await import(process.env.PW ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
const { chromium } = pw.chromium ? pw : pw.default;
const BASE = process.env.FARO_URL ?? "http://localhost:3000";
const SHOTS = typeof args.capturas === "string" ? args.capturas : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
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

// ─── Datos extremos (en la demo, con un marcador para borrarlos) ───
const LONG = "Distribuidora Integral de Insumos Industriales y Servicios Logísticos del Sur SA";
const [studio] = await sql`select id from studios where name like 'Ferreyra%' limit 1`;
await sql`delete from organizations where studio_id = ${studio.id} and name = ${LONG}`;
const [qa] = await sql`insert into organizations (studio_id, name, status) values (${studio.id}, ${LONG}, 'activa') returning id`;
await sql`insert into legal_entities (studio_id, organization_id, cuit, business_name, regime) values (${studio.id}, ${qa.id}, '30711111112', ${LONG}, 'responsable_inscripto') on conflict do nothing`;
const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const day = (n) => new Date(Date.parse(today) + n * 86400000).toISOString().slice(0, 10);
const taxes = ["IVA", "Ingresos Brutos Convenio Multilateral", "Ganancias sociedades · anticipo", "Cargas sociales F.931", "Impuesto sobre los débitos y créditos bancarios"];
await sql`insert into obligations ${sql(
  Array.from({ length: 200 }, (_, i) => ({ studio_id: studio.id, organization_id: qa.id, tax: taxes[i % taxes.length], period: `2026-${String((i % 12) + 1).padStart(2, "0")}`, due_date: day((i % 40) - 10), status: i % 7 === 0 ? "vencido" : "pendiente", amount: i % 3 === 0 ? "999999999999.99" : i % 3 === 1 ? "-123456789012.34" : "0", notes: i % 5 === 0 ? `${LONG} · ${LONG}` : null })),
)}`;
const [lola] = await sql`select o.id from organizations o where o.studio_id = ${studio.id} and o.name ilike 'Indumentaria Lola%' limit 1`;
await sql`delete from stock_products where organization_id = ${lola.id} and code like 'QA-%'`;
await sql`insert into stock_products ${sql(Array.from({ length: 200 }, (_, i) => ({ studio_id: studio.id, organization_id: lola.id, code: `QA-${String(i).padStart(3, "0")}-${"X".repeat(i % 2 ? 12 : 0)}`, description: i % 2 ? `${LONG} talle ${i}` : `Producto ${i}`, cost: i % 3 ? "999999999999.99" : "0", price: "999999999999.99", min_stock: i % 4 ? null : "10" })))}`;
const [persona] = await sql`select id from users where email = 'persona@demo.faro.local'`;
await sql`delete from bitacora_entries where user_id = ${persona.id} and description like 'QA %'`;
await sql`insert into bitacora_entries (user_id, kind, amount, currency, date, description) values (${persona.id}, 'gasto', 99999999999999, 'ARS', ${today}, ${`QA ${LONG}`}), (${persona.id}, 'ingreso', 99999999999999, 'ARS', ${today}, 'QA ingreso enorme')`;
const [empty] = await sql`select id from organizations where studio_id = ${studio.id} and name ilike 'Kiosco Don Pepe%' limit 1`;

const ERR = encodeURIComponent("No pudimos guardar los cambios porque la CUIT 30-71111111-2 ya está cargada en otra organización del estudio. Revisá los datos o pedile ayuda al equipo.");
const OK = encodeURIComponent("Listo: guardamos los cambios y avisamos por mail a las 3 personas de la organización.");

const SCEN = [
  // perfil, nombre, ruta, acción opcional
  ["estudio", "extremo · organizaciones (nombre de 80)", "/admin/organizaciones"],
  ["estudio", "extremo · ficha", `/admin/organizaciones/${qa.id}`],
  ["estudio", "extremo · 200 vencimientos", `/admin/organizaciones/${qa.id}?tab=vencimientos`],
  ["estudio", "extremo · vencimientos del estudio", "/admin/vencimientos"],
  ["estudio", "extremo · stock con 200 productos", `/admin/organizaciones/${lola.id}?tab=stock`],
  ["estudio", "extremo · inventario", `/admin/organizaciones/${lola.id}?tab=stock&ver=inventario`],
  ["persona", "extremo · bitácora con montos de 12 dígitos", "/bitacora"],
  ...(empty ? ["vencimientos", "documentos", "solicitudes", "sueldos", "stock", "iva", "conciliacion", "arca", "integraciones"].map((t) => ["estudio", `vacío · ${t}`, `/admin/organizaciones/${empty.id}?tab=${t}`]) : []),
  ["estudio", "error largo", `/admin/configuracion?error=${ERR}`],
  ["estudio", "éxito (aviso)", `/admin/configuracion?ok=${OK}`],
  ["estudio", "error en la ficha", `/admin/organizaciones/${qa.id}?error=${ERR}`],
  ["autonomo", "error en facturación", `/facturacion/ajustes?error=${ERR}`],
  ["organizacion", "error en el portal", `/portal/solicitudes?error=${ERR}`],
  ["persona", "éxito en grupos", `/grupos?ok=${OK}`],
  ["estudio", "404 del estudio", "/admin/esto-no-existe"],
  ["organizacion", "404 del portal", "/portal/esto-no-existe"],
  ["publico", "404 de la web", "/esto-no-existe"],
  ["estudio", "paleta de búsqueda", "/admin", "paleta"],
  ["estudio", "campanita", "/admin", "campanita"],
  ["estudio", "menú de la cuenta", "/admin", "cuenta"],
  ["estudio", "ayuda", "/admin", "ayuda"],
  ["estudio", "Vigía", "/admin/vigia"],
  ["persona", "Vigía personal", "/vigia"],
  ["estudio", "diálogos de la ficha", `/admin/organizaciones/${qa.id}`, "dialogos"],
  ["estudio", "diálogos de vencimientos", "/admin/vencimientos", "dialogos"],
  ["persona", "diálogos de la bitácora", "/bitacora", "dialogos"],
  ["estudio", "formulario con errores (organización nueva)", "/admin/organizaciones/nueva", "enviar-vacio"],
  ["autonomo", "formulario con errores (factura nueva)", "/facturacion/nueva", "enviar-vacio"],
  ["publico", "formulario con errores (contacto)", "/contacto", "enviar-vacio"],
  ["estudio", "cargando", "/admin/organizaciones", "cargando"],
  ["estudio", "sidebar en animación", "/admin", "animacion"],
];

const EMAILS = { estudio: "duena.estudio@demo.faro.local", persona: "persona@demo.faro.local", autonomo: "autonomo@demo.faro.local", organizacion: "duena.organizacion@demo.faro.local", publico: null };
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const issues = [];
let n = 0;
const cookies = {};
for (const [perfil, email] of Object.entries(EMAILS)) cookies[perfil] = email ? await cookieFor(email) : "";

async function check(p, ctx) {
  await p.evaluate(() => document.fonts?.ready).catch(() => undefined);
  const found = await p.evaluate(detect, {});
  n++;
  for (const f of found) issues.push({ ...ctx, ...f });
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/${ctx.perfil}-${ctx.estado.replace(/[^a-z0-9áéíóúñ]+/gi, "_")}-${ctx.w}-${ctx.scheme}.png`, fullPage: true }).catch(() => undefined);
}

for (const [perfil, nombre, path, action] of SCEN) {
  for (const [w, scheme] of [
    [1440, "light"],
    [390, "dark"],
  ]) {
    const motion = action === "animacion";
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: motion ? "no-preference" : "reduce", colorScheme: scheme });
    if (cookies[perfil]) await ctx.addCookies([{ name: "better-auth.session_token", value: cookies[perfil], domain: "localhost", path: "/" }]);
    const p = await ctx.newPage();
    const base = { perfil, path, w, scheme };
    try {
      if (action === "cargando") {
        await p.route("**/*", async (r) => {
          if (r.request().resourceType() === "document" || r.request().headers()["rsc"]) await new Promise((res) => setTimeout(res, 50));
          await r.continue();
        });
        await p.goto(`${BASE}${path}`, { waitUntil: "commit" });
        await p.waitForTimeout(120);
        await check(p, { ...base, estado: nombre });
        await ctx.close();
        continue;
      }
      await p.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 30000 });
      await p.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => undefined);
      if (!action || ["cargando"].includes(action)) await check(p, { ...base, estado: nombre });
      if (action === "paleta") {
        await p.keyboard.press("Control+k");
        await p.waitForTimeout(250);
        await check(p, { ...base, estado: nombre });
        await p.keyboard.type("iva");
        await p.waitForTimeout(250);
        await check(p, { ...base, estado: `${nombre} con resultados` });
      }
      const clickBy = async (selector) => {
        for (const e of await p.$$(selector)) if (await e.isVisible().catch(() => false)) return e.click().then(() => true);
        return false;
      };
      if (action === "campanita" && (await clickBy('button[aria-label*="Avisos"], button[aria-label*="avisos"]'))) {
        await p.waitForTimeout(250);
        await check(p, { ...base, estado: nombre });
      }
      if (action === "cuenta" && (await clickBy('button[aria-label*="cuenta" i], button[aria-label*="Tu cuenta" i]'))) {
        await p.waitForTimeout(250);
        await check(p, { ...base, estado: nombre });
      }
      if (action === "ayuda" && (await clickBy('button[aria-label*="Ayuda" i]'))) {
        await p.waitForTimeout(250);
        await check(p, { ...base, estado: nombre });
      }
      if (action === "dialogos") {
        const triggers = await p.$$('[data-slot="dialog-trigger"], button[aria-haspopup="dialog"]');
        let k = 0;
        for (const t of triggers) {
          if (k >= 4 || !(await t.isVisible().catch(() => false))) continue;
          const label = ((await t.getAttribute("aria-label")) || (await t.textContent()) || "").trim().slice(0, 30);
          await t.click().catch(() => undefined);
          await p.waitForTimeout(300);
          await check(p, { ...base, estado: `${nombre} · «${label}»` });
          await p.keyboard.press("Escape");
          await p.waitForTimeout(150);
          k++;
        }
        if (!k) await check(p, { ...base, estado: `${nombre} (sin diálogos)` });
      }
      if (action === "enviar-vacio") {
        const form = (await p.$$("main form")).at(-1) ?? (await p.$("form"));
        if (form) {
          await form.evaluate((f) => {
            f.setAttribute("novalidate", "");
            for (const i of f.querySelectorAll("[required]")) i.removeAttribute("required");
          });
          const submit = await form.$('button[type="submit"], button:not([type])');
          if (submit) await submit.click().catch(() => undefined);
          await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
          await p.waitForTimeout(400);
        }
        await check(p, { ...base, estado: nombre });
      }
      if (action === "animacion" && w === 1440) {
        const col = await p.$('button[aria-label^="Contraer la barra lateral"]');
        if (col) {
          await col.click();
          for (const ms of [60, 180, 420]) {
            await p.waitForTimeout(ms === 60 ? 60 : 120);
            if (SHOTS) await p.screenshot({ path: `${SHOTS}/${perfil}-sidebar_animacion_${ms}ms-${w}-${scheme}.png` });
          }
          await p.waitForTimeout(800);
          await check(p, { ...base, estado: "sidebar colapsado" });
          const exp = await p.$('button[aria-label^="Expandir"]');
          if (exp) {
            await exp.click();
            await p.waitForTimeout(150);
            if (SHOTS) await p.screenshot({ path: `${SHOTS}/${perfil}-sidebar_expandiendo-${w}-${scheme}.png` });
            await p.waitForTimeout(900);
            await check(p, { ...base, estado: "sidebar expandido otra vez" });
          }
        }
      }
    } catch (e) {
      issues.push({ ...base, estado: nombre, tipo: "no cargó", detalle: e.message.split("\n")[0] });
    }
    await ctx.close();
  }
}
await browser.close();

// Limpieza de los datos extremos
await sql`delete from organizations where id = ${qa.id}`;
await sql`delete from stock_products where organization_id = ${lola.id} and code like 'QA-%'`;
await sql`delete from bitacora_entries where user_id = ${persona.id} and description like 'QA %'`;

const byType = {};
for (const i of issues) byType[i.tipo] = (byType[i.tipo] ?? 0) + 1;
writeFileSync(process.env.SALIDA ?? "/tmp/qa-estados.json", JSON.stringify(issues, null, 1));
console.log(`${n} estados medidos · ${issues.length} hallazgos`);
for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
for (const i of issues.slice(0, Number(args.mostrar ?? 40))) console.log(`✘ [${i.tipo}] ${i.perfil} ${i.estado} ${i.w} ${i.scheme} · ${i.sel ?? ""} «${i.texto ?? ""}» ${i.detalle ?? ""}`);
if (!issues.length) console.log("✔ sin defectos visuales en los estados");
await sql.end();
process.exit(issues.length ? 1 : 0);
