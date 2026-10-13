import assert from "node:assert/strict";
import test from "node:test";
import { aging, closingEntries, depreciation, depreciationBetween, fiscalYearOf, fxDifference, ledger, statements, trialBalance, validateLines, type Account, type Entry } from "./core";
import { compareCodes, planFor, suggestMonetary, templateForIndustry } from "./plan";

const plan: Account[] = planFor("comercio").map((a) => ({ ...a }));
const code = (role: string) => plan.find((a) => a.role === role)!.code;
const e = (id: string, date: string, lines: [string, number, number][]): Entry => ({ id, date, number: null, concept: id, status: "registrado", source: "manual", lines: lines.map(([role, d, c]) => ({ account: role, code: code(role), debit: d, credit: c })) });

test("asiento: debe igual a haber, cada línea de un solo lado", () => {
  assert.equal(validateLines([{ account: "a", debit: 100, credit: 0 }, { account: "b", debit: 0, credit: 100 }]), 100);
  assert.throws(() => validateLines([{ account: "a", debit: 100, credit: 0 }, { account: "b", debit: 0, credit: 90 }]), /no balancea/);
  assert.throws(() => validateLines([{ account: "a", debit: 100, credit: 100 }, { account: "b", debit: 0, credit: 0 }]), /un solo lado|no a los dos/);
  assert.throws(() => validateLines([{ account: "a", debit: 100, credit: 0 }]), /dos líneas/);
});

test("sumas y saldos, estados contables que cierran y mayor", () => {
  const entries = [
    e("capital", "2026-01-02", [["banco", 1_000_000, 0], ["capital", 0, 1_000_000]]),
    e("venta", "2026-02-10", [["deudores", 121_000, 0], ["ventas", 0, 100_000], ["iva_debito", 0, 21_000]]),
    e("cobro", "2026-02-20", [["banco", 121_000, 0], ["deudores", 0, 121_000]]),
    e("gasto", "2026-03-01", [["compras", 50_000, 0], ["iva_credito", 10_500, 0], ["proveedores", 0, 60_500]]),
  ];
  const t = trialBalance(entries, plan, null, "2026-12-31");
  assert.ok(t.balanced);
  const st = statements(t.rows);
  assert.equal(st.resultados.resultado, 50_000);
  assert.equal(st.situacion.activo, 1_000_000 + 121_000 + 10_500);
  assert.ok(st.cierra, "activo = pasivo + patrimonio neto");
  const m = ledger(entries, plan, code("banco"), "2026-02-01", "2026-12-31");
  assert.equal(m.opening, 1_000_000);
  assert.equal(m.closing, 1_121_000);
  // Un asiento con una cuenta que no está en el plan no deja cerrar
  const bad = trialBalance([...entries, { ...e("x", "2026-04-01", [["banco", 1, 0], ["capital", 0, 1]]), lines: [{ account: "Cuenta inventada", debit: 1, credit: 0 }, { account: "Capital social", debit: 0, credit: 1 }] }], plan, null, "2026-12-31");
  assert.equal(statements(bad.rows).cierra, false);
});

test("cierre: refundición, cierre patrimonial y apertura", () => {
  const entries = [
    e("capital", "2026-01-02", [["banco", 1_000_000, 0], ["capital", 0, 1_000_000]]),
    e("venta", "2026-02-10", [["banco", 200_000, 0], ["ventas", 0, 200_000]]),
    e("gasto", "2026-03-01", [["compras", 80_000, 0], ["banco", 0, 80_000]]),
  ];
  const t = trialBalance(entries, plan, null, "2026-12-31");
  const c = closingEntries(t.rows, code("resultado_ejercicio"), "Resultado del ejercicio");
  validateLines(c.refund);
  validateLines(c.close);
  validateLines(c.opening);
  const res = c.refund.find((l) => l.code === code("resultado_ejercicio"))!;
  assert.equal(res.credit, 120_000, "ganancia al haber del resultado del ejercicio");
  // Después del cierre todo queda en cero
  const after = trialBalance([...entries, { ...entries[0], id: "r", lines: c.refund }, { ...entries[0], id: "c", lines: c.close }], plan, null, "2026-12-31");
  assert.ok(after.rows.every((r) => r.balance === 0));
});

test("antigüedad de saldos por vencimiento", () => {
  const a = aging(
    [
      { party: "Cliente A", doc: "1", date: "2026-09-01", due: "2026-09-10", amount: 1000 },
      { party: "Cliente A", doc: "2", date: "2026-10-01", due: "2026-10-30", amount: 500 },
      { party: "Cliente B", doc: "3", date: "2026-05-01", due: null, amount: 300 },
    ],
    "2026-10-13",
  );
  assert.deepEqual(a.totals, [500, 0, 1000, 0, 300]);
  assert.equal(a.rows[0].party, "Cliente A");
});

test("amortización lineal mensual, con baja", () => {
  const asset = { cost: 1_200_000, residual: 0, lifeMonths: 60, acquiredOn: "2026-01-15", disposedOn: null };
  assert.equal(depreciation(asset, "2026-12-31").accumulated, 240_000);
  assert.equal(depreciation(asset, "2031-12-31").accumulated, 1_200_000);
  assert.equal(depreciationBetween(asset, "2027-01-01", "2027-12-31"), 240_000);
  assert.equal(depreciation({ ...asset, disposedOn: "2026-06-30" }, "2026-12-31").months, 6);
});

test("diferencia de cambio y ejercicio de una fecha", () => {
  // US$ 100 registrados a $ 1.000 y valuados a $ 1.050: diferencia positiva de $ 5.000
  assert.deepEqual(fxDifference(10_000_000, 10_000, 1050), { valued: 10_500_000, difference: 500_000 });
  assert.deepEqual(fiscalYearOf("2026-05-10", "12-31"), { start: "2026-01-01", end: "2026-12-31" });
  assert.deepEqual(fiscalYearOf("2026-08-10", "06-30"), { start: "2026-07-01", end: "2027-06-30" });
});

test("plan: orden de códigos, plantillas por rubro y monetarias", () => {
  assert.ok(compareCodes("1.1.2", "1.1.10") < 0);
  assert.equal(templateForIndustry("Indumentaria y comercio"), "comercio");
  assert.equal(templateForIndustry(null), "general");
  assert.ok(planFor("comercio").some((a) => a.role === "mercaderias"));
  assert.equal(suggestMonetary("activo", "Rodados"), false);
  assert.equal(suggestMonetary("activo", "Deudores por ventas"), true);
});
