// F5 en el navegador: legajo (alta, CUIL, documento), carga masiva de recibos
// con un PDF único dividido por CUIL, asignación manual, publicación, firma
// del empleado con constancia, recordatorio, comunicados por área con
// confirmación de lectura, novedades de personal desde el portal aplicadas al
// legajo, y aislamiento forzando IDs.
//
//   PW=/ruta/a/playwright node --env-file=.env.local scripts/pruebas/empleados-navegador.mjs

import { PDFDocument, StandardFonts } from "pdf-lib";
import postgres from "postgres";
import { BASE, check, data, failures } from "./lib.mjs";

const { chromium } = await import(process.env.PW ?? "playwright");
const d = data();
const sql = postgres(process.env.DATABASE_URL);
const NORTE = d.orgs.norte;
const SUR = d.orgs.sur;

const cuil = (prefix, dni) => {
  const base = `${prefix}${String(dni).padStart(8, "0")}`;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let dv = 11 - (w.reduce((s, x, i) => s + x * Number(base[i]), 0) % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return `${base}${dv}`;
};
const JUAN = cuil("20", 30405060);
const EMA = cuil("27", 28555666);
const OTRO = cuil("20", 11222333);
const fmt = (c) => `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;

// Estado limpio
await sql`delete from announcements where organization_id = ${NORTE}`;
await sql`delete from payslip_batches where organization_id = ${NORTE}`;
await sql`delete from employee_events where organization_id = ${NORTE}`;
await sql`delete from employee_documents where organization_id = ${NORTE}`;
await sql`delete from employees where organization_id = ${NORTE} and user_id is null`;
await sql`update employees set cuil = null, area = null, active = true, end_date = null where organization_id = ${NORTE}`;
await sql`delete from requests where organization_id = ${NORTE} and type = 'empleado' and data is not null`;
await sql`insert into organization_modules (organization_id, module_key, active) values (${NORTE}, 'sueldos', true) on conflict (organization_id, module_key) do update set active = true`;
const period = new Date(Date.now() - 3 * 3600_000 - 20 * 86400000).toISOString().slice(0, 7);

async function recibosPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = (lines) => {
    const p = doc.addPage([595, 842]);
    lines.forEach((t, i) => p.drawText(t, { x: 50, y: 780 - i * 20, size: 12, font }));
  };
  page(["AGENCIA NORTE SRL CUIT 30-71111111-9", `RECIBO DE HABERES Periodo ${period.slice(5)}/${period.slice(0, 4)}`, `Empleado: PEREZ JUAN CUIL ${fmt(JUAN)}`, "Basico 900000,00"]);
  page(["Hoja 2 de 2", "Neto a cobrar 812000,00"]);
  page(["AGENCIA NORTE SRL CUIT 30-71111111-9", `RECIBO DE HABERES Periodo ${period.slice(5)}/${period.slice(0, 4)}`, `Empleada: EMPLEADA EMA CUIL ${fmt(EMA)}`]);
  page(["AGENCIA NORTE SRL CUIT 30-71111111-9", `RECIBO DE HABERES CUIL ${fmt(OTRO)}`]);
  return Buffer.from(await doc.save());
}

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function as(cookie) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const [name, value] = cookie.split("=");
  await ctx.addCookies([{ name, value, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  page.on("dialog", (dlg) => dlg.accept());
  return page;
}
const errors = [];
const seen = async (p, text, timeout = 20000) => p.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).then(() => true, () => false);
const is404 = async (p) => (await p.content()).includes("404") || (await seen(p, "no existe", 3000)) || (await seen(p, "No encontrado", 1000));
const a = await as(d.cookies.adminA);
a.on("pageerror", (e) => errors.push(e.message));
const S = `${BASE}/admin/organizaciones/${NORTE}/sueldos`;

// ─── Legajo ───
await a.goto(`${BASE}/admin/organizaciones/${NORTE}?tab=sueldos`);
check("pestaña Sueldos de la ficha con el legajo", (await seen(a, "Ema")) && (await seen(a, "empleado")), errors.join(" | "));
const [ema] = await sql`select id from employees where organization_id = ${NORTE} and user_id = ${d.users.empleadaNorte}`;
await a.goto(`${S}/empleado/${ema.id}`);
await a.getByLabel("CUIL").fill("20-30405060-8");
await a.getByRole("button", { name: "Guardar legajo" }).click();
check("CUIL inválido rechazado", await seen(a, "Revisá el CUIL"));
await a.getByLabel("CUIL").fill(fmt(EMA));
await a.getByLabel("Área o grupo").fill("Administración");
await a.getByRole("button", { name: "Guardar legajo" }).click();
check("legajo guardado con historial de cambios", (await seen(a, "Legajo guardado")) && (await seen(a, "Cambió área")));
await a.goto(S);
await a.getByText("Dar de alta un empleado").click();
await a.getByLabel("Nombre", { exact: true }).fill("Juan");
await a.getByLabel("Apellido").fill("Pérez");
await a.getByLabel("CUIL").fill(fmt(JUAN));
await a.getByLabel("Mail (para recibos y comunicados)").fill("juan.perez@agencianorte.com.ar");
await a.getByLabel("Puesto").fill("Vendedor");
await a.getByLabel("Área o grupo").fill("Ventas");
await a.getByRole("button", { name: "Dar de alta" }).click();
check("empleado dado de alta con su evento", (await seen(a, "Empleado dado de alta")) && (await seen(a, "Alta como Vendedor")));
const juanId = a.url().match(/empleado\/([0-9a-f-]{36})/)[1];
await a.locator('input[name="file"]').setInputFiles({ name: "dni-juan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%dni\n%%EOF\n") });
await a.getByRole("button", { name: "Subir" }).click();
check("documento en el legajo", (await seen(a, "Documento agregado")) && (await seen(a, "dni-juan.pdf")));

// ─── Recibos ───
await a.goto(`${S}/recibos`);
await a.getByLabel("Período").fill(period);
await a.locator('input[name="files"]').setInputFiles({ name: `recibos-${period}.pdf`, mimeType: "application/pdf", buffer: await recibosPdf() });
await a.getByRole("button", { name: "Cargar recibos" }).click();
check("PDF único dividido: 3 recibos, 2 asignados por CUIL", await seen(a, "Cargamos 3 recibos: 2 asignados"), errors.join(" | "));
const batchId = a.url().match(/recibos\/([0-9a-f-]{36})/)[1];
const slips = await sql`select cuil, pages, status, employee_id, sha256 from payslips where batch_id = ${batchId} order by cuil`;
const juanSlip = slips.find((s) => s.cuil === JUAN);
check("el recibo de dos hojas quedó junto", JSON.stringify(juanSlip?.pages) === "[1,2]", JSON.stringify(slips.map((s) => [s.cuil, s.pages])));
check("CUIL desconocido queda sin asignar", slips.some((s) => s.cuil === OTRO && s.status === "sin_asignar" && !s.employee_id));
await a.goto(`${BASE}/admin/organizaciones/${NORTE}/sueldos/recibos/${batchId}`);
await a.getByRole("button", { name: "Publicar 2 y avisar" }).click();
check("publicados y avisados", await seen(a, "Publicamos 2 recibos"));

// ─── Firma del empleado ───
const emp = await as(d.cookies.empleadaNorte);
await emp.goto(`${BASE}/portal/empleado`);
check("inicio del empleado: recibo para firmar", await seen(emp, "Tenés 1 recibo para firmar"));
await emp.goto(`${BASE}/portal/recibos`);
const pdf = await emp.request.get(`${BASE}/api/recibos/${(await sql`select id from payslips where batch_id = ${batchId} and cuil = ${EMA}`)[0].id}`);
check("el empleado abre su recibo (PDF)", pdf.ok() && (await pdf.body()).subarray(0, 4).toString() === "%PDF");
await emp.getByLabel("Revisé el recibo").first().check();
await emp.getByRole("button", { name: "Firmar conforme" }).click();
check("firmado conforme con constancia", (await seen(emp, "Firmaste conforme")) && (await seen(emp, "Constancia")));
const [signed] = await sql`select * from payslips where batch_id = ${batchId} and cuil = ${EMA}`;
check("constancia: fecha, IP, dispositivo, hash y sello", signed.status === "conforme" && !!signed.signed_at && !!signed.sign_ip && !!signed.sign_device && signed.seal?.length === 64 && !!signed.viewed_at, JSON.stringify({ ip: signed.sign_ip, dev: signed.sign_device }));
const otherSlip = (await sql`select id from payslips where batch_id = ${batchId} and cuil = ${JUAN}`)[0].id;
const forced = await emp.request.get(`${BASE}/api/recibos/${otherSlip}`, { failOnStatusCode: false });
check("el empleado no abre el recibo de otro → 404", forced.status() === 404);
await a.goto(`${BASE}/admin/organizaciones/${NORTE}/sueldos/recibos/${batchId}`);
check("el estudio ve la firma con IP y sello", (await seen(a, "Firmado conforme")) && (await seen(a, "sello")));
await a.getByRole("button", { name: /Recordar a 1 que no firmaron/ }).click();
check("recordatorio a quien no firmó", await seen(a, "Le recordamos a 1 persona"));

// ─── Comunicados ───
await a.goto(`${S}/comunicados`);
await a.getByLabel("Título").fill("Cambio de horario");
await a.getByRole("textbox", { name: "Texto", exact: true }).fill("Desde el lunes entramos a las 9.");
await a.getByLabel("Para").selectOption("Administración");
await a.locator('input[name="files"]').setInputFiles({ name: "horarios.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%h\n%%EOF\n") });
await a.getByRole("button", { name: "Enviar" }).click();
check("comunicado por área enviado a 1 persona", await seen(a, "Comunicado enviado a 1 persona"));
const annId = a.url().match(/comunicados\/([0-9a-f-]{36})/)[1];
await emp.goto(`${BASE}/portal/empleado`);
check("el empleado ve el comunicado en su inicio", await seen(emp, "Cambio de horario"));
await emp.goto(`${BASE}/portal/comunicados/${annId}`);
const att = await emp.request.get(`${BASE}/api/comunicados/${annId}/adjunto/0`);
check("el destinatario abre el adjunto", att.ok());
await emp.getByRole("button", { name: "Leí y entendí" }).click();
check("lectura confirmada", await seen(emp, "Confirmaste la lectura"));
await a.goto(`${S}/comunicados/${annId}`);
check("el estudio ve quién confirmó", await seen(a, "Confirmó el"));
await a.goto(`${S}/comunicados`);
await a.getByLabel("Título").fill("Aviso a Ventas");
await a.getByRole("textbox", { name: "Texto", exact: true }).fill("Reunión el viernes.");
await a.getByLabel("Para").selectOption("Ventas");
await a.getByRole("button", { name: "Enviar" }).click();
const ventasId = a.url().match(/comunicados\/([0-9a-f-]{36})/)?.[1];
await emp.goto(`${BASE}/portal/comunicados/${ventasId}`);
check("un comunicado de otra área no es para el empleado → 404", await is404(emp));

// ─── Portal de la organización y novedades ───
const duena = await as(d.cookies.duenaNorte);
await duena.goto(`${BASE}/portal/modulos/sueldos`);
check("portal: Sueldos y empleados con el legajo", (await seen(duena, "Juan")) && (await seen(duena, "empleados activos")));
await duena.goto(`${BASE}/portal/modulos/sueldos/novedades`);
await duena.getByLabel("Novedad").selectOption("licencia");
await duena.getByLabel(/Empleado \(baja/).selectOption({ label: "Juan Pérez" });
await duena.getByLabel("Desde").fill(new Date().toISOString().slice(0, 10));
await duena.getByLabel(/Hasta/).fill(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
await duena.getByLabel("Motivo o detalle").fill("Examen");
await duena.getByRole("button", { name: "Enviar al estudio" }).click();
await duena.waitForURL(/\/portal\/solicitudes\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
check("novedad informada como solicitud de personal", /portal\/solicitudes\//.test(duena.url()) && (await seen(duena, "Licencia: Juan Pérez")));
const [req] = await sql`select id, type, data from requests where organization_id = ${NORTE} and data is not null order by created_at desc limit 1`;
check("solicitud tipificada con sus datos", req.type === "empleado" && req.data.novedad === "licencia" && req.data.empleado_id === juanId);
await a.goto(`${S}/novedades`);
await a.getByRole("button", { name: "Aplicar al legajo" }).click();
check("novedad aplicada", await seen(a, "Novedad aplicada al legajo"));
await a.goto(`${S}/empleado/${juanId}`);
check("licencia en el historial del legajo", await seen(a, "Licencia (Examen)"));
const dl = await duena.request.get(`${BASE}/api/recibos/${otherSlip}`);
check("quien ve sueldos en la organización abre los recibos", dl.ok());
await emp.goto(`${BASE}/portal/modulos/sueldos`);
check("el empleado no entra a Sueldos y empleados", !(await seen(emp, "empleados activos", 3000)));

// ─── Aislamiento entre estudios y organizaciones ───
const b = await as(d.cookies.adminB);
await b.goto(S);
check("otro estudio forzando la organización → 404", await is404(b));
const bdl = await b.request.get(`${BASE}/api/recibos/${otherSlip}`, { failOnStatusCode: false });
check("recibo de otro estudio → 404", bdl.status() === 404);
const [doc] = await sql`select id from employee_documents where employee_id = ${juanId}`;
const bdoc = await b.request.get(`${BASE}/api/legajo/${doc.id}`, { failOnStatusCode: false });
check("documento del legajo de otro estudio → 404", bdoc.status() === 404);
await a.goto(`${BASE}/admin/organizaciones/${SUR}/sueldos/empleado/${juanId}`);
check("empleado de otra organización del mismo estudio → 404", await is404(a));
await a.goto(`${BASE}/admin/organizaciones/${SUR}/sueldos/recibos/${batchId}`);
check("lote de otra organización → 404", await is404(a));

const aud = await sql`select action from audit_log where organization_id = ${NORTE} and (action like 'empleado.%' or action like 'recibo%' or action like 'comunicado.%' or action like 'novedad.%')`;
check("auditoría de empleados", ["empleado.alta", "empleado.editado", "empleado.documento", "recibos.carga", "recibos.publicado", "recibo.firmado", "recibos.recordatorio", "comunicado.enviado", "comunicado.leido", "novedad.informada", "novedad.aplicada"].every((x) => aud.some((r) => r.action === x)), [...new Set(aud.map((r) => r.action))].join(","));
check("sin errores de la página", errors.length === 0, errors.join(" | "));
await browser.close();
await sql.end();
console.log(failures ? `\n${failures} fallaron` : "\nTodo bien");
process.exit(failures ? 1 : 0);
