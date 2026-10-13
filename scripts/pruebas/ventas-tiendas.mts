// §2.p · B7 ventas de tiendas para facturar: regla por tienda (por venta o
// resumen diario, con CUIT y punto de venta), borrador sin el interruptor y
// emisión directa con él, emisión por una persona, idempotencia, nota de
// crédito automática por devolución, cancelación de un borrador, resumen del
// día con devolución parcial, «no facturar» y aislamiento forzando IDs.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/ventas-tiendas.mts

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

const st = await import("../../src/modules/stock/server.ts");
const v = await import("../../src/modules/ventas/server.ts");
const arca = await import("../../src/modules/arca/server.ts");
const { scopeOf } = await import("../../src/modules/arca/queue.ts");
const MOCK = (process.env.ARCA_WSFE_URL ?? "http://localhost:4060/wsfev1/service.asmx").replace(/\/wsfev1.*$/, "");
await fetch(`${MOCK}/__fuera?on=0`, { method: "POST" });

const A = d.studios.A as string;
const B = d.studios.B as string;
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A", role: "dueno" };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com", name: "Admin B", role: "dueno" };
const cuitOf = (base: string) => {
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = w.reduce((t, x, i) => t + x * Number(base[i]), 0);
  const r = 11 - (s % 11);
  return `${base}${r === 11 ? 0 : r === 10 ? 9 : r}`;
};

// ─── Organización responsable inscripta con Stock y su CUIT ───
for (const m of ["arca", "stock"]) await sql`insert into tenant_modules (studio_id, module_key, enabled) values (${A}, ${m}, true) on conflict (studio_id, module_key) do update set enabled = true, expires_at = null`;
await sql`delete from organizations where studio_id = ${A} and name = 'Ventas Tiendas SA'`;
const cuit = cuitOf("3066655544");
await sql`delete from legal_entities where studio_id = ${A} and cuit = ${cuit}`;
const [o] = await sql`insert into organizations (studio_id, name, status) values (${A}, 'Ventas Tiendas SA', 'activa') returning id`;
await sql`insert into legal_entities (studio_id, organization_id, cuit, business_name, regime) values (${A}, ${o.id}, ${cuit}, 'Ventas Tiendas SA', 'responsable_inscripto')`;
await sql`insert into organization_modules (organization_id, module_key, active) values (${o.id}, 'stock', true) on conflict (organization_id, module_key) do update set active = true`;
await fetch(`${MOCK}/__delegar?cuit=${cuit}`, { method: "POST" });
await arca.saveSettings(await scopeOf({ studio_id: A, organization_id: o.id, cuit }), { businessName: "Ventas Tiendas SA", ivaCondition: "responsable_inscripto" }, actorA);
const S = { studioId: A, organizationId: o.id, canManage: true };
const scopeA = { studioId: A, organizationId: null, canEmit: true };
const scopeB = { studioId: B, organizationId: null, canEmit: true };

const tn = await st.connectStore(S, actorA, { platform: "tiendanube", name: "Tienda B7", shopId: `b7-${Date.now()}`, depositId: null });
const order = (id: string, status: string, price: number, qty = 1, buyer?: Record<string, string>) => ({ id, status, created_at: new Date().toISOString(), items: [{ listing_id: `L-${id}`, sku: null, title: `Producto ${id}`, quantity: qty, unit_price: price }], ...(buyer ? { buyer } : {}) });
const row = async (store: string, ext: string) => (await sql`select o.*, i.status as inv_status, i.cbte_type, i.total as inv_total, n.status as nc_status, n.cbte_type as nc_type, n.associated_invoice_id, n.total as nc_total from stock_store_orders o left join invoices i on i.id = o.invoice_id left join invoices n on n.id = o.credit_note_id where o.store_id = ${store} and o.external_id = ${ext}`)[0];
const sw = async (on: boolean) => {
  await sql`delete from automation_switches where studio_id = ${A} and action = 'facturacion.tiendas'`;
  if (on) await sql`insert into automation_switches (studio_id, organization_id, action, enabled, paused, set_by) values (${A}, ${o.id}, 'facturacion.tiendas', true, false, ${actorA.id})`;
};
await sw(false);

// ─── Sin regla no se factura nada ───
await st.webhook(tn.webhook_token, { order: order("V-0", "paid", 1000) });
check("sin regla, el pedido no queda para facturar", (await row(tn.id, "V-0")).billing_status === null);

// ─── Regla ───
check("la regla exige una CUIT de la organización", /CUIT de la organización/.test((await throws(() => v.setBillingRule(scopeA, actorA, tn.id, { mode: "por_venta", cuit: "20111111112", pos: null }))) ?? ""));
check("modo inválido: error", (await throws(() => v.setBillingRule(scopeA, actorA, tn.id, { mode: "cada_hora", cuit, pos: null }))) !== null);
await v.setBillingRule(scopeA, actorA, tn.id, { mode: "por_venta", cuit, pos: null });
check("la regla queda en la auditoría", (await sql`select 1 from audit_log where action = 'ventas.regla' and entity_id = ${tn.id}`).length === 1);

// ─── Venta sin el interruptor: borrador; la emite una persona ───
await st.webhook(tn.webhook_token, { order: order("V-1", "paid", 1210, 2, { name: "Gran Empresa SA", doc_number: cuitOf("3055566677"), iva_condition: "responsable_inscripto" }) });
await st.webhook(tn.webhook_token, { order: order("V-1", "paid", 1210, 2, { name: "Gran Empresa SA", doc_number: cuitOf("3055566677"), iva_condition: "responsable_inscripto" }) });
await v.processStoreSales();
await v.processStoreSales();
let r = await row(tn.id, "V-1");
check("venta pagada sin el interruptor: queda en borrador (no se emite)", r.billing_status === "borrador" && r.inv_status === "borrador", r.billing_status);
check("factura A al comprador con CUIT, precio final de la tienda", r.cbte_type === 1 && Number(r.inv_total) === 2420, `${r.cbte_type} ${r.inv_total}`);
check("el aviso repetido y la tarea corrida dos veces no duplican", (await sql`select count(*)::int n from invoices where idempotency_key = ${`tienda:${tn.id}:V-1`}`)[0].n === 1);
const now = await v.invoiceNow(scopeA, actorA, [r.id]);
r = await row(tn.id, "V-1");
check("«Facturar y emitir» de una persona la emite con CAE", now.ok === 1 && r.billing_status === "facturada" && r.inv_status === "autorizada");

// ─── Con el interruptor: se emite sola; la devolución arma y emite la nota de crédito ───
await sw(true);
await st.webhook(tn.webhook_token, { order: order("V-2", "paid", 5000) });
await v.processStoreSales();
r = await row(tn.id, "V-2");
check("con el interruptor activo: factura B a consumidor final emitida sola", r.billing_status === "facturada" && r.inv_status === "autorizada" && r.cbte_type === 6, `${r.billing_status} ${r.cbte_type}`);
await st.webhook(tn.webhook_token, { order: order("V-2", "refunded", 5000) });
check("la devolución la deja para anular", (await row(tn.id, "V-2")).billing_status === "a_anular");
await v.processStoreSales();
r = await row(tn.id, "V-2");
check("nota de crédito B automática, asociada y emitida", r.billing_status === "anulada" && r.nc_status === "autorizada" && r.nc_type === 8 && r.associated_invoice_id === r.invoice_id && Number(r.nc_total) === 5000, `${r.billing_status} ${r.nc_status}`);

// ─── Sin el interruptor: la cancelación de un borrador lo borra ───
await sw(false);
await st.webhook(tn.webhook_token, { order: order("V-3", "paid", 800) });
await v.processStoreSales();
const draftId = (await row(tn.id, "V-3")).invoice_id;
await st.webhook(tn.webhook_token, { order: order("V-3", "cancelled", 800) });
await v.processStoreSales();
r = await row(tn.id, "V-3");
check("cancelada antes de emitir: se borra el borrador y no se factura", r.billing_status === "ignorada" && (await sql`select 1 from invoices where id = ${draftId}`).length === 0);

// ─── No facturar ───
await st.webhook(tn.webhook_token, { order: order("V-4", "paid", 300) });
const v4 = await row(tn.id, "V-4");
check("«No facturar» deja el pedido afuera (auditado)", (await v.ignoreSales(scopeA, actorA, [v4.id])) === 1 && (await row(tn.id, "V-4")).billing_status === "ignorada");

// ─── Resumen diario (Mercado Pago QR) con devolución parcial ───
const qr = await st.connectStore(S, actorA, { platform: "mercadopago", name: "QR del local", shopId: `qr-${Date.now()}`, depositId: null });
await v.setBillingRule(scopeA, actorA, qr.id, { mode: "resumen_diario", cuit, pos: 1 });
for (const [id, price] of [["Q-1", 1210], ["Q-2", 2420], ["Q-3", 605]] as const) await st.webhook(qr.webhook_token, { order: order(id, "paid", price) });
await sql`update stock_store_orders set received_at = now() - interval '1 day' where store_id = ${qr.id} and external_id in ('Q-1', 'Q-2')`;
await sw(true);
await v.processStoreSales();
const q1 = await row(qr.id, "Q-1");
const q2 = await row(qr.id, "Q-2");
check("resumen del día anterior: una factura B a consumidor final con los dos pedidos", q1.invoice_id && q1.invoice_id === q2.invoice_id && q1.inv_status === "autorizada" && Number(q1.inv_total) === 3630, `${q1.inv_status} ${q1.inv_total}`);
check("lo de hoy espera al cierre del día", (await row(qr.id, "Q-3")).billing_status === "pendiente");
await st.webhook(qr.webhook_token, { order: order("Q-1", "refunded", 1210) });
await v.processStoreSales();
const q1b = await row(qr.id, "Q-1");
check("devolución de un pedido del resumen: nota de crédito solo por ese pedido", q1b.billing_status === "anulada" && Number(q1b.nc_total) === 1210 && q1b.associated_invoice_id === q1.invoice_id);
await sw(false);

// ─── Pantalla y resumen ───
const stores = await v.salesStores(scopeA);
check("el estudio ve sus tiendas con la regla y los estados", stores.some((x) => x.id === tn.id && x.mode === "por_venta" && x.cuits.includes(cuit)) && stores.some((x) => x.id === qr.id && x.mode === "resumen_diario"));
check("el resumen cuenta lo facturado del mes", (await v.salesSummary({ ...scopeA, organizationId: o.id })).some((x) => x.status === "facturada" && x.count >= 1));

// ─── Vigía ───
const { executeTool } = await import("../../src/modules/tools/index.ts");
const ctx = { studioId: A, actor: { id: actorA.id, email: actorA.email, name: "Admin A", role: "dueno" as const }, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };
const t = await executeTool("ventas_para_facturar", { organizacion_id: o.id }, ctx);
const tr = (t as { result?: { tiendas?: { tienda: string; regla: string }[] } }).result;
check("el Vigía lista las tiendas con su regla y los pedidos por estado", t.status === "ok" && (tr?.tiendas ?? []).some((x) => x.tienda === "Tienda B7" && x.regla === "por_venta"), t.status);
const tb = await executeTool("ventas_para_facturar", { organizacion_id: o.id }, { ...ctx, studioId: B, actor: { ...ctx.actor, id: actorB.id } });
check("el Vigía de otro estudio no las ve", tb.status === "denegado");

// ─── Aislamiento forzando IDs ───
check("otro estudio no cambia la regla de una tienda ajena", (await throws(() => v.setBillingRule(scopeB, actorB, tn.id, { mode: "ninguna", cuit: null, pos: null }))) !== null);
const q3 = await row(qr.id, "Q-3");
check("otro estudio no factura pedidos ajenos", (await v.invoiceNow(scopeB, actorB, [q3.id])).total === 0 && (await row(qr.id, "Q-3")).billing_status === "pendiente");
check("otro estudio no los marca como «no facturar»", (await v.ignoreSales(scopeB, actorB, [q3.id])) === 0);
check("otro estudio no ve los pedidos", !(await v.salesOrders(scopeB)).some((x) => x.o.store_id === tn.id));
check("otra organización del mismo estudio no ve esta tienda", !(await v.salesStores({ ...scopeA, organizationId: d.orgs.norte })).some((x) => x.id === tn.id));
check("un colaborador no emite", /no puede/.test((await throws(() => v.invoiceNow({ ...scopeA, canEmit: false }, actorA, [q3.id]))) ?? ""));

await sql.end();
console.log(fails ? `\n${fails} fallas` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
