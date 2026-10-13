import assert from "node:assert/strict";
import { test } from "node:test";
import type { BookRow } from "./core";
import { ivaLight, purchaseFiles, salesFiles } from "./digital";

const row = (o: Partial<BookRow>): BookRow => ({ id: "x", kind: "venta", fecha: "2026-09-10", letra: "A", codigo: 1, puntoVenta: 3, numero: 125, cuit: "30712345678", nombre: "Distribuidora Ñandú S.A.", neto: 100000, noGravado: 0, exento: 0, iva: [{ alicuota: 21, importe: 21000 }], percepcionesIva: 0, total: 121000, cae: "1", fingerprint: null, loadedAt: null, status: "autorizada", ...o });

test("ventas: 266 posiciones por comprobante y 62 por alícuota", () => {
  const f = salesFiles([row({}), row({ letra: "C", codigo: 11, iva: [], neto: 0, total: 5000 }), row({ status: "rechazada" }), row({ cuit: "0", nombre: "Consumidor final", letra: "B", codigo: 6, iva: [{ alicuota: 21, importe: 2100 }, { alicuota: 10.5, importe: 1050 }] })]);
  const lines = f.cbte.split("\r\n");
  assert.equal(f.count, 3);
  for (const l of lines) assert.equal(l.length, 266);
  for (const l of f.alic.split("\r\n")) assert.equal(l.length, 62);
  assert.equal(f.alic.split("\r\n").length, 3);
  assert.equal(lines[0].slice(0, 8), "20260910");
  assert.equal(lines[0].slice(8, 11), "001");
  assert.equal(lines[0].slice(56, 58), "80");
  assert.ok(lines[0].includes("Distribuidora Nandu S.A."));
  assert.equal(lines[2].slice(56, 58), "99");
  assert.ok(f.alic.split("\r\n")[0].endsWith("0005000000000021000"));
});

test("compras: 325 posiciones por comprobante y 84 por alícuota; notas de crédito en positivo", () => {
  const nc = row({ kind: "compra", codigo: 3, neto: -50000, iva: [{ alicuota: 21, importe: -10500 }], total: -60500 });
  const f = purchaseFiles([row({ kind: "compra" }), nc, row({ kind: "compra", letra: "C", codigo: 11, iva: [] })], () => 21000);
  for (const l of f.cbte.split("\r\n")) assert.equal(l.length, 325);
  for (const l of f.alic.split("\r\n")) assert.equal(l.length, 84);
  assert.equal(f.alic.split("\r\n").length, 2);
  assert.ok(!f.cbte.includes("-"));
});

test("semáforo de la posición de IVA", () => {
  assert.equal(ivaLight(-100, [50, 50]), "verde");
  assert.equal(ivaLight(100, []), "verde");
  assert.equal(ivaLight(110, [100, 100, 100]), "verde");
  assert.equal(ivaLight(140, [100, 100, 100]), "amarillo");
  assert.equal(ivaLight(200, [100, 100, 100]), "rojo");
  assert.equal(ivaLight(100, [-20, 0]), "amarillo");
});
