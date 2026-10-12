// F6 en el navegador: lectura inteligente (estudio, Faro Personal y Bitácora)
// contra el simulador de IA (4010) y de ARCA (4060), con validación de CUIT y
// CAE, duplicados, errores, exportaciones y "Leer con IA" desde Documentos; y
// conciliación bancaria con sugerencias, reglas y resumen. Aislamiento
// forzando IDs entre estudios y por rol, y el límite del plan.
//
//   PW=/ruta/a/playwright node --env-file=.env.local scripts/pruebas/lectura-navegador.mjs

import postgres from "postgres";
import { BASE, check, data, encrypt, failures } from "./lib.mjs";

const { chromium } = await import(process.env.PW ?? "playwright");
const d = data();
const sql = postgres(process.env.DATABASE_URL);
const A = d.studios.A;
const SB = d.studios.B;
const P = d.studios.personal;
const NORTE = d.orgs.norte;
const SUR = d.orgs.sur;
const AJENA = d.orgs.ajena;

// Estado limpio
await sql`delete from bank_movements where studio_id in ${sql([A, SB])}`;
await sql`delete from bank_statements where studio_id in ${sql([A, SB])}`;
await sql`delete from bank_rules where studio_id in ${sql([A, SB])}`;
await sql`delete from accounting_expenses where source = 'lectura'`;
await sql`delete from smart_documents where studio_id in ${sql([A, SB, P])}`;
await sql`delete from bitacora_entries where user_id = ${d.users.titular} and note = 'Leído con lectura inteligente'`;
await sql`delete from invoices where organization_id = ${NORTE} and customer_name = 'Juan Pérez SRL'`;
await sql`update studios set plan_key = 'autonomo_pro' where id = ${P}`;
const hadPlatform = (await sql`select 1 from platform_ai where id = 'default'`).length > 0;
if (!hadPlatform) await sql`insert into platform_ai (id, provider, api_key_enc, base_url, model_primary) values ('default', 'openai_compatible', ${encrypt("mock")}, 'http://localhost:4010/v1', 'faro-mock')`;
await fetch("http://localhost:4060/__reset", { method: "POST" });
await sql`delete from arca_tickets`;

const iso = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const pdf = (tag) => ({ name: `${tag}.pdf`, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% ${tag} ${Math.random()}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`) });
const jpg = (tag) => ({ name: `${tag}.jpg`, mimeType: "image/jpeg", buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`${tag}${Math.random()}`), Buffer.from([0xff, 0xd9])]) });

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function as(cookie, width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const [name, value] = cookie.split("=");
  await ctx.addCookies([{ name, value, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  page.on("dialog", (dlg) => dlg.accept());
  return page;
}
const errors = [];
const page = await as(d.cookies.adminA);
page.on("pageerror", (e) => errors.push(e.message));
const seen = async (text, p = page, timeout = 20000) => p.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).then(() => true, () => false);
const is404 = async (p) => (await p.content()).includes("404") || (await seen("no existe", p, 3000)) || (await seen("No encontrado", p, 1000));
const L = `${BASE}/admin/organizaciones/${NORTE}/lectura`;
const upload = async (file, p = page, url = L) => {
  await p.goto(url);
  await p.locator('input[type="file"]').setInputFiles(file);
  await p.getByRole("button", { name: "Leer", exact: true }).click();
};

// ─── Lectura en el estudio ───
const original = pdf("edenor-45");
await upload(original);
check("leído y para revisar", await seen("Revisá los datos y confirmá"), errors.join(" | "));
check("validación de ARCA: CUIT activo y CAE autorizado", (await seen("ARCA: activo")) && (await seen("ARCA: autorizado")));
check("totales válidos", (await page.locator("text=Totales:").first().innerText()).includes("válido"));
const [doc1] = await sql`select * from smart_documents where studio_id = ${A} and file_name = 'edenor-45.pdf' order by created_at desc limit 1`;
check("guardó modelo, tokens, fecha y registro original", doc1.model === "faro-mock" && doc1.input_tokens > 0 && !!doc1.synced_at && !!doc1.raw && doc1.sha256.length === 64);
check("cuenta sugerida por el emisor: Servicios", doc1.account === "Servicios");
await page.getByRole("button", { name: "Confirmar" }).click();
check("confirmado", await seen("quedó en los gastos y en la planilla"));
const [exp] = await sql`select * from accounting_expenses where source = 'lectura' and source_id = ${doc1.id}`;
check("gasto de la organización con el archivo", !!exp && Number(exp.amount) === 12400000 && exp.organization_id === NORTE && !!exp.receipt_path);

// Duplicado por huella (otro archivo, mismo comprobante)
await upload(pdf("edenor-45"));
check("aviso de repetido", await seen("parece un comprobante que ya estaba"));
await page.getByRole("button", { name: "Confirmar" }).click();
check("no se confirma un repetido sin marcarlo", await seen("Parece repetido"));
await page.getByRole("button", { name: "Descartar" }).click();
check("repetido descartado", await seen("Descartado."));

// Mismo archivo: no vuelve a la IA
const before = (await sql`select count(*)::int n from smart_documents where studio_id = ${A} and model is not null`)[0].n;
await upload(original);
await seen("ya estaba");
const after = (await sql`select count(*)::int n from smart_documents where studio_id = ${A} and model is not null`)[0].n;
check("el mismo archivo no se manda otra vez a la IA ni cuenta", after === before);
await page.getByRole("button", { name: "Descartar" }).click();
await seen("Descartado.");

// Datos dudosos
await upload(pdf("dudoso"));
await seen("Revisá los datos");
check("CUIT inválido, CAE con error y totales que no cierran", (await seen("El CUIT del emisor no es válido")) && (await seen("El CAE tiene que tener 14 dígitos")) && (await seen("Los importes suman")));
check("campos de confianza baja marcados para revisar", (await page.locator("text=revisar").count()) >= 2);
await page.getByLabel(/^CUIT del emisor/).fill("30711111111");
await page.getByLabel(/^Total/).fill("60500");
await page.getByLabel(/^CAE/).first().fill("");
await page.getByRole("button", { name: "Confirmar" }).click();
check("corregido y confirmado", await seen("quedó en los gastos"));
const [dud] = await sql`select extracted, low_fields from smart_documents where studio_id = ${A} and file_name = 'dudoso.pdf' and status = 'confirmado'`;
check("se guardan las correcciones", dud.extracted.cuit_emisor === "30711111111" && dud.extracted.total === 60500 && dud.extracted.cae === null);

// Archivo ilegible
await upload(pdf("roto"));
check("archivo ilegible: error claro", await seen("no devolvió datos legibles"));

// Exportaciones
const q = new URLSearchParams({ ambito: "estudio", org: NORTE });
const csv = await page.request.get(`${BASE}/api/lectura/exportar?${q}&formato=csv`);
const csvText = await csv.text();
check("CSV con cuenta y desglose", csv.ok() && csvText.includes("Edenor S.A.;Servicios;100000;0;0;21000"), csvText.slice(0, 200));
const xlsx = await page.request.get(`${BASE}/api/lectura/exportar?${q}&formato=xlsx`);
check("XLSX (una hoja por cuenta)", xlsx.ok() && (await xlsx.body()).subarray(0, 2).toString() === "PK");
const tango = await (await page.request.get(`${BASE}/api/lectura/exportar?${q}&formato=tango`)).text();
check("archivo para Tango", tango.includes("00002-00000045;30-71111111-1"));
check("quedaron marcados como exportados", (await sql`select count(*)::int n from smart_documents where studio_id = ${A} and status = 'confirmado' and exported_at is not null`)[0].n === 2);

// "Leer con IA" desde Documentos
await page.goto(`${BASE}/admin/organizaciones/${NORTE}?tab=documentos`);
await page.locator("#doc-file").setInputFiles(pdf("edenor-77"));
await page.getByRole("button", { name: "Subir y avisar al cliente" }).click();
await seen("edenor-77.pdf");
// El botón de la fila del documento recién subido (no el primero de la lista)
await page.locator("li", { hasText: "edenor-77.pdf" }).getByRole("button", { name: "Leer con IA" }).click();
check("leído desde Documentos", await seen("Revisá los datos y confirmá"));
const [fromDocs] = await sql`select document_id, source from smart_documents where studio_id = ${A} and file_name = 'edenor-77.pdf'`;
check("vinculado al documento", !!fromDocs?.document_id && fromDocs.source === "documentos");
await page.goto(`${BASE}/admin/organizaciones/${NORTE}?tab=documentos`);
check("Documentos muestra la bandeja y «Ver lectura»", (await seen("para confirmar")) && (await page.getByRole("link", { name: "Ver lectura" }).count()) > 0);

// Aislamiento
const other = await as(d.cookies.adminB);
await other.goto(L);
check("otro estudio forzando la organización → 404", await is404(other));
const file = await other.request.get(`${BASE}/api/lectura/${doc1.id}/archivo?${q}`, { failOnStatusCode: false });
check("archivo de otro estudio → 404", file.status() === 404);
const expB = await other.request.get(`${BASE}/api/lectura/exportar?${q}&formato=csv`, { failOnStatusCode: false });
check("exportar de otro estudio → 404", expB.status() === 404);
await page.goto(`${BASE}/admin/organizaciones/${SUR}/lectura/${doc1.id}`);
check("documento de otra organización del mismo estudio → 404", await is404(page));
const own = await page.request.get(`${BASE}/api/lectura/${doc1.id}/archivo?${q}`);
check("el archivo propio se descarga", own.ok() && (await own.body()).subarray(0, 4).toString() === "%PDF");

// Límite del plan (Inicial: 30 por mes)
for (let i = 0; i < 30; i++) await sql`insert into smart_documents (studio_id, organization_id, scope, storage_path, file_name, mime_type, size_bytes, sha256, status, model) values (${SB}, ${AJENA}, 'organizacion', 'x', ${`relleno-${i}.pdf`}, 'application/pdf', 1, ${`relleno${i}`}, 'confirmado', 'faro-mock')`;
await upload(pdf("edenor-90"), other, `${BASE}/admin/organizaciones/${AJENA}/lectura`);
check("límite de lectura del plan Inicial", await seen("límite", other) || (await seen("30", other)));
await sql`delete from smart_documents where studio_id = ${SB}`;

// ─── Faro Personal y Bitácora ───
const tit = await as(d.cookies.titular);
await upload(jpg("ticket"), tit, `${BASE}/facturacion/recibidos`);
check("autónomo: ticket leído con la IA de la plataforma", await seen("Revisá los datos", tit));
await tit.getByRole("button", { name: "Confirmar" }).click();
check("autónomo: confirmado", await seen("quedó en los gastos", tit));
const [pexp] = await sql`select ae.* from accounting_expenses ae join smart_documents sd on sd.id = ae.source_id where sd.studio_id = ${P} and sd.scope = 'personal'`;
check("autónomo: gasto de la actividad", !!pexp && Number(pexp.amount) === 1210000);
await upload(jpg("ticket"), tit, `${BASE}/bitacora/tickets`);
check("Bitácora: ticket leído", await seen("Revisá los datos", tit));
await tit.getByRole("button", { name: "Confirmar" }).click();
check("Bitácora: quedó como gasto", await seen("quedó como gasto en tu Bitácora", tit));
const [be] = await sql`select * from bitacora_entries where user_id = ${d.users.titular} and note = 'Leído con lectura inteligente'`;
check("Bitácora: movimiento con el total", !!be && Number(be.amount) === 1210000);
const [bt] = await sql`select id from smart_documents where scope = 'bitacora' and owner_user_id = ${d.users.titular} limit 1`;
const emp = await as(d.cookies.empleadaNorte);
await emp.goto(`${BASE}/bitacora/tickets/${bt.id}`);
check("ticket de la Bitácora de otra persona → 404", await is404(emp));

// ─── Conciliación bancaria ───
await sql`insert into invoices (studio_id, organization_id, cuit, environment, point_of_sale, cbte_type, number, issue_date, customer_doc_type, customer_doc_number, customer_name, customer_iva_condition, items, net, iva, total, status) values (${A}, ${NORTE}, '30711111119', 'homologacion', 2, 1, 45, ${iso(5)}, 80, '30744444449', 'Juan Pérez SRL', 'responsable_inscripto', ${sql.json([])}, 123966.94, 26033.06, 150000, 'autorizada')`;
const dd = (n) => iso(n).split("-").reverse().join("/");
const extracto = `Fecha;Concepto;Importe\n${dd(3)};TRANSF RECIBIDA 30744444449 JUAN PEREZ;150.000,00\n${dd(2)};DEB AUTOMATICO EDENOR 30711111111;-124.000,00\n${dd(2)};IMP. LEY 25413 S/DEB;-744,00\n${dd(1)};COMISION MANTENIMIENTO CUENTA;-5.000,00\n${dd(1)};SEGURO LA CAJA;-8.000,00\n${dd(1)};PAGO PROVEEDOR XX;-3.000,00\n`;
const importar = async () => {
  await page.goto(`${BASE}/admin/organizaciones/${NORTE}?tab=conciliacion`);
  await page.locator('input[type="file"]').setInputFiles({ name: "extracto.csv", mimeType: "text/csv", buffer: Buffer.from(extracto) });
  await page.getByLabel("Banco").fill("Galicia");
  await page.getByRole("button", { name: "Importar y conciliar" }).click();
};
await importar();
check("extracto importado", await seen("Importamos 6 movimientos"), errors.join(" | "));
const stUrl = page.url().split("?")[0];
check("dos cruces sugeridos con su porcentaje", (await page.locator("text=Sugerencia:").count()) === 2);
check("comisión e impuesto clasificados", (await seen("Comisión ·")) && (await seen("Impuesto ·")));
for (let i = 0; i < 2; i++) {
  await page.getByRole("button", { name: "Confirmar", exact: true }).first().click();
  await page.waitForFunction((n) => document.body.innerText.split("Sugerencia:").length - 1 === n, 1 - i, { timeout: 20000 }).catch(() => {});
}
check("dos conciliados", (await sql`select count(*)::int n from bank_movements where organization_id = ${NORTE} and status = 'conciliado'`)[0].n === 2);
await page.getByLabel("Si el detalle dice").fill("SEGURO");
await page.getByLabel("Tratarlo como").selectOption("sin_factura");
await page.getByRole("button", { name: "Guardar regla" }).click();
check("regla guardada", await seen("Regla guardada"));
check("la regla clasificó el seguro", (await sql`select status from bank_movements where organization_id = ${NORTE} and description like 'SEGURO%'`)[0].status === "sin_factura");
await page.getByRole("listitem", { name: "PAGO PROVEEDOR XX" }).getByRole("button", { name: "Sin factura" }).click();
check("pago marcado sin factura", await seen("Marcado como pago sin factura"));
const cards = await page.locator("dl").innerText();
check("resumen: 2 pagadas, 2 sin factura, comisiones e impuestos", /cobradas o pagadas\s*2/.test(cards) && /Pagos sin factura\s*2/.test(cards) && cards.includes("$ 5.000,00") && cards.includes("$ 744,00"), cards.replace(/\n/g, " "));
await importar();
check("reimportar no duplica", await seen("Importamos 0 movimientos (6 ya estaban)"));

// Aislamiento y rol
await other.goto(stUrl);
check("extracto de otro estudio → 404", await is404(other));
const colab = await as(d.cookies.colaboradorA);
await colab.goto(`${BASE}/admin/organizaciones/${NORTE}?tab=conciliacion`);
check("colaborador: sin acceso a la conciliación", await seen("dueños y contadores", colab));
await colab.goto(stUrl);
check("colaborador forzando la URL del extracto: no la ve", !(await seen("Movimientos", colab, 3000)));
const aud = await sql`select action from audit_log where studio_id = ${A} and (action like 'lectura.%' or action like 'conciliacion.%')`;
check("auditoría de lectura y conciliación", ["lectura.leido", "lectura.confirmado", "lectura.descartado", "lectura.exportar", "lectura.descargar", "conciliacion.extracto", "conciliacion.conciliado", "conciliacion.marcado", "conciliacion.regla"].every((a) => aud.some((r) => r.action === a)));

check("sin errores de la página", errors.length === 0, errors.join(" | "));
await sql`update studios set plan_key = 'autonomo_gratis' where id = ${P}`;
if (!hadPlatform) await sql`delete from platform_ai where id = 'default'`;
await browser.close();
await sql.end();
console.log(failures ? `\n${failures} fallaron` : "\nTodo bien");
process.exit(failures ? 1 : 0);
