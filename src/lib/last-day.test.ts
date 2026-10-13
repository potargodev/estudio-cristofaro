import assert from "node:assert/strict";
import test from "node:test";
import { lastDayOfMonth } from "./format";

test("último día del mes: nunca un 31 que no existe", () => {
  assert.equal(lastDayOfMonth("2026-06"), "2026-06-30");
  assert.equal(lastDayOfMonth("2026-02"), "2026-02-28");
  assert.equal(lastDayOfMonth("2028-02"), "2028-02-29");
  assert.equal(lastDayOfMonth("2026-12"), "2026-12-31");
});
