import { test } from "node:test";
import assert from "node:assert/strict";
import { last12Months, nextRecategorization, SEED_SCALE, semaforo, simulateRI } from "./monotributo";

const today = new Date(2026, 9, 11);
const scale = SEED_SCALE.categories;

test("12 meses móviles con el actual", () => {
  const m = last12Months(today);
  assert.equal(m.length, 12);
  assert.equal(m[0], "2025-11");
  assert.equal(m[11], "2026-10");
});

test("verde, con lo que falta", () => {
  const s = semaforo({ byMonth: { "2026-10": 1000000 }, category: "D", scale, today });
  assert.equal(s.light, "verde");
  assert.equal(s.remaining, 19926340.1 - 1000000);
  assert.equal(s.suggested, "A");
});

test("amarillo y rojo por cercanía al tope", () => {
  const per = (total: number) => Object.fromEntries(last12Months(today).map((m) => [m, total / 12]));
  assert.equal(semaforo({ byMonth: per(19926340.1 * 0.8), category: "D", scale, today }).light, "amarillo");
  assert.equal(semaforo({ byMonth: per(19926340.1 * 0.95), category: "D", scale, today }).light, "rojo");
});

test("pasarse sugiere la categoría siguiente", () => {
  const s = semaforo({ byMonth: { "2026-09": 21000000 }, category: "D", scale, today });
  assert.equal(s.suggested, "E");
  assert.match(s.message, /superaste el tope/);
});

test("exclusión por encima de la K", () => {
  const s = semaforo({ byMonth: { "2026-09": 90000000 }, category: "K", scale, today });
  assert.equal(s.light, "excluido");
  assert.equal(s.excluded, true);
});

test("recategorización en enero y julio", () => {
  assert.equal(nextRecategorization(new Date(2026, 9, 11)).label, "enero de 2027");
  assert.equal(nextRecategorization(new Date(2026, 3, 1)).label, "julio de 2026");
  assert.equal(nextRecategorization(new Date(2027, 0, 10)).cutoff, "2026-12-31");
});

test("simulación de responsable inscripto", () => {
  const r = simulateRI({ annualIncome: 12000000, annualPurchasesWithIva: 1210000, monthlyFee: null });
  assert.equal(r.debit, 210000);
  assert.equal(r.credit, 17500);
  assert.equal(r.ivaMonthly, 192500);
});
