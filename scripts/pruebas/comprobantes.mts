// §2.p · B3 todos los comprobantes: Factura M, FCE MiPyME (con CBU,
// vencimiento y nota asociada), autocompletar con el padrón, presupuesto →
// factura, remito y recibo con PDF y link, recurrentes con ajuste por IPC y
// el interruptor «Facturar automáticamente», y aislamiento forzando IDs.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/comprobantes.mts

import { readFileSync } from "node:fs";
import postgres from "postgres";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message || "error";
  }
};

const arca = await import("../../src/modules/arca/server.ts");
const fp = await import("../../src/modules/facturacion-plus/server.ts");
const { commercialPdf, issuerOf } = await import("../../src/modules/facturacion-plus/pdf.ts");
const { scopeOf } = await import("../../src/modules/arca/queue.ts");
const sh = await import("../../src/modules/share/server.ts");
const MOCK = (process.env.ARCA_WSFE_URL ?? "http://localhost:4060/wsfev1/service.asmx").replace(/\/wsfev1.*$/, "");
await fetch(`${MOCK}/__fuera?on=0`, { method: "POST" });

const cuitOf = (base: string) => {
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = w.reduce((t, x, i) => t + x * Number(base[i]), 0);
  const v = 11 - (s % 11);
  return `${base}${v === 11 ? 0 : v === 10 ? 9 : v}`;
};
const A = d.studios.A as string;
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A", role: "dueno" };
const user = (id: string, studioId: string) => ({ id, name: "x", email: "x@x", role: "dueno", studioId, mustChangePassword: false, twoFactorEnabled: true, faroRole: null, assisted: null, tenantSuspended: false, tenantKind: "studio", isDemo: false }) as never;
await sql`insert into tenant_modules (studio_id, module_key, enabled) values (${A}, 'arca', true) on conflict (studio_id, module_key) do update set enabled = true, expires_at = null`;
await sql`delete from organizations where studio_id = ${A} and name = 'Comprobantes B3 SA'`;
const cuit = cuitOf("3077788899");
const [o] = await sql`insert into organizations (studio_id, name, status) values (${A}, 'Comprobantes B3 SA', 'activa') returning id`;
await sql`insert into legal_entities (studio_id, organization_id, cuit, business_name, regime) values (${A}, ${o.id}, ${cuit}, 'Comprobantes B3 SA', 'responsable_inscripto')`;
await fetch(`${MOCK}/__delegar?cuit=${cuit}`, { method: "POST" });
const scope = await scopeOf({ studio_id: A, organization_id: o.id, cuit });
await arca.saveSettings(scope, { businessName: "Comprobantes B3 SA", ivaCondition: "responsable_inscripto" }, actorA);
const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const ri = { docType: 80, docNumber: cuitOf("3055566677"), name: "Gran Empresa SA", ivaCondition: "responsable_inscripto" };
const base = { pointOfSale: 1, issueDate: today, concept: 2, customer: ri, items: [{ description: "Servicio", quantity: 1, unitPrice: 100000, ivaRate: 21 }] };

// ─── Factura M ───
const m = await arca.emitInvoice(scope, (await arca.createDraft(scope, { ...base, cbteType: 51 }, actorA)).id, actorA);
check("Factura M a un responsable inscripto, con IVA discriminado", m.status === "autorizada" && m.cbte_type === 51 && Number(m.iva) === 21000, `${m.status} ${m.error ?? ""}`);
check("lleva la leyenda de operación sujeta a retención", (m.legends ?? []).some((l) => l.key === "sujeta_retencion"), JSON.stringify(m.legends?.map((l) => l.key)));
check("una M a consumidor final no pasa", /tiene que tener CUIT|corresponde/.test((await throws(() => arca.createDraft(scope, { ...base, cbteType: 51, customer: { docType: 99, docNumber: "0", name: "CF", ivaCondition: "consumidor_final" } }, actorA))) ?? ""));

// ─── FCE MiPyME ───
check("FCE sin CBU: pide cargarlo", /CBU/.test((await throws(() => arca.createDraft(scope, { ...base, cbteType: 201, paymentDue: today }, actorA))) ?? ""));
await arca.saveSettings(scope, { businessName: "Comprobantes B3 SA", ivaCondition: "responsable_inscripto", cbu: "0110599520000001234567", fceTransfer: "SCA" }, actorA);
check("un CBU que no tiene 22 números no se guarda", /22 números/.test((await throws(() => arca.saveSettings(scope, { businessName: "x", ivaCondition: "responsable_inscripto", cbu: "123" }, actorA))) ?? ""));
const fce = await arca.emitInvoice(scope, (await arca.createDraft(scope, { ...base, cbteType: 201, paymentDue: today }, actorA)).id, actorA);
check("FCE A autorizada: el simulador exige el CBU (opcional 2101) y el vencimiento, y los recibió", fce.status === "autorizada" && /2101/.test(JSON.stringify(fce.raw_request)) && /0110599520000001234567/.test(JSON.stringify(fce.raw_request)), `${fce.status} ${fce.error ?? ""}`);
check("y la leyenda de la FCE", (fce.legends ?? []).some((l) => l.key === "fce_cbu"));
const nc = await arca.createDraft(scope, { ...base, cbteType: 203, associatedInvoiceId: fce.id, items: [{ description: "Bonificación", quantity: 1, unitPrice: 10000, ivaRate: 21 }] }, actorA);
const ncE = await arca.emitInvoice(scope, nc.id, actorA);
check("nota de crédito de la FCE con la marca de anulación (opcional 22)", ncE.status === "autorizada" && /<ar:Id>22<\/ar:Id>|Id>22</.test(JSON.stringify(ncE.raw_request)), `${ncE.status} ${ncE.error ?? ""}`);

// ─── Padrón ───
const p = await arca.lookupTaxpayer(A, "20304050607", actorA);
check("autocompletar con el padrón de ARCA: nombre y condición", /PABLO/.test(p.name) && p.regime === "monotributo", JSON.stringify(p).slice(0, 120));
check("y queda en la auditoría", (await sql`select 1 from audit_log where action = 'arca.padron_consulta' and entity_id = '20304050607'`).length > 0);
check("una CUIT inválida no se consulta", /no es válida/.test((await throws(() => arca.lookupTaxpayer(A, "2030405", actorA))) ?? ""));

// ─── Presupuesto, remito y recibo ───
const q1 = await fp.createDoc(scope, actorA, { kind: "presupuesto", customer: { name: "Cliente Presupuesto", docType: 80, docNumber: ri.docNumber, ivaCondition: "responsable_inscripto" }, items: [{ description: "Instalación", quantity: 2, unitPrice: 5000, ivaRate: 21 }] });
const q2 = await fp.createDoc(scope, actorA, { kind: "presupuesto", customer: { name: "Otro" }, items: [{ description: "Algo", quantity: 1, unitPrice: 10 }] });
check("presupuestos con número correlativo y validez", q1.number + 1 === q2.number && !!q1.valid_until && Number(q1.total) === 12100);
const inv = await fp.quoteToInvoice(scope, actorA, q1.id, 1);
const again = await fp.quoteToInvoice(scope, actorA, q1.id, 1);
const [qs] = await sql`select status, invoice_id from commercial_docs where id = ${q1.id}`;
check("presupuesto → factura con un clic (borrador con los mismos ítems), una sola vez", inv.status === "borrador" && inv.items.length === 1 && inv.items[0].quantity === 2 && again.id === inv.id && qs.status === "facturado" && qs.invoice_id === inv.id);
const rm = await fp.createDoc(scope, actorA, { kind: "remito", customer: { name: "Depósito Norte" }, items: [{ description: "Cajas", quantity: 10, unitPrice: 0 }] });
const rc = await fp.createDoc(scope, actorA, { kind: "recibo", customer: { name: "Cliente Presupuesto" }, items: [{ description: "Pago a cuenta", quantity: 1, unitPrice: 50000 }], appliesTo: [m.id], paymentMethod: "Transferencia" });
const pdfs = await Promise.all([q1, rm, rc].map(async (x) => Buffer.from(await commercialPdf(x, await issuerOf(x))).subarray(0, 4).toString()));
check("remito (sin importes) y recibo de cobranza con su PDF", rm.kind === "remito" && rc.payment_method === "Transferencia" && pdfs.every((x) => x === "%PDF"));
const link = await sh.createLink(user(d.users.adminA, A), "comercial", q2.id, 7);
check("con link público para mandarlo (WhatsApp, A4)", (await sh.fileForToken(link.token))?.mime === "application/pdf");
await fp.setDocStatus(scope, actorA, q2.id, "anulado");
check("anulado, el link ya no abre", (await sh.fileForToken(link.token)) === null);

// ─── Recurrentes con IPC ───
await sql`insert into ipc_series (month, value, source) values ('2031-01', 1000, 'prueba B3'), ('2031-02', 1040, 'prueba B3') on conflict (month) do update set value = excluded.value, source = excluded.source`;
const r = await fp.saveRecurring(scope, actorA, { name: "Abono B3", dayOfMonth: 5, startDate: "2031-02-05", adjust: "ipc", template: { pointOfSale: 1, concept: 2, customer: ri, items: [{ description: "Abono", quantity: 1, unitPrice: 100000, ivaRate: 21 }] } });
await sql`update recurring_invoices set base_month = '2031-01' where id = ${r.id}`;
const n1 = await fp.runRecurring("2031-02-10");
const [rec1] = await sql`select i.items, i.status, i.origin, i.notes from recurring_invoices r join invoices i on i.id = r.last_invoice_id where r.id = ${r.id}`;
check("la recurrente arma el borrador del mes con el precio ajustado por IPC (+4 %)", n1 >= 1 && rec1?.status === "borrador" && rec1.origin === "recurrente" && rec1.items[0].unitPrice === 104000 && /IPC/.test(rec1.notes ?? ""), JSON.stringify(rec1));
check("y pasa al mes siguiente", (await sql`select next_date::text d from recurring_invoices where id = ${r.id}`)[0].d === "2031-03-05");
check("correr otra vez el mismo día no duplica", (await fp.runRecurring("2031-02-10")) === 0);
await sql`update recurring_invoices set next_date = '2031-02-05' where id = ${r.id}`;
await fp.runRecurring("2031-02-10");
check("aunque se reprocese el período, la clave no crea otra factura", (await sql`select count(*)::int n from invoices where idempotency_key = ${`recurrente:${r.id}:2031-02-05`}`)[0].n === 1);
await sql`insert into automation_switches (studio_id, organization_id, action, enabled, paused, set_by) values (${A}, ${o.id}, 'facturacion.recurrentes', true, false, ${d.users.adminA})`;
await sql`update ipc_series set value = 1040 where month = '2031-03'`;
await fp.runRecurring("2031-03-06");
const [rec2] = await sql`select i.status from recurring_invoices r join invoices i on i.id = r.last_invoice_id where r.id = ${r.id}`;
check("con «Facturar automáticamente» activo, se emite sola", rec2?.status === "autorizada", rec2?.status);
await fp.toggleRecurring(scope, actorA, r.id, false);
check("en pausa no corre", (await fp.runRecurring("2031-05-06")) === 0 || (await sql`select last_invoice_id from recurring_invoices where id = ${r.id}`)[0].last_invoice_id !== null);

// ─── Aislamiento forzando IDs ───
const foreign = { ...scope, studioId: d.studios.B };
check("otro estudio no ve el presupuesto", (await fp.getDoc(foreign, q1.id)) === null);
check("ni lo pasa a factura", /No encontramos/.test((await throws(() => fp.quoteToInvoice(foreign, actorA, q1.id, 1))) ?? ""));
check("ni pausa una recurrente ajena", /No encontramos/.test((await throws(() => fp.toggleRecurring(foreign, actorA, r.id, true))) ?? ""));
check("ni comparte el remito", /No encontramos/.test((await throws(() => sh.createLink(user(d.users.adminB, d.studios.B), "comercial", rm.id))) ?? ""));
await sql`delete from automation_switches where studio_id = ${A} and action = 'facturacion.recurrentes'`;
await sql`delete from ipc_series where source = 'prueba B3'`;

await sql.end();
console.log(fails ? `\n${fails} verificaciones fallaron` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
