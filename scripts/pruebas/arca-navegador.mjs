// Facturación de punta a punta en el navegador contra el simulador de ARCA:
// consultar la constancia, traer puntos de venta, armar el borrador, emitir
// (con confirmación), PDF, link público y su revocación, nota de crédito,
// semáforo y calendario; más aislamiento forzando IDs y el límite del plan.
// Solo desarrollo: datos.mjs + arca-datos.mts, el simulador y el servidor.
//
//   PW=/ruta/a/playwright node --env-file=.env.local scripts/pruebas/arca-navegador.mjs

import postgres from "postgres";
import { BASE, check, data, failures } from "./lib.mjs";

const { chromium } = await import(process.env.PW ?? "playwright");
const d = data();
const sql = postgres(process.env.DATABASE_URL);
const [tit] = await sql`select id from studios where slug = 'prueba-personal'`;
await sql`delete from invoices where studio_id = ${tit.id}`;
await sql`delete from invoice_customers where studio_id = ${tit.id}`;
await fetch("http://localhost:4030/__reset", { method: "POST" });
await sql`delete from arca_tickets`;

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const [name, value] = d.cookies.titular.split("=");
await ctx.addCookies([{ name, value: decodeURIComponent(value) === value ? value : value, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (dlg) => dlg.accept());
/** Espera un texto en la pantalla (las acciones redirigen con navegación del lado del cliente) */
const seen = async (text, timeout = 20000) => page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).then(() => true, () => false);

// Situación y delegación
await page.goto(`${BASE}/facturacion/arca`);
await page.getByRole("button", { name: /Consultar ahora/ }).click();
check("constancia consultada: monotributo categoría D", await seen("LOCACIONES DE SERVICIO"));
await page.goto(`${BASE}/facturacion/ajustes`);
await page.getByRole("button", { name: /Probar la delegación/ }).click();
check("delegación probada y puntos de venta traídos", await seen("La delegación funciona"));

// Borrador
await page.goto(`${BASE}/facturacion/nueva`);
await page.getByLabel("Nombre o razón social").fill("Juan Pérez");
await page.getByLabel("Condición frente al IVA").first().selectOption("responsable_inscripto");
await page.locator('input[name="doc_number"]').fill("20111111112");
await page.getByLabel("Descripción").first().fill("Diseño de logo");
await page.getByLabel("Precio unit.").first().fill("150000");
check("monotributista a responsable inscripto: factura C", (await page.locator('input[name="cbte_type"]').inputValue()) === "11");
await page.getByRole("button", { name: "Guardar borrador" }).click();
await page.waitForURL(/\/facturacion\/[0-9a-f-]{36}\?ok=/);
await seen("Borrador guardado");
const invoiceId = page.url().match(/facturacion\/([0-9a-f-]{36})/)[1];
check("borrador guardado", (await page.content()).includes("Borrador"));

// Emitir sin confirmar no se puede; confirmando, sí
await page.getByLabel(/Revisé el cliente/).check();
await page.getByRole("button", { name: "Emitir comprobante" }).click();
await page.getByRole("button", { name: "Emitir", exact: true }).click().catch(() => {});
check("emitido con CAE", await seen("ARCA lo autorizó"), errors.join(" | "));
const [inv] = await sql`select * from invoices where id = ${invoiceId}`;
check("en la base: autorizada, número 1, registro original", inv.status === "autorizada" && Number(inv.number) === 1 && !!inv.raw_response && !!inv.public_token);

// PDF y link público
const pdf = await page.request.get(`${BASE}/api/facturas/${invoiceId}/pdf`);
const bytes = await pdf.body();
check("PDF autenticado", pdf.status() === 200 && bytes.slice(0, 4).toString() === "%PDF");
const pub = await fetch(`${BASE}/f/${inv.public_token}`);
check("link público sin sesión", pub.status === 200 && (await pub.headers.get("content-type")) === "application/pdf");
await page.getByRole("button", { name: "Desactivar el link" }).click();
await seen("El link quedó desactivado");
check("link desactivado → 404", (await fetch(`${BASE}/f/${inv.public_token}`)).status === 404);

// Nota de crédito asociada
await page.getByRole("button", { name: "Nota de crédito" }).click();
await seen("Armamos la nota de");
check("nota de crédito armada como borrador (tipo 13)", (await page.locator('input[name="cbte_type"]').inputValue()) === "13");

// Semáforo y calendario
await page.goto(`${BASE}/facturacion/monotributo`);
check("semáforo con lo facturado", (await page.content()).includes("150.000") && (await page.content()).includes("Vas bien"));
await page.goto(`${BASE}/facturacion/calendario`);
await page.getByRole("button", { name: /Guardar y armar/ }).click();
check("calendario armado (cuota de monotributo)", await seen("Cuota mensual"));

// Aislamiento: el PDF y el detalle de otro tenant no se ven forzando IDs
const asAdminA = await fetch(`${BASE}/api/facturas/${invoiceId}/pdf?org=${d.orgs.norte}`, { headers: { Cookie: d.cookies.adminA } });
check("dueño del estudio forzando el ID de una factura personal → 404", asAdminA.status === 404);
const asCliente = await fetch(`${BASE}/api/facturas/${invoiceId}/pdf`, { headers: { Cookie: d.cookies.duenaNorte } });
check("cliente de un estudio forzando el ID → 404", asCliente.status === 404);
const adminBorg = await fetch(`${BASE}/admin/organizaciones/${d.orgs.norte}/arca/nueva`, { headers: { Cookie: d.cookies.adminB }, redirect: "manual" });
check("dueño del estudio B en la facturación de una organización del A → 404", adminBorg.status === 404);
const colab = await fetch(`${BASE}/admin/organizaciones/${d.orgs.norte}?tab=arca`, { headers: { Cookie: d.cookies.colaboradorA } });
check("colaborador ve la pestaña ARCA (prepara, no emite)", colab.status === 200);

// Límite del plan Gratis: 10 por mes
const rows = Array.from({ length: 9 }, (_, i) => ({ studio_id: tit.id, organization_id: inv.organization_id, cuit: inv.cuit, environment: "homologacion", point_of_sale: 2, cbte_type: 11, number: 100 + i, issue_date: inv.issue_date, customer_doc_type: 99, customer_doc_number: "0", customer_name: "x", customer_iva_condition: "consumidor_final", items: sql.json([]), net: 1, total: 1, status: "autorizada", authorized_at: new Date() }));
for (const r of rows) await sql`insert into invoices ${sql(r)}`;
await page.goto(`${BASE}/facturacion/nueva`);
await page.getByLabel("Nombre o razón social").fill("Cliente once");
await page.locator('select[name="doc_type"]').selectOption("99");
await page.getByLabel("Descripción").first().fill("Servicio");
await page.getByLabel("Precio unit.").first().fill("1000");
await page.getByRole("button", { name: "Guardar borrador" }).click();
await seen("Borrador guardado");
await page.getByLabel(/Revisé el cliente/).check();
await page.getByRole("button", { name: "Emitir comprobante" }).click();
await page.getByRole("button", { name: "Emitir", exact: true }).click().catch(() => {});
check("el comprobante 11 del mes en Gratis se frena con el límite", await seen("permite hasta 10"));
await sql`delete from invoices where studio_id = ${tit.id} and point_of_sale = 2`;

check("sin errores de JavaScript", errors.length === 0, errors.join(" | "));
await browser.close();
await sql.end();
console.log(failures ? `\n${failures} fallaron` : "\nTodo bien");
process.exit(failures ? 1 : 0);
