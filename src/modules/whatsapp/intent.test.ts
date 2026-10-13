import assert from "node:assert/strict";
import { test } from "node:test";
import { amountIn, parseIntent } from "./intent";

test("importes en centavos", () => {
  assert.equal(amountIn("$25.000"), 2500000);
  assert.equal(amountIn("25000"), 2500000);
  assert.equal(amountIn("25 mil"), 2500000);
  assert.equal(amountIn("25k"), 2500000);
  assert.equal(amountIn("1,5 millones"), 150000000);
  assert.equal(amountIn("12.500,50"), 1250050);
  assert.equal(amountIn("hola"), null);
});

test("facturar por texto o audio", () => {
  const f = parseIntent("Facturá 25 mil a Juan Pérez por clases de inglés");
  assert.deepEqual(f, { kind: "factura", amount: 2500000, customer: "Juan Perez", doc: null, description: "Clases de ingles" });
  const g = parseIntent("haceme una factura de $120.000 a Gran Empresa SA cuit 30-55566677-8 por honorarios de septiembre");
  assert.equal(g.kind, "factura");
  if (g.kind === "factura") {
    assert.equal(g.amount, 12000000);
    assert.equal(g.doc, "30555666778");
    assert.equal(g.description, "Honorarios de septiembre");
  }
  const h = parseIntent("facturame 8000");
  assert.ok(h.kind === "factura" && h.customer === null && h.description === "Servicios");
});

test("gastos, consultas, confirmaciones y avisos", () => {
  assert.deepEqual(parseIntent("gasté 3500 en nafta"), { kind: "gasto", amount: 350000, description: "Nafta" });
  assert.deepEqual(parseIntent("¿Cuánto facturé este mes?"), { kind: "consulta", topic: "facturado" });
  assert.deepEqual(parseIntent("qué vencimientos tengo"), { kind: "consulta", topic: "vencimientos" });
  assert.deepEqual(parseIntent("cómo vengo con el monotributo"), { kind: "consulta", topic: "monotributo" });
  assert.deepEqual(parseIntent("Sí"), { kind: "si" });
  assert.deepEqual(parseIntent("no"), { kind: "no" });
  assert.deepEqual(parseIntent("BAJA"), { kind: "baja" });
  assert.deepEqual(parseIntent("alta"), { kind: "alta" });
  assert.deepEqual(parseIntent("hola, les mando el resumen del banco"), { kind: "otro" });
});
