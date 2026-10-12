import assert from "node:assert/strict";
import test from "node:test";
import { EXTRACTION_SCHEMA, exportRow, normalize, validate } from "./core";
import { applyRule, baseDecisions, learnFrom } from "./learning";
import { classifyTributo, defaultTreatment } from "./tributos";

const invoice = normalize(
  EXTRACTION_SCHEMA.parse({
    tipo_documento: "factura",
    cuit_emisor: "30712345671",
    razon_social_emisor: "Molinos del Plata SA",
    cuit_receptor: null,
    letra: "A",
    codigo_comprobante: 1,
    punto_venta: 7,
    numero: 100,
    fecha: "2026-10-10",
    neto_gravado: 230000,
    no_gravado: null,
    exento: null,
    iva: [{ alicuota: 21, importe: 48300 }],
    percepciones: [
      { concepto: "Percepción IIBB CABA (AGIP)", importe: 6900 },
      { concepto: "Percepción IVA RG 2408", importe: 6900 },
    ],
    retenciones: [{ concepto: "Retención Ganancias RG 830", importe: 1500 }],
    items: [
      { descripcion: "Harina 000 x 25 kg", codigo: "HAR25", cantidad: 10, precio_unitario: 18000, alicuota: 21, importe: null },
      { descripcion: "Levadura 500 g", codigo: "LEV500", cantidad: 20, precio_unitario: 2500, alicuota: 21, importe: 50000 },
    ],
    total: 292100,
    cae: "75123456789013",
    vencimiento_cae: "2026-10-20",
  }),
);

test("tributos: tipo y jurisdicción por el concepto impreso", () => {
  assert.deepEqual(classifyTributo("Percepción IIBB CABA (AGIP)"), { tipo: "iibb", jurisdiccion: "CABA" });
  assert.deepEqual(classifyTributo("Perc. Ing. Brutos ARBA"), { tipo: "iibb", jurisdiccion: "Buenos Aires" });
  assert.deepEqual(classifyTributo("Percepción Ingresos Brutos Santa Fe"), { tipo: "iibb", jurisdiccion: "Santa Fe" });
  assert.equal(classifyTributo("Percepción IVA RG 2408").tipo, "iva");
  assert.equal(classifyTributo("Retención Ganancias RG 830").tipo, "ganancias");
  assert.equal(classifyTributo("Impuestos internos").tipo, "internos");
  assert.equal(classifyTributo("Tasa municipal de seguridad e higiene").tipo, "otros");
  assert.equal(defaultTreatment("iva"), "credito_fiscal");
  assert.equal(defaultTreatment("internos"), "costo");
});

test("extracción: percepciones clasificadas, ítems que cierran con el neto y total que cierra", () => {
  assert.equal(invoice.percepciones[0].tipo, "iibb");
  assert.equal(invoice.percepciones[0].jurisdiccion, "CABA");
  assert.equal(invoice.retenciones[0].tipo, "ganancias");
  const v = validate(invoice, "2026-10-12");
  assert.equal(v.totales, "ok");
  assert.equal(v.items, "ok");
  const bad = validate({ ...invoice, items: [{ ...invoice.items[0], cantidad: 9 }, invoice.items[1]] }, "2026-10-12");
  assert.equal(bad.items, "error");
  const row = exportRow(invoice, "Compras");
  assert.equal(row.percepciones_iibb, 6900);
  assert.equal(row.percepciones_iva, 6900);
  assert.equal(row.percepciones, 13800);
});

test("aprendizaje: lo corregido queda como regla y el siguiente comprobante viene corregido", () => {
  const base = baseDecisions(invoice, "Compras");
  assert.equal(base.treatments["iibb:CABA"], "pago_a_cuenta");
  // Primera factura: sin regla
  const first = applyRule(invoice, base, null);
  assert.deepEqual(first.learned, []);
  // La persona corrige cuenta, centro de costo, alícuota de los ítems y el tratamiento de IIBB
  const finalExtraction = { ...invoice, items: invoice.items.map((i) => ({ ...i, alicuota: 10.5 })) };
  const finalDecisions = { ...first.decisions, account: "Materia prima", costCenter: "Panadería", treatments: { ...first.decisions.treatments, "iibb:CABA": "costo" as const } };
  const l = learnFrom({ extraction: first.extraction, decisions: first.decisions }, { extraction: finalExtraction, decisions: finalDecisions }, null);
  assert.deepEqual(l.corrected.sort(), ["alicuota", "centro_costo", "cuenta", "tratamiento"]);
  assert.equal(l.rule?.account, "Materia prima");
  assert.equal(l.rule?.itemRate, 10.5);
  // Segunda factura del mismo proveedor: ya viene corregida
  const second = applyRule({ ...invoice, numero: 101 }, baseDecisions(invoice, "Compras"), l.rule);
  assert.equal(second.decisions.account, "Materia prima");
  assert.equal(second.decisions.costCenter, "Panadería");
  assert.equal(second.decisions.treatments["iibb:CABA"], "costo");
  assert.ok(second.extraction.items.every((i) => i.alicuota === 10.5));
  assert.deepEqual(second.learned.sort(), ["alicuota", "centro_costo", "cuenta", "tratamiento"]);
  // Confirmada sin cambios: cero campos corregidos
  const again = learnFrom(second, second, l.rule);
  assert.deepEqual(again.corrected, []);
  assert.equal(again.rule, null);
});
