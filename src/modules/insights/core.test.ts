import assert from "node:assert/strict";
import test from "node:test";
import { change, lastMonths, monthLabel, pct, series } from "./core";

test("arma los últimos meses en orden", () => {
  assert.deepEqual(lastMonths(3, new Date("2026-03-15T12:00:00Z")), ["2026-01", "2026-02", "2026-03"]);
  assert.deepEqual(lastMonths(2, new Date("2026-01-10T12:00:00Z")), ["2025-12", "2026-01"]);
});

test("completa con ceros y calcula variaciones", () => {
  const s = series(["2026-01", "2026-02"], [{ m: "2026-02", v: "150" }]);
  assert.deepEqual(s, [{ m: "2026-01", v: 0 }, { m: "2026-02", v: 150 }]);
  assert.equal(change(s), null);
  assert.equal(change([{ v: 100 }, { v: 125 }]), 25);
  assert.equal(pct(3, 4), 75);
  assert.equal(pct(1, 0), null);
  assert.equal(monthLabel("2026-07"), "jul 26");
});
