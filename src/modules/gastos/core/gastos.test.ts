// Tests del núcleo de gastos compartidos: npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { balancesInBase, computeBalances, directDebts, simplifyDebts, type LedgerExpense, type Transfer } from "./balances";
import { allocate, checkPayers, parseAmount, splitExpense, SplitError } from "./split";

const sum = (r: Record<string, number>) => Object.values(r).reduce((s, v) => s + v, 0);

/** Semilla fija: los casos aleatorios son siempre los mismos */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("reparto en centavos", () => {
  it("iguales: $100 entre 3 reparte el centavo que sobra de forma determinística", () => {
    const r = splitExpense(10000, { method: "iguales", members: ["c", "a", "b"] });
    assert.deepEqual(r, { a: 3334, b: 3333, c: 3333 });
    // El orden de carga no cambia el resultado
    assert.deepEqual(splitExpense(10000, { method: "iguales", members: ["b", "c", "a"] }), r);
  });
  it("iguales: 2 centavos entre 3 personas", () => {
    assert.deepEqual(splitExpense(2, { method: "iguales", members: ["a", "b", "c"] }), { a: 1, b: 1, c: 0 });
  });
  it("iguales: miles de casos siempre suman exacto", () => {
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      const total = Math.floor(r() * 10_000_000) + 1;
      const n = Math.floor(r() * 9) + 2;
      const parts = splitExpense(total, { method: "iguales", members: Array.from({ length: n }, (_, j) => `m${j}`) });
      assert.equal(sum(parts), total);
      const vals = Object.values(parts);
      assert.ok(Math.max(...vals) - Math.min(...vals) <= 1, "nadie paga más de un centavo de diferencia");
    }
  });
  it("porcentaje: 33,33 / 33,33 / 33,34 de $1.000,01", () => {
    const r = splitExpense(100001, { method: "porcentaje", percents: { a: 33.33, b: 33.33, c: 33.34 } });
    assert.equal(sum(r), 100001);
    assert.deepEqual(r, { a: 33330, b: 33330, c: 33341 });
  });
  it("porcentaje: si no suma 100 da error claro", () => {
    assert.throws(() => splitExpense(1000, { method: "porcentaje", percents: { a: 50, b: 40 } }), SplitError);
  });
  it("partes: 2:1 de $100", () => {
    assert.deepEqual(splitExpense(10000, { method: "partes", parts: { a: 2, b: 1 } }), { a: 6667, b: 3333 });
  });
  it("partes: con alguien en 0 no le toca nada", () => {
    assert.deepEqual(splitExpense(1000, { method: "partes", parts: { a: 1, b: 0, c: 1 } }), { a: 500, b: 0, c: 500 });
  });
  it("montos exactos: tienen que cerrar con el total", () => {
    assert.deepEqual(splitExpense(5000, { method: "montos", amounts: { a: 1500, b: 3500 } }), { a: 1500, b: 3500 });
    assert.throws(() => splitExpense(5000, { method: "montos", amounts: { a: 1500, b: 3000 } }), SplitError);
  });
  it("por ítem: cada ítem entre los suyos y la propina en proporción", () => {
    // Pizza $3.000 (a, b, c), cerveza $1.000 (a), propina $400
    const r = splitExpense(440000 / 100, {
      method: "items",
      items: [
        { description: "Pizza", amount: 3000, members: ["a", "b", "c"] },
        { description: "Cerveza", amount: 1000, members: ["a"] },
      ],
    });
    assert.equal(sum(r), 4400);
    assert.deepEqual(r, { a: 2200, b: 1100, c: 1100 });
  });
  it("por ítem: los ítems no pueden superar el total", () => {
    assert.throws(() => splitExpense(1000, { method: "items", items: [{ description: "x", amount: 2000, members: ["a"] }] }), SplitError);
  });
  it("reintegros (montos negativos) también cierran", () => {
    const r = splitExpense(-1000, { method: "iguales", members: ["a", "b", "c"] });
    assert.equal(sum(r), -1000);
  });
  it("allocate con pesos decimales", () => {
    const r = allocate(1, { a: 0.5, b: 0.5 });
    assert.deepEqual(r, { a: 1, b: 0 });
  });
  it("pagadores: tienen que sumar el total", () => {
    checkPayers(4800000, { ana: 3000000, juan: 1800000 });
    assert.throws(() => checkPayers(4800000, { ana: 3000000 }), SplitError);
  });
  it("parseAmount entiende el formato argentino", () => {
    assert.equal(parseAmount("48.000"), 4800000);
    assert.equal(parseAmount("$ 48.000,50"), 4800050);
    assert.equal(parseAmount("1234.5"), 123450);
    assert.equal(parseAmount("12,3"), 1230);
    assert.equal(parseAmount("abc"), null);
  });
});

/** Mínimo de transferencias por fuerza bruta: n − (máximos subconjuntos disjuntos que suman cero) */
function bruteMin(values: number[]): number {
  const nz = values.filter((v) => v !== 0);
  let best = 0;
  const rec = (rest: number[], groups: number) => {
    if (!rest.length) {
      best = Math.max(best, groups);
      return;
    }
    const [first, ...others] = rest;
    const n = others.length;
    for (let mask = 0; mask < 1 << n; mask++) {
      let s = first;
      for (let i = 0; i < n; i++) if (mask & (1 << i)) s += others[i];
      if (s !== 0) continue;
      rec(others.filter((_, i) => !(mask & (1 << i))), groups + 1);
    }
  };
  rec(nz, 0);
  return nz.length - best;
}

function applies(balance: Record<string, number>, transfers: Transfer[]) {
  const b = { ...balance };
  for (const t of transfers) {
    assert.ok(t.amount > 0, "cada transferencia es positiva");
    b[t.from] = (b[t.from] ?? 0) + t.amount;
    b[t.to] = (b[t.to] ?? 0) - t.amount;
  }
  return Object.values(b).every((v) => v === 0);
}

describe("deudas simplificadas", () => {
  it("el ejemplo de la landing: 2 transferencias", () => {
    const b = computeBalances(
      [
        { id: "1", currency: "ARS", fxRate: 1, payers: { ana: 4800000 }, shares: splitExpense(4800000, { method: "iguales", members: ["ana", "juan", "lucia"] }) },
        { id: "2", currency: "ARS", fxRate: 1, payers: { juan: 3000000 }, shares: splitExpense(3000000, { method: "iguales", members: ["ana", "juan", "lucia"] }) },
      ],
      [],
    ).ARS;
    assert.deepEqual(b, { ana: 2200000, juan: 400000, lucia: -2600000 });
    const t = simplifyDebts(b);
    assert.deepEqual(t, [
      { from: "lucia", to: "ana", amount: 2200000 },
      { from: "lucia", to: "juan", amount: 400000 },
    ]);
  });
  it("de 2 a 10 personas: siempre salda todo con el mínimo de transferencias", () => {
    const r = rng(42);
    for (let n = 2; n <= 10; n++) {
      for (let c = 0; c < (n <= 8 ? 60 : 12); c++) {
        // Saldos con montos chicos repetidos para que aparezcan subconjuntos que suman cero
        const vals = Array.from({ length: n - 1 }, () => (Math.floor(r() * 7) - 3) * 1000);
        vals.push(-vals.reduce((s, v) => s + v, 0));
        const balance = Object.fromEntries(vals.map((v, i) => [`p${String(i).padStart(2, "0")}`, v]));
        const t = simplifyDebts(balance);
        assert.ok(applies(balance, t), `n=${n} salda todo`);
        assert.equal(t.length, bruteMin(vals), `n=${n} caso ${c}: ${JSON.stringify(vals)}`);
      }
    }
  });
  it("varios pagadores en un mismo gasto", () => {
    const shares = splitExpense(9000, { method: "iguales", members: ["a", "b", "c"] });
    const b = computeBalances([{ id: "1", currency: "ARS", fxRate: 1, payers: { a: 6000, b: 3000 }, shares }], []).ARS;
    assert.deepEqual(b, { a: 3000, c: -3000 });
    assert.deepEqual(simplifyDebts(b), [{ from: "c", to: "a", amount: 3000 }]);
  });
  it("los pagos registrados descuentan la deuda", () => {
    const shares = splitExpense(9000, { method: "iguales", members: ["a", "b", "c"] });
    const b = computeBalances([{ id: "1", currency: "ARS", fxRate: 1, payers: { a: 9000 }, shares }], [{ currency: "ARS", from: "b", to: "a", amount: 3000 }]).ARS;
    assert.deepEqual(b, { a: 3000, c: -3000 });
  });
  it("monedas mixtas: saldos separados por moneda y conversión a la base", () => {
    const exp: LedgerExpense[] = [
      // $120.000 en pesos (centavos) y USD 100 a $1.200
      { id: "1", currency: "ARS", fxRate: 1, payers: { a: 12000000 }, shares: splitExpense(12000000, { method: "iguales", members: ["a", "b"] }) },
      { id: "2", currency: "USD", fxRate: 1200, payers: { b: 10000 }, shares: splitExpense(10000, { method: "iguales", members: ["a", "b"] }) },
    ];
    const per = computeBalances(exp, []);
    assert.deepEqual(per, { ARS: { a: 6000000, b: -6000000 }, USD: { a: -5000, b: 5000 } });
    // En pesos: USD 50 × 1200 = $60.000 → quedan a mano
    const base = balancesInBase(exp, [], "ARS");
    assert.deepEqual(base.balances, {});
    assert.equal(base.unconverted, 0);
  });
  it("una moneda sin cotización queda aparte al convertir", () => {
    const exp: LedgerExpense[] = [{ id: "1", currency: "EUR", fxRate: null, payers: { a: 1000 }, shares: { a: 500, b: 500 } }];
    const base = balancesInBase(exp, [], "ARS");
    assert.equal(base.unconverted, 1);
    assert.deepEqual(base.balances.EUR, { a: 500, b: -500 });
  });
  it("deudas directas (sin simplificar) netean por par", () => {
    const e: LedgerExpense[] = [
      { id: "1", currency: "ARS", fxRate: 1, payers: { a: 3000 }, shares: { a: 1000, b: 1000, c: 1000 } },
      { id: "2", currency: "ARS", fxRate: 1, payers: { b: 3000 }, shares: { a: 1000, b: 1000, c: 1000 } },
    ];
    const d = directDebts(e, [], "ARS");
    assert.deepEqual(d, [
      { from: "c", to: "a", amount: 1000 },
      { from: "c", to: "b", amount: 1000 },
    ]);
    // a y b se deben lo mismo: se cancelan
    assert.ok(!d.some((t) => (t.from === "a" && t.to === "b") || (t.from === "b" && t.to === "a")));
  });
  it("más de 16 personas usa el emparejamiento voraz y salda igual", () => {
    const vals = Array.from({ length: 19 }, (_, i) => (i % 2 ? 1 : -1) * (i + 1) * 100);
    vals.push(-vals.reduce((s, v) => s + v, 0));
    const balance = Object.fromEntries(vals.map((v, i) => [`p${i}`, v]));
    const t = simplifyDebts(balance);
    assert.ok(applies(balance, t));
    assert.ok(t.length <= vals.filter((v) => v).length - 1);
  });
});
