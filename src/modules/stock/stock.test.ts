import assert from "node:assert/strict";
import test from "node:test";
import { aliasKeys, availableToPublish, cmv, inventoryValue, similarity, suggestProduct, valuate, type Move } from "./core";

const m = (at: string, kind: string, qty: number, unitCost: number | null = null, productId = "p1", depositId = "d1"): Move => ({ productId, depositId, at: `${at}T12:00:00.000Z`, kind, qty, unitCost });

test("existencia, último costo y promedio ponderado; a una fecha pasada", () => {
  const moves = [m("2026-01-10", "compra", 10, 100), m("2026-02-10", "venta", -4), m("2026-03-10", "compra", 6, 160), m("2026-04-10", "venta_tienda", -2, null, "p1", "d2")];
  const now = valuate(moves).get("p1")!;
  assert.equal(now.qty, 10);
  assert.equal(now.lastCost, 160);
  assert.equal(now.avgCost, 130); // (6×100 + 6×160) / 12
  assert.deepEqual(now.byDeposit, { d1: 12, d2: -2 });
  const past = valuate(moves, "2026-02-28").get("p1")!;
  assert.equal(past.qty, 6);
  assert.equal(past.lastCost, 100);
  assert.equal(inventoryValue(valuate(moves, "2026-02-28"), "ultimo").total, 600);
  assert.equal(inventoryValue(valuate(moves), "promedio").total, 1300);
});

test("CMV estimado: ventas al costo promedio del momento, menos devoluciones", () => {
  const moves = [m("2026-01-10", "compra", 10, 100), m("2026-01-20", "venta", -4), m("2026-02-01", "compra", 10, 200), m("2026-02-05", "venta", -2), m("2026-02-06", "devolucion", 1)];
  assert.deepEqual(cmv(moves, "2026-01-01", "2026-01-31"), { total: 400, units: 4 });
  const feb = cmv(moves, "2026-02-01", "2026-02-28");
  assert.equal(feb.units, 1);
  assert.equal(feb.total, 162.5); // promedio (6×100 + 10×200)/16 = 162,5
});

test("disponible para publicar: con margen y nunca negativo", () => {
  assert.equal(availableToPublish(10, 2), 8);
  assert.equal(availableToPublish(1.7, 0), 1);
  assert.equal(availableToPublish(1, 3), 0);
});

test("sugerencias: código igual o aprendido se vinculan solos; el nombre parecido solo sugiere", () => {
  const products = [
    { id: "a", code: "YER-1K", barcode: "7790001000011", description: "Yerba mate suave 1 kg" },
    { id: "b", code: "AZU-1K", barcode: null, description: "Azúcar común 1 kg" },
  ];
  assert.equal(suggestProduct({ sku: "yer-1k", title: "lo que sea" }, products, [])?.by, "sku");
  assert.equal(suggestProduct({ sku: "7790001000011", title: "x" }, products, [])?.productId, "a");
  const s = suggestProduct({ sku: "ML-999", title: "Yerba Mate Suave x 1 kg" }, products, []);
  assert.ok(s && !s.auto && s.productId === "a" && s.score >= 0.5, JSON.stringify(s));
  assert.equal(suggestProduct({ sku: null, title: "Fideos tirabuzón" }, products, []), null);
  const learned = suggestProduct({ sku: "ML-999", title: "Otra cosa" }, products, aliasKeys({ sku: "ML-999", title: "Yerba" }).map((alias) => ({ alias, productId: "b" })));
  assert.equal(learned?.by, "aprendido");
  assert.ok(similarity("Azúcar común 1 kg", "AZUCAR COMUN X 1KG") > similarity("Azúcar común 1 kg", "Yerba 1 kg"));
});
