// §2.q etapa 7: stock simple. Una compra leída suma (y la segunda del mismo
// proveedor ya viene vinculada), una venta facturada y una de tienda restan,
// la misma venta dos veces no resta dos veces, una cancelación repone, una
// venta sin vincular no resta, la publicación hacia la tienda con conflicto
// no pisa, reintentos y pausa, inventario valorizado a una fecha pasada,
// conteo, alertas, Vigía y Agente, y aislamiento forzando IDs. Las tiendas
// son el simulador de mocks/tiendas.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/stock.mts

import { readFileSync } from "node:fs";
import postgres from "postgres";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const TIENDAS = process.env.TIENDAS_API_URL!;
const FARO = process.env.FARO_URL ?? "http://localhost:3000";
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
const mock = (path: string, body: unknown) => fetch(`${TIENDAS}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

const st = await import("../../src/modules/stock/server.ts");
const sd = await import("../../src/modules/smart-docs/server.ts");
const { asExtraction } = await import("../../src/modules/smart-docs/core.ts");
const { baseDecisions } = await import("../../src/modules/smart-docs/learning.ts");
const arca = await import("../../src/modules/arca/server.ts");
const { executeTool } = await import("../../src/modules/tools/index.ts");

const A = { studioId: d.studios.A, organizationId: d.orgs.sur, canManage: true };
const B = { studioId: d.studios.B, organizationId: d.orgs.ajena, canManage: true };
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A", role: "dueno" };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com", name: "Admin B" };

// Limpieza y módulos
await mock("/__reset", {});
for (const t of ["stock_publications", "stock_conflicts", "stock_unlinked", "stock_store_orders", "stock_listings", "stock_stores", "stock_aliases", "stock_counts", "stock_movements", "stock_products", "stock_deposits"]) await sql.unsafe(`delete from ${t} where organization_id = $1`, [A.organizationId]);
await sql`delete from smart_documents where organization_id = ${A.organizationId} and file_name like 'stock-%'`;
await sql`delete from supplier_rules where organization_id = ${A.organizationId} and supplier_cuit = '30711112223'`;
await sql`delete from organization_modules where organization_id = ${A.organizationId} and module_key = 'stock'`;
await sql`insert into tenant_modules (studio_id, module_key, enabled) values (${A.studioId}, 'stock', true), (${A.studioId}, 'arca', true), (${A.studioId}, 'agent', true), (${B.studioId}, 'stock', true) on conflict (studio_id, module_key) do update set enabled = true, expires_at = null`;
check("sin activar el módulo en la organización, no hay stock", (await throws(() => st.saveProduct(A, actorA, { code: "X", barcode: null, description: "Nada", unit: "unidad", ivaRate: 21, cost: 0, price: 0, minStock: null }))) !== null);
await sql`insert into organization_modules (organization_id, module_key, active) values (${A.organizationId}, 'stock', true) on conflict (organization_id, module_key) do update set active = true`;

// ─── Productos, depósitos e importación ───
const yerba = await st.saveProduct(A, actorA, { code: "YER-1K", barcode: "7790001000011", description: "Yerba mate suave 1 kg", unit: "unidad", ivaRate: 21, cost: 1400, price: 2900, minStock: 5 }, null);
const azucar = await st.saveProduct(A, actorA, { code: "AZU-1K", barcode: null, description: "Azúcar común 1 kg", unit: "unidad", ivaRate: 21, cost: 800, price: 1500, minStock: null }, null);
await st.saveDeposit(A, actorA, "Local");
await st.saveDeposit(A, actorA, "Depósito 3");
check("hasta 3 depósitos", /3 depósitos/.test((await throws(() => st.saveDeposit(A, actorA, "Cuarto"))) ?? ""));
const csv = new File([`Código;Código de barras;Descripción;Unidad;Alícuota;Costo;Precio;Mínimo;Existencia\nFID-500;7790002000022;Fideos tirabuzón 500 g;unidad;21;600;1100;5;3\nACE-900;;Aceite de girasol 900 ml;unidad;21;1800;3200;;12\n;;Sin código;;;;;;\n`], "productos.csv", { type: "text/csv" });
const imp = await st.importProducts(A, actorA, csv);
check("importación de productos con existencia inicial (y errores por fila)", imp.created === 2 && imp.errors.length === 1, JSON.stringify(imp));
const qty = async (id: string) => (await st.listProducts(A)).find((x) => x.p.id === id)?.qty ?? 0;
const [fid] = await sql`select id from stock_products where organization_id = ${A.organizationId} and code = 'FID-500'`;
check("alerta de mínimo: fideos con 3 y mínimo 5 (aviso y auditoría)", (await sql`select alerted_at from stock_products where id = ${fid.id}`)[0].alerted_at !== null && (await sql`select 1 from audit_log where action = 'stock.alerta' and organization_id = ${A.organizationId}`).length >= 1);

// ─── Una compra leída suma; la segunda del mismo proveedor ya viene vinculada ───
async function purchase(key: string, items: { codigo: string; descripcion: string; cantidad: number; precio_unitario: number }[], links: Record<string, string> = {}) {
  const extracted = { tipo_documento: "factura", letra: "A", codigo_comprobante: 1, punto_venta: 2, numero: Number(key.replace(/\D/g, "")), fecha: new Date().toISOString().slice(0, 10), cuit_emisor: "30711112223", razon_social_emisor: "Mayorista Andes SA", neto_gravado: 1000, iva: [{ alicuota: 21, importe: 210 }], percepciones: [], retenciones: [], items: items.map((i) => ({ ...i, alicuota: 21, importe: i.cantidad * i.precio_unitario })), total: 1210, moneda: "PES", confianza: {} };
  const [doc] = await sql`insert into smart_documents (studio_id, organization_id, scope, storage_path, file_name, mime_type, size_bytes, sha256, status, extracted, supplier_cuit) values (${A.studioId}, ${A.organizationId}, 'organizacion', 'x', ${`stock-${key}.pdf`}, 'application/pdf', 1, ${key.padEnd(64, "0")}, 'para_confirmar', ${sql.json(extracted)}, '30711112223') returning id`;
  const e = asExtraction(extracted)!;
  await sd.confirmDoc({ studioId: A.studioId, organizationId: A.organizationId, ownerUserId: null, scope: "organizacion", canConfirm: true }, actorA, doc.id, e, "Mercadería", { decisions: { ...baseDecisions(e, "Mercadería"), productLinks: links } });
  return doc.id as string;
}
const p1 = await purchase("c1", [
  { codigo: "MA-778", descripcion: "Yerba suave x 1kg", cantidad: 20, precio_unitario: 1500 },
  { codigo: "AZU-1K", descripcion: "Azucar 1kg", cantidad: 10, precio_unitario: 900 },
  { codigo: "GA-100", descripcion: "Galletitas surtidas 400 g", cantidad: 6, precio_unitario: 700 },
], { "MA-778": yerba });
check("compra leída: suma lo vinculado (a mano y por el mismo código)", (await qty(yerba)) === 20 && (await qty(azucar)) === 10);
const pending = await st.unlinkedPurchases(A);
check("lo que no se reconoce queda en «Compras sin vincular»", pending.length === 1 && pending[0].code === "GA-100");
const gal = await st.linkPurchaseItem(A, actorA, p1, pending[0].line, "nuevo");
check("crear el producto desde la compra y sumar", (await qty(gal)) === 6);
await purchase("c2", [{ codigo: "GA-100", descripcion: "Galletitas surtidas 400 g", cantidad: 4, precio_unitario: 750 }, { codigo: "MA-778", descripcion: "Yerba suave x 1kg", cantidad: 5, precio_unitario: 1600 }]);
check("aprendizaje: la segunda compra del proveedor ya viene vinculada", (await qty(gal)) === 10 && (await qty(yerba)) === 25, `${await qty(gal)} ${await qty(yerba)}`);
check("el costo queda en el último y el promedio se pondera", (await st.listProducts(A)).find((x) => x.p.id === yerba)!.lastCost === 1600);

// ─── Una venta facturada resta; la nota de crédito devuelve ───
const scope = await arca.issuerForTool(A.studioId, "dueno", A.organizationId);
const inv = await arca.createDraft(scope, { pointOfSale: 1, concept: 1, customer: { docType: 99, docNumber: "0", name: "Consumidor Final", ivaCondition: "consumidor_final" }, items: [{ code: "YER-1K", description: "Yerba mate suave 1 kg", quantity: 3, unitPrice: 2900, ivaRate: 21 }, { description: "Envío a domicilio", quantity: 1, unitPrice: 500, ivaRate: 21 }] }, actorA as never);
const auth = await arca.emitInvoice(scope, inv.id, actorA as never);
check("venta facturada en Faro: resta", auth.status === "autorizada" && (await qty(yerba)) === 22, auth.error ?? "");
check("lo facturado que no es de stock queda sin vincular (no resta)", (await st.listUnlinked(A)).some(({ u }) => u.title === "Envío a domicilio"));
const nc = await arca.createDraft(scope, { cbteType: 8, pointOfSale: 1, concept: 1, associatedInvoiceId: auth.id, customer: { docType: 99, docNumber: "0", name: "Consumidor Final", ivaCondition: "consumidor_final" }, items: [{ code: "YER-1K", description: "Yerba mate suave 1 kg", quantity: 1, unitPrice: 2900, ivaRate: 21 }] }, actorA as never);
await arca.emitInvoice(scope, nc.id, actorA as never);
check("nota de crédito: devuelve al stock", (await qty(yerba)) === 23);

// ─── Tiendas: ventas por aviso, idempotencia, cancelación y sin vincular ───
await mock("/__listing", { platform: "tiendanube", shop: "almacen-sur", id: "L1", sku: "YER-1K", title: "Yerba Mate Suave 1kg", stock: 40 });
await mock("/__listing", { platform: "tiendanube", shop: "almacen-sur", id: "L2", sku: "TN-AZ", title: "Azucar comun x 1 kg", stock: 7 });
await mock("/__listing", { platform: "tiendanube", shop: "almacen-sur", id: "L3", sku: null, title: "Bolsa ecológica reutilizable", stock: 100 });
const store = await st.connectStore(A, actorA, { platform: "tiendanube", name: "Tienda online", shopId: "almacen-sur", depositId: null });
const v1 = (await st.storeView(A, store.id))!;
const lst = (id: string) => v1.listings.find((x) => x.l.external_id === id)!.l;
check("al conectar: vincula por el código y sugiere por el nombre", lst("L1").product_id === yerba && lst("L1").linked_by === "sku" && lst("L2").product_id === null && lst("L2").suggested_product_id === azucar, JSON.stringify(lst("L2").suggestion_reason));
const hook = `${FARO}/api/tiendas/webhook/${store.webhook_token}`;
const order = (id: string, status: string, items: { listing_id: string; sku: string | null; title: string; quantity: number }[]) => ({ id, status, created_at: new Date().toISOString(), items: items.map((i) => ({ ...i, unit_price: 2900 })) });
const r1 = await mock("/__order", { platform: "tiendanube", shop: "almacen-sur", webhook: hook, order: order("1001", "paid", [{ listing_id: "L1", sku: "YER-1K", title: "Yerba Mate Suave 1kg", quantity: 2 }]) });
check("venta en la tienda (aviso): resta", r1.delivered === 200 && (await qty(yerba)) === 21, JSON.stringify(r1));
await mock("/__order", { platform: "tiendanube", shop: "almacen-sur", webhook: hook, order: order("1001", "paid", [{ listing_id: "L1", sku: "YER-1K", title: "Yerba Mate Suave 1kg", quantity: 2 }]) });
const again = await st.webhook(store.webhook_token, { order: order("1001", "paid", [{ listing_id: "L1", sku: "YER-1K", title: "Yerba Mate Suave 1kg", quantity: 2 }]) });
check("la misma venta dos veces no resta dos veces", (await qty(yerba)) === 21 && !!again && "repeated" in again && again.repeated === true);
await st.webhook(store.webhook_token, { order: order("1002", "paid", [{ listing_id: "L3", sku: null, title: "Bolsa ecológica reutilizable", quantity: 1 }]) });
check("una venta sin vincular no resta y queda en «Ventas sin vincular»", (await st.listUnlinked(A)).some(({ u }) => u.title === "Bolsa ecológica reutilizable") && (await sql`select count(*)::int n from stock_movements where organization_id = ${A.organizationId} and source_id = '1002'`)[0].n === 0);
await st.webhook(store.webhook_token, { order: order("1001", "refunded", [{ listing_id: "L1", sku: "YER-1K", title: "Yerba Mate Suave 1kg", quantity: 2 }]) });
await st.webhook(store.webhook_token, { order: order("1001", "refunded", [{ listing_id: "L1", sku: "YER-1K", title: "Yerba Mate Suave 1kg", quantity: 2 }]) });
check("una devolución repone (una sola vez)", (await qty(yerba)) === 23);
await st.webhook(store.webhook_token, { order: order("1003", "paid", [{ listing_id: "L2", sku: "TN-AZ", title: "Azucar comun x 1 kg", quantity: 1 }]) });
check("venta de una publicación sugerida pero no vinculada: espera", (await qty(azucar)) === 10);
const l2 = lst("L2");
const waited = await st.linkListing(A, actorA, l2.id, azucar);
check("al vincular, descuenta lo que esperaba", waited === 1 && (await qty(azucar)) === 9);
await mock("/__listing", { platform: "mercadolibre", shop: "almacen-ml", id: "MLA1", sku: "TN-AZ", title: "Azúcar 1 kilo", stock: 3 });
const ml = await st.connectStore(A, actorA, { platform: "mercadolibre", name: "Mercado Libre", shopId: "almacen-ml", depositId: null });
check("aprendizaje: otra tienda con el mismo SKU se vincula sola", (await st.storeView(A, ml.id))!.listings[0].l.linked_by === "aprendido");
await mock("/__order", { platform: "empretienda", shop: "almacen-et", order: order("E-9", "paid", [{ listing_id: "ET1", sku: "AZU-1K", title: "Azúcar", quantity: 2 }]) });
await mock("/__listing", { platform: "empretienda", shop: "almacen-et", id: "ET1", sku: "AZU-1K", title: "Azúcar", stock: 5 });
await st.connectStore(A, actorA, { platform: "empretienda", name: "Empretienda", shopId: "almacen-et", depositId: null });
await st.runStockJobs();
await st.runStockJobs();
check("tienda por consulta (Empretienda): la venta llega y resta una sola vez", (await qty(azucar)) === 7);

// ─── Publicación hacia la tienda: apagada, conflicto sin pisar, reintentos y pausa ───
check("publicar está apagado por defecto", (await st.publishStore(store.id)).published === 0 && (await sql`select count(*)::int n from stock_publications where store_id = ${store.id}`)[0].n === 0);
await st.setStoreSync(A, actorA, store.id, { syncEnabled: true, margin: 1, paused: false });
check("activar la publicación queda en la auditoría", (await sql`select 1 from audit_log where action = 'automatizacion.activar' and entity_id = ${store.id}`).length === 1);
const pub1 = await st.publishStore(store.id);
const puts0 = (await fetch(`${TIENDAS}/__state`).then((r) => r.json()))["tiendanube/almacen-sur"].puts.length;
check("la primera vez, si la tienda tiene otra cantidad: conflicto, nada se pisa", pub1.conflicts === 2 && pub1.published === 0 && puts0 === 0, JSON.stringify(pub1));
const conf = (await st.storeView(A, store.id))!.conflicts;
for (const c of conf) await st.resolveConflict(A, actorA, c.c.id, "usar_faro");
const state1 = (await fetch(`${TIENDAS}/__state`).then((r) => r.json()))["tiendanube/almacen-sur"];
check("«Publicar lo de Faro»: publica la existencia menos el margen", state1.listings.find((l: { id: string }) => l.id === "L1").stock === 22 && state1.listings.find((l: { id: string }) => l.id === "L2").stock === 6);
check("solo publica lo vinculado (la bolsa no)", state1.listings.find((l: { id: string }) => l.id === "L3").stock === 100);
await mock("/__remote_stock", { platform: "tiendanube", shop: "almacen-sur", id: "L1", qty: 99 });
await st.adjust(A, actorA, { productId: yerba, depositId: null, qty: -3, reason: "Rotura de paquetes" });
const pub2 = await st.publishStore(store.id);
const state2 = (await fetch(`${TIENDAS}/__state`).then((r) => r.json()))["tiendanube/almacen-sur"];
check("alguien cambió la tienda: conflicto y no se pisa", pub2.conflicts === 1 && state2.listings.find((l: { id: string }) => l.id === "L1").stock === 99);
const [cAj] = (await st.storeView(A, store.id))!.conflicts;
await st.resolveConflict(A, actorA, cAj.c.id, "ajustar_faro");
check("«Ajustar Faro a la tienda»: ajuste auditado", (await sql`select 1 from audit_log where action = 'stock.conflicto' and entity_id = ${store.id} and metadata->>'resolucion' = 'ajustar_faro'`).length === 1);
await st.webhook(store.webhook_token, { order: order("1004", "paid", [{ listing_id: "L2", sku: "TN-AZ", title: "Azucar comun x 1 kg", quantity: 1 }]) });
await mock("/__fail", { platform: "tiendanube", shop: "almacen-sur", times: 1 });
const pub3 = await st.publishStore(store.id);
const [lastErr] = await sql`select status, attempts, next_retry_at from stock_publications where store_id = ${store.id} order by created_at desc limit 1`;
check("si la tienda falla: queda en el registro con reintento", pub3.errors === 1 && lastErr.status === "error" && lastErr.next_retry_at !== null);
await sql`update stock_publications set next_retry_at = now() - interval '1 minute' where store_id = ${store.id} and status = 'error'`;
const pub4 = await st.publishStore(store.id);
check("el reintento publica", pub4.published === 1 && (await sql`select attempts from stock_publications where store_id = ${store.id} and status = 'ok' order by created_at desc limit 1`)[0].attempts === 2);
await st.setStoreSync(A, actorA, store.id, { syncEnabled: true, margin: 1, paused: true });
await st.adjust(A, actorA, { productId: azucar, depositId: null, qty: 5, reason: "Reposición" });
check("en pausa no publica", (await st.publishStore(store.id)).published === 0);
check("Mercado Pago (QR/Point) no permite publicar", /no permite publicar/.test((await throws(async () => { const mp = await st.connectStore(A, actorA, { platform: "mercadopago", name: "QR", shopId: "qr-1", depositId: null }); await st.setStoreSync(A, actorA, mp.id, { syncEnabled: true, margin: 0, paused: false }); })) ?? ""));

// ─── Conteo, inventario a una fecha pasada y CMV ───
const cnt = await st.closeCount(A, actorA, null, [{ ref: "7790001000011", counted: 18 }, { ref: "NO-EXISTE", counted: 1 }]);
check("conteo con código de barras: ajusta la diferencia e informa lo desconocido", cnt.adjusted === 1 && cnt.unknown.includes("NO-EXISTE") && (await (async () => { const x = (await st.listProducts(A)).find((y) => y.p.id === yerba)!; return x.byDeposit[(await st.deposits(A))[0].id]; })()) === 18);
await sql`update stock_movements set at = '2025-12-15T15:00:00Z' where organization_id = ${A.organizationId} and kind = 'inicial'`;
const past = await st.inventory(A, "2025-12-31", "ultimo");
check("inventario valorizado a una fecha pasada (solo lo que había)", past.rows.filter((r) => r.qty).length === 2 && past.total === 3 * 600 + 12 * 1800, JSON.stringify(past.rows.map((r) => [r.code, r.qty, r.value])));
const today = await st.inventory(A, new Date().toISOString().slice(0, 10), "promedio");
check("inventario de hoy por promedio ponderado", today.total > past.total && today.rows.some((r) => r.code === "YER-1K" && r.qty > 0));
const c = await st.cmvOf(A, "2026-01-01", new Date().toISOString().slice(0, 10));
check("CMV estimado del período", c.total > 0 && c.units > 0, JSON.stringify(c));

// ─── Vigía y Agente ───
const ctxA = { studioId: A.studioId, actor: { id: actorA.id, email: actorA.email, name: "Admin A", role: "dueno" as const }, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };
const t1 = await executeTool("consultar_stock", { organizacion_id: A.organizationId, producto: "yerba" }, ctxA);
check("«¿cuánto me queda de yerba?»", t1.status === "ok" && JSON.stringify(t1).includes("YER-1K"));
const t2 = await executeTool("stock_bajo_minimo", { organizacion_id: A.organizationId }, ctxA);
check("debajo del mínimo", t2.status === "ok" && JSON.stringify(t2).includes("FID-500"));
const t3 = await executeTool("mas_vendidos", { organizacion_id: A.organizationId }, ctxA);
check("más vendidos", t3.status === "ok" && JSON.stringify(t3).includes("AZU-1K"));
const t4 = await executeTool("inventario_valorizado", { organizacion_id: A.organizationId, fecha: "2025-12-31" }, ctxA);
check("inventario al 31/12 desde el Vigía", t4.status === "ok" && JSON.stringify(t4).includes('"total":23400'));
const agent = await import("../../src/modules/agent/server.ts");
const [me] = await sql`select u.id, u.name, u.email, u.role, s.kind from users u join studios s on s.id = u.studio_id where u.id = ${actorA.id}`;
const tid = await agent.createTask({ id: me.id, name: me.name, email: me.email, role: me.role, studioId: A.studioId, tenantKind: me.kind }, { templateKey: "inventario", scope: "organizacion", organizationId: A.organizationId, date: "2025-12-31" });
for (let i = 0; i < 40; i++) {
  await agent.runAgentWorker();
  if ((await sql`select status from agent_tasks where id = ${tid}`)[0].status === "completada") break;
}
const [task] = await sql`select status, report from agent_tasks where id = ${tid}`;
check("el Agente: inventario al 31/12 y stock bajo", task.status === "completada" && task.report.findings.some((f: { title: string }) => f.title.startsWith("Inventario valorizado al 31/12/2025")) && task.report.findings.some((f: { title: string }) => /debajo del mínimo/.test(f.title)), JSON.stringify(task.report?.findings?.map((f: { title: string }) => f.title)));

// ─── Aislamiento forzando IDs ───
check("otro estudio no ve los productos ajenos", (await st.listProducts({ ...B, organizationId: A.organizationId })).length === 0);
check("otro estudio no ajusta ni vincula", (await throws(() => st.adjust(B, actorB, { productId: yerba, depositId: null, qty: 1, reason: "Forzado" }))) !== null && (await throws(() => st.linkListing(B, actorB, l2.id, azucar))) !== null);
check("otro estudio no ve la tienda ni resuelve sus diferencias", (await st.storeView(B, store.id)) === null && (await throws(() => st.resolveConflict(B, actorB, cAj.c.id, "usar_faro"))) !== null);
check("otra organización del mismo estudio tampoco", (await throws(() => st.adjust({ ...A, organizationId: d.orgs.norte }, actorA, { productId: yerba, depositId: null, qty: 1, reason: "Forzado" }))) !== null && (await st.storeView({ ...A, organizationId: d.orgs.norte }, store.id)) === null);
check("un aviso con un token inventado no entra", (await st.webhook("x".repeat(32), { order: order("666", "paid", [{ listing_id: "L1", sku: "YER-1K", title: "x", quantity: 50 }]) })) === null);
const hb = await fetch(`${FARO}/api/tiendas/webhook/${"y".repeat(32)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
check("…ni por HTTP", hb.status === 404);
const ctxB = { ...ctxA, studioId: B.studioId, actor: { ...ctxA.actor, id: actorB.id } };
check("el Vigía de otro estudio no consulta el stock ajeno", (await executeTool("consultar_stock", { organizacion_id: A.organizationId, producto: "yerba" }, ctxB)).status === "denegado");
check("sin permiso de gestión no se ajusta", (await throws(() => st.adjust({ ...A, canManage: false }, actorA, { productId: yerba, depositId: null, qty: 1, reason: "Sin permiso" }))) !== null);

await sql`delete from tenant_modules where studio_id = ${A.studioId} and module_key = 'agent'`;
await sql.end();
console.log(fails ? `\n${fails} fallas` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
