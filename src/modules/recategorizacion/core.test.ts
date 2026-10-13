import assert from "node:assert/strict";
import test from "node:test";
import { feeOf, monthsTo, movementOf, periodFor, suggest } from "./core";

const scale = [
  { letter: "A", maxIncome: 100, maxSurfaceM2: 30, maxEnergyKw: 3000, maxRent: 50, feeServices: 10, feeGoods: 9, servicesAllowed: true },
  { letter: "B", maxIncome: 200, maxSurfaceM2: 45, maxEnergyKw: 5000, maxRent: 80, feeServices: 20, feeGoods: 18, servicesAllowed: true },
  { letter: "C", maxIncome: 300, maxSurfaceM2: 60, maxEnergyKw: 6000, maxRent: 90, feeServices: null, feeGoods: 27, servicesAllowed: false },
];
const p = { activity: "servicios" as const, surfaceM2: null, energyKw: null, rentAnnual: null };

test("recategorización: períodos y meses que cuentan", () => {
  assert.deepEqual(periodFor("2026-10-13"), { key: "2027-01", label: "enero de 2027", cutoff: "2026-12", deadline: "2027-02-05" });
  assert.equal(periodFor("2026-03-01").key, "2026-07");
  assert.equal(periodFor("2026-02-03").key, "2026-01");
  const m = monthsTo("2026-06");
  assert.equal(m.length, 12);
  assert.equal(m[0], "2025-07");
  assert.equal(m[11], "2026-06");
});

test("recategorización: categoría por ingresos y por parámetros, movimiento y exclusión", () => {
  assert.equal(suggest(scale, 150, p).letter, "B");
  assert.equal(movementOf(scale, "A", "B", false), "sube");
  assert.equal(movementOf(scale, "B", "A", false), "baja");
  assert.equal(movementOf(scale, "B", "B", false), "mantiene");
  assert.equal(movementOf(scale, null, "B", false), "sin_categoria");
  const bySurface = suggest(scale, 50, { ...p, surfaceM2: 40 });
  assert.equal(bySurface.letter, "B");
  assert.match(bySurface.reasons.join(), /parámetro físico/);
  // C no admite servicios: un prestador con 250 queda excluido; vendiendo bienes, entra en C
  assert.equal(suggest(scale, 250, p).excluded, true);
  assert.equal(suggest(scale, 250, { ...p, activity: "bienes" }).letter, "C");
  assert.match(suggest(scale, 999, p).reasons.join(), /tope/);
  assert.equal(feeOf(scale, "B", "servicios"), 20);
  assert.equal(feeOf(scale, "B", "bienes"), 18);
  assert.equal(feeOf(scale, "C", "servicios"), 27);
  assert.equal(feeOf(scale, "Z", "servicios"), null);
});
