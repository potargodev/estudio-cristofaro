import assert from "node:assert/strict";
import { test } from "node:test";
import { arNumber, parseMisComprobantes, rateOf } from "./core";

test("números y alícuotas de ARCA", () => {
  assert.equal(arNumber("1.234,56"), 1234.56);
  assert.equal(arNumber("1234.56"), 1234.56);
  assert.equal(arNumber(""), null);
  assert.equal(rateOf(1000, 105), 10.5);
  assert.equal(rateOf(1000, 210), 21);
});

test("CSV de Mis Comprobantes recibidos", () => {
  const rows = [
    ["Mis Comprobantes Recibidos - CUIT 30712345671"],
    ["Fecha", "Tipo", "Punto de Venta", "Número Desde", "Número Hasta", "Cód. Autorización", "Tipo Doc. Emisor", "Nro. Doc. Emisor", "Denominación Emisor", "Tipo Cambio", "Moneda", "Imp. Neto Gravado", "Imp. Neto No Gravado", "Imp. Op. Exentas", "IVA", "Imp. Total"],
    ["05/09/2026", "1 - Factura A", "3", "125", "125", "75123456789012", "80", "30500010912", "Papelera SA", "1", "$", "1.000,00", "0,00", "0,00", "210,00", "1.210,00"],
    ["06/09/2026", "3 - Nota de Crédito A", "3", "7", "7", "75123456789013", "80", "30500010912", "Papelera SA", "1", "$", "100,00", "0,00", "0,00", "21,00", "121,00"],
    ["", "", "", ""],
    ["xx", "Factura", "", ""],
  ];
  const r = parseMisComprobantes(rows, "30712345671");
  assert.equal(r.docs.length, 2);
  assert.equal(r.errors.length, 1);
  const a = r.docs[0].extraction;
  assert.equal(a.fecha, "2026-09-05");
  assert.equal(a.letra, "A");
  assert.equal(a.total, 1210);
  assert.deepEqual(a.iva, [{ alicuota: 21, importe: 210 }]);
  assert.equal(a.cuit_receptor, "30712345671");
  assert.equal(r.docs[1].extraction.tipo_documento, "nota_credito");
});
