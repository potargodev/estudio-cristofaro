import assert from "node:assert/strict";
import test from "node:test";
import { adjustmentLines, allowedDiff, classify, matchRule, score, suggest, suggestGroups, summarize, type Candidate, type Rule, taxBreakdown, taxKind } from "./core";

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

// §2.q etapa 3: tolerancias, grupos y asiento de ajuste

const doc = (id: string, total: number, date: string, counterparty = "Distribuidora Oeste SA"): Candidate => ({ id, type: "recibido", date, total, counterparty, cuit: "30709998885", number: null });

test("tolerancia fija y por porcentaje, y fecha", () => {
  const t = { days: 5, kind: "fijo" as const, value: 20 };
  assert.equal(allowedDiff(1000000, t), 2000);
  assert.equal(allowedDiff(1000000, { days: 5, kind: "porcentaje", value: 1 }), 10000);
  const c = doc("d1", 1000000, "2026-10-01", "Papelera Sur");
  const near = score({ id: "m", date: "2026-10-03", description: "PAGO PAPELERA SUR", amount: -1001500 }, c, t)!;
  assert.ok(near && near.reasons.some((r) => r.includes("dentro de la tolerancia")));
  assert.equal(score({ id: "m", date: "2026-10-03", description: "PAGO PAPELERA SUR", amount: -1005000 }, c, t), null, "fuera de la tolerancia de monto");
  assert.equal(score({ id: "m", date: "2026-10-12", description: "PAGO PAPELERA SUR", amount: -1000000 }, c, t), null, "fuera de la tolerancia de fecha");
});

test("uno con muchos y muchos con uno", () => {
  const groups = suggestGroups(
    [
      { id: "pago", date: "2026-10-10", description: "TRANSF 30709998885 DISTRIBUIDORA OESTE", amount: -3000000 },
      { id: "p1", date: "2026-10-11", description: "TRANSF IMPRENTA NORTE 1/2", amount: -2000000 },
      { id: "p2", date: "2026-10-14", description: "TRANSF IMPRENTA NORTE 2/2", amount: -3000000 },
    ],
    [doc("a", 1000000, "2026-10-01"), doc("b", 1200000, "2026-10-03"), doc("c", 800000, "2026-10-05"), doc("x", 5000000, "2026-10-09", "Imprenta Norte SRL")],
    () => ({ days: 10, kind: "fijo", value: 10 }),
  );
  const one = groups.find((g) => g.kind === "1:N")!;
  assert.deepEqual(one.candidateIds.sort(), ["a", "b", "c"]);
  assert.equal(one.difference, 0);
  const many = groups.find((g) => g.kind === "N:1")!;
  assert.deepEqual(many.movementIds.sort(), ["p1", "p2"]);
  assert.deepEqual(many.candidateIds, ["x"]);
});

test("asiento de ajuste: redondeo o gastos, contra deudores o proveedores", () => {
  const a = { rounding: "Diferencias de redondeo", fees: "Gastos bancarios", receivable: "Deudores por ventas", payable: "Proveedores" };
  // Pagó $ 15 de más: gasto contra proveedores
  assert.deepEqual(adjustmentLines(1500, false, a), [
    { account: "Gastos bancarios", debit: 1500, credit: 0 },
    { account: "Proveedores", debit: 0, credit: 1500 },
  ]);
  // Cobró $ 0,40 de menos: redondeo contra deudores
  assert.deepEqual(adjustmentLines(-40, true, a), [
    { account: "Diferencias de redondeo", debit: 40, credit: 0 },
    { account: "Deudores por ventas", debit: 0, credit: 40 },
  ]);
  assert.deepEqual(adjustmentLines(0, true, a), []);
  const lines = adjustmentLines(-2500, false, a, "Descuentos obtenidos");
  assert.equal(lines.reduce((s, l) => s + l.debit - l.credit, 0), 0, "debe = haber");
  assert.equal(lines[1].account, "Descuentos obtenidos");
});

test("impuestos del banco: débitos y créditos, SIRCREB, percepciones, IVA de gastos y comisiones", () => {
  assert.equal(taxKind("IMP. LEY 25413 S/DEB", "impuesto"), "debitos_25413");
  assert.equal(taxKind("IMPUESTO LEY 25.413 S/CRED", "impuesto"), "creditos_25413");
  assert.equal(taxKind("RET SIRCREB IIBB", "impuesto"), "sircreb");
  assert.equal(taxKind("PERCEPCION IVA RG 2408", "impuesto"), "percepcion_iva");
  assert.equal(taxKind("PERCEPCION IIBB CABA", "impuesto"), "percepcion_iibb");
  assert.equal(taxKind("IVA S/COMISIONES", "impuesto"), "iva_gastos");
  assert.equal(taxKind("Comisión mantenimiento de cuenta", "comision"), "comision");
  assert.equal(taxKind("Transferencia recibida", "cobro"), null);
  const b = taxBreakdown([
    { description: "IMP. LEY 25413 S/DEB", amount: -1200, cls: "impuesto" },
    { description: "IMP. LEY 25413 S/CRED", amount: -1800, cls: "impuesto" },
    { description: "RET SIRCREB IIBB", amount: -900, cls: "impuesto" },
    { description: "RET SIRCREB IIBB", amount: -100, cls: "impuesto", status: "ignorado" },
    { description: "Comisión", amount: -5000, cls: "comision" },
    { description: "Cobro", amount: 100000, cls: "cobro" },
  ]);
  assert.equal(b.ley25413, 3000);
  assert.equal(b.computable, 990);
  assert.equal(b.totals.sircreb, 900);
  assert.equal(b.count, 4);
  assert.equal(b.total, 8900);
});
