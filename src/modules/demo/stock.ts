// Demo de Stock (§2.q etapa 7): dos organizaciones de Ferreyra & Asociados con
// el módulo activo, productos en dos depósitos, compras, ventas facturadas y
// de tiendas (simuladas), una venta sin vincular, una diferencia para revisar
// con la tienda y su registro de publicaciones. Todo con movimientos fechados
// para que el inventario a una fecha pasada tenga sentido.

import { randomBytes } from "node:crypto";
import type { Db } from "@/db";
import { organization_modules, stock_conflicts, stock_deposits, stock_listings, stock_movements, stock_products, stock_publications, stock_store_orders, stock_stores, stock_unlinked } from "@/db/schema";
import type { DemoUser } from "./base";

const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400_000);

const CATALOGS: Record<string, [string, string, number, number, number | null][]> = {
  lola: [
    ["REM-BAS-M", "Remera básica algodón talle M", 6500, 14900, 10],
    ["REM-BAS-L", "Remera básica algodón talle L", 6500, 14900, 10],
    ["JEA-MOM-38", "Jean mom azul talle 38", 18500, 42900, 4],
    ["BUZ-OVE-U", "Buzo oversize frisa único", 15200, 34900, 5],
    ["MED-PAC-3", "Pack 3 medias de algodón", 2900, 6900, 15],
  ],
  pintureria: [
    ["LAT-INT-20", "Látex interior blanco 20 l", 52000, 89900, 6],
    ["ESM-SIN-1", "Esmalte sintético negro 1 l", 9800, 17900, 8],
    ["RODI-22", "Rodillo antigota 22 cm", 4200, 8900, 10],
    ["CINTA-48", "Cinta de papel 48 mm", 1500, 3200, 20],
  ],
};

export async function seedStock(db: Db, studioId: string, by: DemoUser, orgs: { id: string; name: string }[]) {
  const targets = [orgs.find((o) => /Indumentaria Lola/.test(o.name)), orgs.find((o) => /Pinturer/.test(o.name))].filter(Boolean) as { id: string; name: string }[];
  for (const [k, org] of targets.entries()) {
    const key = k === 0 ? "lola" : "pintureria";
    await db.insert(organization_modules).values({ organization_id: org.id, module_key: "stock", active: true, activated_by: by.id }).onConflictDoNothing();
    const [main, local] = await db
      .insert(stock_deposits)
      .values([
        { studio_id: studioId, organization_id: org.id, name: "Depósito principal", position: 0 },
        { studio_id: studioId, organization_id: org.id, name: key === "lola" ? "Showroom Palermo" : "Local Caballito", position: 1 },
      ])
      .returning();
    const products = await db
      .insert(stock_products)
      .values(CATALOGS[key].map(([code, description, cost, price, min], i) => ({ studio_id: studioId, organization_id: org.id, code, barcode: `77900${k}${String(i).padStart(7, "0")}`, description, cost: String(cost), price: String(price), min_stock: min == null ? null : String(min), source: "importacion" })))
      .returning();
    const moves: (typeof stock_movements.$inferInsert)[] = [];
    for (const [i, p] of products.entries()) {
      const cost = Number(p.cost);
      moves.push({ studio_id: studioId, organization_id: org.id, product_id: p.id, deposit_id: main.id, at: at(120), kind: "inicial", qty: String(30 + i * 5), unit_cost: String(Math.round(cost * 0.9)), source_type: "import", idem_key: `demo:inicial:${p.id}` });
      moves.push({ studio_id: studioId, organization_id: org.id, product_id: p.id, deposit_id: main.id, at: at(40), kind: "compra", qty: String(20), unit_cost: String(cost), source_type: "smart_document", idem_key: `demo:compra:${p.id}` });
      moves.push({ studio_id: studioId, organization_id: org.id, product_id: p.id, deposit_id: local.id, at: at(30), kind: "ajuste", qty: String(8), unit_cost: String(cost), source_type: "manual", reason: "Reposición del local", actor_id: by.id });
      moves.push({ studio_id: studioId, organization_id: org.id, product_id: p.id, deposit_id: main.id, at: at(30), kind: "ajuste", qty: String(-8), source_type: "manual", reason: "Pasa al local", actor_id: by.id });
      for (let d = 25; d > 0; d -= 5) moves.push({ studio_id: studioId, organization_id: org.id, product_id: p.id, deposit_id: main.id, at: at(d), kind: d % 10 ? "venta" : "venta_tienda", qty: String(-(3 + ((i + d) % 4))), source_type: d % 10 ? "invoice" : "store_order", idem_key: `demo:venta:${p.id}:${d}` });
    }
    // Un producto debajo del mínimo
    const left = moves.filter((m) => m.product_id === products[2].id && m.deposit_id === main.id).reduce((a, m) => a + Number(m.qty), 0);
    moves.push({ studio_id: studioId, organization_id: org.id, product_id: products[2].id, deposit_id: main.id, at: at(2), kind: "venta_tienda", qty: String(-(left - 2)), source_type: "store_order", idem_key: `demo:venta-grande:${products[2].id}` });
    await db.insert(stock_movements).values(moves);
    if (key !== "lola") continue;
    // Tienda online simulada con publicaciones, pedidos, una venta sin vincular y una diferencia
    const [store] = await db.insert(stock_stores).values({ studio_id: studioId, organization_id: org.id, platform: "tiendanube", name: "Tienda online Lola", shop_id: "lola-demo", deposit_id: main.id, sync_enabled: true, safety_margin: "2", webhook_token: randomBytes(24).toString("base64url"), created_by: by.id }).returning();
    await db.insert(stock_stores).values({ studio_id: studioId, organization_id: org.id, platform: "mercadolibre", name: "Mercado Libre", shop_id: "lola-ml-demo", deposit_id: main.id, webhook_token: randomBytes(24).toString("base64url"), created_by: by.id });
    const listings = await db
      .insert(stock_listings)
      .values([
        ...products.slice(0, 4).map((p, i) => ({ store_id: store.id, studio_id: studioId, organization_id: org.id, external_id: `TN-${i + 1}`, sku: p.code, title: p.description, product_id: p.id, linked_by: "sku", last_published_qty: "20", remote_qty: i === 1 ? "35" : "20", synced_at: at(1) })),
        { store_id: store.id, studio_id: studioId, organization_id: org.id, external_id: "TN-9", sku: null, title: "Gift card $ 20.000", suggested_product_id: null },
        { store_id: store.id, studio_id: studioId, organization_id: org.id, external_id: "TN-5", sku: "MED-3P", title: "Medias pack x3 algodón", suggested_product_id: products[4].id, suggestion_score: "0.6", suggestion_reason: "Nombre parecido a «Pack 3 medias de algodón» (60 %)" },
      ])
      .returning();
    await db.insert(stock_store_orders).values([
      { store_id: store.id, studio_id: studioId, organization_id: org.id, external_id: "88001", status: "pagada", lines: [{ listingId: "TN-1", sku: products[0].code, title: products[0].description, qty: 2, price: 14900 }], via: "webhook", received_at: at(3) },
      { store_id: store.id, studio_id: studioId, organization_id: org.id, external_id: "88002", status: "devuelta", lines: [{ listingId: "TN-3", sku: products[2].code, title: products[2].description, qty: 1, price: 42900 }], via: "webhook", received_at: at(2) },
      { store_id: store.id, studio_id: studioId, organization_id: org.id, external_id: "88003", status: "pagada", lines: [{ listingId: "TN-9", sku: null, title: "Gift card $ 20.000", qty: 1, price: 20000 }], via: "webhook", received_at: at(1) },
    ]);
    await db.insert(stock_unlinked).values({ studio_id: studioId, organization_id: org.id, source_type: "tienda", source_id: "88003", line: 0, store_id: store.id, listing_external_id: "TN-9", title: "Gift card $ 20.000", qty: "1", at: at(1) });
    await db.insert(stock_conflicts).values({ store_id: store.id, listing_id: listings[1].id, studio_id: studioId, organization_id: org.id, faro_qty: "18", remote_qty: "35", published_qty: "20" });
    await db.insert(stock_publications).values([
      ...listings.slice(0, 4).map((l) => ({ store_id: store.id, listing_id: l.id, studio_id: studioId, organization_id: org.id, qty: "20", status: "ok", created_at: at(1) })),
      { store_id: store.id, listing_id: listings[1].id, studio_id: studioId, organization_id: org.id, qty: "18", status: "conflicto", error: "La tienda tiene 35 y Faro había publicado 20: no se pisa." },
    ]);
  }
}
