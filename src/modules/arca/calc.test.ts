import { test } from "node:test";
import assert from "node:assert/strict";
import { fromArcaDate, fullNumber, invoiceTotals, qrUrl, toArcaDate } from "./calc";
import { allowedTypes, validCuit } from "./config";

test("factura C: sin IVA discriminado", () => {
  const t = invoiceTotals(11, [{ description: "Diseño", quantity: 1, unitPrice: 150000, ivaRate: null }]);
  assert.deepEqual(t, { net: 150000, iva: 0, exempt: 0, total: 150000, ivaBreakdown: [] });
});

test("factura A: neto e IVA por alícuota", () => {
  const t = invoiceTotals(1, [
    { description: "Servicio", quantity: 2, unitPrice: 1000, ivaRate: 21 },
    { description: "Libro", quantity: 1, unitPrice: 500, ivaRate: 10.5 },
  ]);
  assert.equal(t.net, 2500);
  assert.equal(t.iva, 472.5);
  assert.equal(t.total, 2972.5);
  assert.deepEqual(t.ivaBreakdown, [
    { rate: 21, base: 2000, amount: 420 },
    { rate: 10.5, base: 500, amount: 52.5 },
  ]);
});

test("redondeo a centavos", () => {
  const t = invoiceTotals(6, [{ description: "x", quantity: 3, unitPrice: 33.333, ivaRate: 21 }]);
  assert.equal(t.net, 100);
  assert.equal(t.iva, 21);
});

test("qué letra corresponde", () => {
  assert.deepEqual(allowedTypes("monotributo", "responsable_inscripto"), [11, 12, 13]);
  assert.deepEqual(allowedTypes("responsable_inscripto", "responsable_inscripto"), [1, 2, 3]);
  assert.deepEqual(allowedTypes("responsable_inscripto", "consumidor_final"), [6, 7, 8]);
  assert.deepEqual(allowedTypes("responsable_inscripto", "exterior"), [19, 20, 21]);
});

test("CUIT con dígito verificador", () => {
  assert.equal(validCuit("20304050609"), true);
  assert.equal(validCuit("30711111111"), true);
  assert.equal(validCuit("20304050607"), false);
});

test("QR según la especificación de ARCA", () => {
  const url = qrUrl({ issueDate: "2026-10-11", cuit: "20304050607", pointOfSale: 1, cbteType: 11, number: 7, total: 150000, currency: "PES", exchangeRate: 1, docType: 80, docNumber: "30711111119", cae: "70123456789012" });
  assert.ok(url.startsWith("https://www.afip.gob.ar/fe/qr/?p="));
  const json = JSON.parse(Buffer.from(url.split("p=")[1], "base64").toString());
  assert.equal(json.ver, 1);
  assert.equal(json.tipoCodAut, "E");
  assert.equal(json.codAut, 70123456789012);
  assert.equal(json.cuit, 20304050607);
});

test("fechas y número", () => {
  assert.equal(toArcaDate("2026-10-11"), "20261011");
  assert.equal(fromArcaDate("20261021"), "2026-10-21");
  assert.equal(fullNumber(2, 123), "00002-00000123");
});
