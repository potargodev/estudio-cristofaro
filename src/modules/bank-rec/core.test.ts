import assert from "node:assert/strict";
import test from "node:test";
import { classify, matchRule, score, suggest, summarize, type Candidate, type Rule } from "./core";

test("clasifica conceptos bancarios", () => {
  assert.equal(classify({ description: "IMP. LEY 25413 S/DEB", amount: -1200 }), "impuesto");
  assert.equal(classify({ description: "Comisión mantenimiento de cuenta", amount: -50000 }), "comision");
  assert.equal(classify({ description: "PERCEPCION IVA RG 2408", amount: -3000 }), "impuesto");
  assert.equal(classify({ description: "TRANSF. RECIBIDA 30711111111 JUAN SRL", amount: 1500000 }), "cobro");
  assert.equal(classify({ description: "DEBITO AUTOMATICO EDENOR", amount: -900000 }), "pago");
  assert.equal(classify({ description: "Transferencia entre cuentas propias", amount: 100 }), "transferencia");
});

test("reglas guardadas", () => {
  const rules: Rule[] = [{ id: "r1", pattern: "seguro", sign: "debito", action: "sin_factura", label: "Seguro del auto" }];
  assert.equal(matchRule({ description: "DEB. SEGURO LA CAJA", amount: -100 }, rules)?.id, "r1");
  assert.equal(matchRule({ description: "SEGURO devolución", amount: 100 }, rules), null);
});

const inv: Candidate = { id: "f1", type: "emitido", date: "2026-10-01", total: 1500000, counterparty: "Juan Pérez SRL", cuit: "30711111111", number: "00002-00000045" };

test("puntaje: importe, fecha, CUIT y número", () => {
  const s = score({ id: "m1", date: "2026-10-03", description: "TRANSF. RECIBIDA 30711111111 FC 45", amount: 1500000 }, inv)!;
  assert.ok(s.score >= 0.9, String(s.score));
  assert.ok(s.reasons.includes("CUIT en el detalle"));
  assert.equal(score({ id: "m2", date: "2026-10-03", description: "PAGO", amount: -1500000 }, inv), null, "un débito no cruza con una factura emitida");
  assert.equal(score({ id: "m3", date: "2026-10-03", description: "X", amount: 1000000 }, inv), null, "importe distinto");
  assert.ok(score({ id: "m4", date: "2026-10-20", description: "TRANSFERENCIA JUAN PEREZ", amount: 1500000 }, inv)!.reasons.includes("nombre en el detalle"));
});

test("sugerencias sin repetir comprobante", () => {
  const movs = [
    { id: "a", date: "2026-10-02", description: "TRANSF 30711111111", amount: 1500000 },
    { id: "b", date: "2026-10-25", description: "TRANSF", amount: 1500000 },
  ];
  const s = suggest(movs, [inv]);
  assert.equal(s.get("a")?.candidateId, "f1");
  assert.equal(s.has("b"), false);
});

test("resumen de la conciliación", () => {
  const s = summarize(
    [
      { amount: 1500000, cls: "cobro", status: "conciliado" },
      { amount: -1200, cls: "impuesto", status: "sin_conciliar" },
      { amount: -50000, cls: "comision", status: "sin_conciliar" },
      { amount: -90000, cls: "pago", status: "sin_factura" },
      { amount: -7000, cls: "pago", status: "sin_conciliar" },
    ],
    [
      { id: "f1", date: "2026-10-01", matched: true },
      { id: "f2", date: "2026-10-10", matched: false },
      { id: "f3", date: "2026-10-29", matched: false },
    ],
    "2026-10-31",
  );
  assert.deepEqual(s, { pagadas: 1, pendientes: 1, pagosSinFactura: 1, comisiones: 50000, impuestos: 1200, enTransito: 1, sinConciliar: 1 });
});
