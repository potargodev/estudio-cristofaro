// §2.p · B10 emisión en menos de 15 segundos desde el celular: abre la
// Factura rápida en un teléfono (390 px), escribe el importe, elige un
// cliente reciente o consumidor final y emite con Enter. Mide desde que se
// pide la pantalla hasta que se ve el CAE. También recorre «Empezar a
// facturar» y la factura de prueba en homologación.
//
//   FARO_URL=http://localhost:3000 node --env-file=.env.local scripts/pruebas/emision-rapida.mjs

import { createHmac, randomBytes } from "node:crypto";
import postgres from "postgres";

const BASE = process.env.FARO_URL ?? "http://localhost:3000";
const EMAIL = process.env.QA_AUTONOMO ?? "autonomo@demo.faro.local";
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const pw = await import(process.env.PW ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
const { chromium } = pw.chromium ? pw : pw.default;
let fails = 0;
const check = (l, ok, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};

const [u] = await sql`select u.id, u.studio_id, s.cuit from users u join studios s on s.id = u.studio_id where u.email = ${EMAIL}`;
// El simulador de ARCA (el mismo al que apunta el servidor) tiene que tener la CUIT delegada
const MOCK = (process.env.ARCA_WSFE_URL ?? "http://localhost:4060/wsfev1/service.asmx").replace(/\/wsfev1.*$/, "");
await fetch(`${MOCK}/__delegar?cuit=${u.cuit}`, { method: "POST" }).catch(() => null);
await fetch(`${MOCK}/__fuera?on=0`, { method: "POST" }).catch(() => null);
for (const r of await sql`select point_of_sale p, cbte_type t, max(number) n from invoices where cuit = ${u.cuit} and environment = 'homologacion' and number is not null group by 1, 2`)
  await fetch(`${MOCK}/__ultimo?cuit=${u.cuit}&pto=${r.p}&tipo=${r.t}&nro=${r.n}`, { method: "POST" }).catch(() => null);
const token = randomBytes(24).toString("base64url");
await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${u.id}, now() + interval '1 hour')`;
const cookie = encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(token).digest("base64")}`);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-AR" });
await ctx.addCookies([{ name: "better-auth.session_token", value: cookie, domain: new URL(BASE).hostname, path: "/" }]);
const p = await ctx.newPage();

// Onboarding, paso 2: probar la delegación trae de ARCA los puntos de venta
await p.goto(`${BASE}/facturacion/empezar`);
check("«Empezar a facturar» muestra los 3 pasos", (await p.getByText("Tu CUIT y tus datos").count()) > 0 && (await p.getByText("Delegá la factura electrónica en Faro").count()) > 0 && (await p.getByText("Una factura de prueba").count()) > 0);
await p.getByRole("button", { name: /Ya delegué|Volver a probar/ }).click();
await p.waitForLoadState("networkidle");
check("probar la delegación trae los puntos de venta de ARCA", /Delegación lista|Puntos de venta:/.test(await p.locator("body").innerText()));

const times = [];
for (const [i, amount] of ["1234,50", "800"].entries()) {
  const t0 = Date.now();
  await p.goto(`${BASE}/facturacion/rapida`);
  await p.getByLabel("Importe final").fill(amount);
  if (i === 1) await p.getByRole("button", { name: "Consumidor final", exact: true }).click();
  await p.getByLabel("Importe final").press("Enter");
  await p.waitForURL(/\/facturacion\/[0-9a-f-]{36}/, { timeout: 20_000 });
  const text = await p.locator("body").innerText();
  const secs = (Date.now() - t0) / 1000;
  times.push(secs);
  check(`factura rápida ${i + 1}: emitida con CAE`, /CAE \d{14}/.test(text), /Listo[^:]*: ARCA/.exec(text)?.[0] ?? text.slice(0, 120));
  check(`factura rápida ${i + 1}: en menos de 15 segundos en el celular`, secs < 15, `${secs.toFixed(1)} s`);
}
const [m] = await sql`select metadata->>'segundos' s from audit_log where action = 'factura.rapida' and studio_id = ${u.studio_id} order by created_at desc limit 1`;
check("el tiempo queda medido en la auditoría", m && Number(m.s) > 0, m?.s);

await p.goto(`${BASE}/facturacion/empezar`);
const before = (await sql`select count(*)::int n from invoices where studio_id = ${u.studio_id}`)[0].n;
await p.getByRole("button", { name: /factura de prueba|Probar de nuevo/ }).click();
await p.waitForLoadState("networkidle");
const body = await p.locator("body").innerText();
check("factura de prueba autorizada en homologación", /homologación \(CAE \d{14}\)|Autorizada en homologación/.test(body), body.match(/Factura de prueba[^.]*\./)?.[0] ?? "");
check("y no queda en los libros", (await sql`select count(*)::int n from invoices where studio_id = ${u.studio_id}`)[0].n === before);

console.log(`\nTiempos: ${times.map((t) => `${t.toFixed(1)} s`).join(" · ")}`);
await b.close();
await sql`delete from sessions where token = ${token}`;
await sql.end();
console.log(fails ? `\n${fails} fallas` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
