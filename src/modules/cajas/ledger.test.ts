import assert from "node:assert/strict";
import { test } from "node:test";
import { breakdown, type LedgerEntry } from "./ledger";

const cena = (mode: "registrar" | "dividir", paid = false): LedgerEntry => ({
  id: "e1",
  kind: "gasto",
  amount: 300_000,
  paidBy: "ana",
  mode,
  confirmed: true,
  shares: mode === "dividir" ? [{ userId: "ana", amount: 150_000, paid: true }, { userId: "beto", amount: 150_000, paid }] : [],
});

test("cena de $3.000, solo registrar: Ana puso $3.000 y nadie le debe nada", () => {
  const b = breakdown([cena("registrar")], ["ana", "beto"]);
  assert.equal(b.members.find((m) => m.userId === "ana")!.put, 300_000);
  assert.deepEqual(b.debts, []);
  assert.equal(b.even, false);
});

test("cena de $3.000, dividir: Beto le debe $1.500 a Ana hasta que confirme", () => {
  const b = breakdown([cena("dividir")], ["ana", "beto"]);
  assert.deepEqual(b.debts, [{ from: "beto", to: "ana", amount: 150_000 }]);
  assert.equal(b.members.find((m) => m.userId === "beto")!.owes, 150_000);
  assert.equal(b.members.find((m) => m.userId === "beto")!.put, 0);
});

test("cuando Beto confirma que pagó, cuenta para él y quedan parejos", () => {
  const b = breakdown([cena("dividir", true)], ["ana", "beto"]);
  assert.deepEqual(b.debts, []);
  assert.equal(b.members.find((m) => m.userId === "beto")!.put, 150_000);
  assert.equal(b.members.find((m) => m.userId === "ana")!.put, 150_000);
  assert.equal(b.even, true);
});

test("lo que cargó otra persona no cuenta hasta que quien pagó lo confirma", () => {
  const b = breakdown([{ ...cena("registrar"), confirmed: false }], ["ana", "beto"]);
  assert.equal(b.members.find((m) => m.userId === "ana")!.put, 0);
  assert.equal(b.members.find((m) => m.userId === "ana")!.pendingConfirm, 300_000);
});

test("aportes parejos entre hermanos para los abuelos", () => {
  const e = (id: string, who: string, amount: number): LedgerEntry => ({ id, kind: "gasto", amount, paidBy: who, mode: "registrar", confirmed: true, shares: [] });
  const b = breakdown([e("1", "a", 1_000_000), e("2", "b", 1_000_000), e("3", "c", 1_005_000)], ["a", "b", "c"]);
  assert.equal(b.even, true);
});
