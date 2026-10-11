import assert from "node:assert/strict";
import test from "node:test";
import { EXTRACTION_SCHEMA, exportRow, fingerprint, lowFields, normalize, suggestAccount, toCsv, toTangoCsv, validate } from "./core";

const base = EXTRACTION_SCHEMA.parse({
  tipo_documento: "factura",
  cuit_emisor: "30-71111111-1",
  razon_social_emisor: "Edenor S.A.",
  cuit_receptor: null,
  letra: "A",
  codigo_comprobante: 1,
  punto_venta: 2,
  numero: 45,
  fecha: "2026-10-01",
  neto_gravado: 1000,
  no_gravado: null,
  exento: null,
  iva: [{ alicuota: 21, importe: 210 }],
  percepciones: [{ concepto: "IIBB", importe: 30 }],
  total: 1240,
  cae: "75123456789012",
  vencimiento_cae: "2026-10-11",
  confianza: { cuit_emisor: 0.98, fecha: 0.95, total: 0.99, numero: 0.6 },
});

test("normaliza y valida", () => {
  const e = normalize(base);
  assert.equal(e.cuit_emisor, "30711111111");
  const v = validate(e, "2026-10-11");
  assert.equal(v.cuit, "ok");
  assert.equal(v.cae, "ok");
  assert.equal(v.totales, "ok");
  assert.deepEqual(v.mensajes, []);
});

test("detecta errores", () => {
  const v = validate(normalize({ ...base, cuit_emisor: "30711111112", total: 1300, cae: "123" }), "2026-10-11");
  assert.equal(v.cuit, "error");
  assert.equal(v.cae, "error");
  assert.equal(v.totales, "error");
  assert.equal(v.mensajes.length, 3);
});

test("confianza baja y huella", () => {
  const e = normalize(base);
  assert.deepEqual(lowFields(e), ["numero"]);
  assert.equal(fingerprint(e), "c:30711111111:1:2:45");
  assert.equal(fingerprint({ ...e, numero: null }), "t:30711111111:2026-10-01:124000");
});

test("cuenta sugerida y exportación", () => {
  const e = normalize(base);
  assert.equal(suggestAccount(e), "Servicios");
  assert.equal(suggestAccount(e, new Map([["30711111111", "Compras"]])), "Compras");
  const r = exportRow(e, "Servicios");
  assert.equal(r.iva_21, 210);
  assert.equal(r.percepciones, 30);
  assert.equal(r.tipo, "Factura A");
  const csv = toCsv([r]);
  assert.ok(csv.includes("Edenor S.A.;Servicios;1000;0;0;210"));
  assert.ok(toTangoCsv([r]).includes("01/10/2026;Factura A;00002-00000045;30-71111111-1"));
});
