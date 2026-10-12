import assert from "node:assert/strict";
import test from "node:test";
import { isoWeek } from "./format";

test("semana ISO igual a la de Postgres (clave del resumen semanal)", () => {
  assert.equal(isoWeek("2026-01-01"), "2026-W01");
  assert.equal(isoWeek("2025-12-29"), "2026-W01");
  assert.equal(isoWeek("2026-10-11"), "2026-W41");
  assert.equal(isoWeek("2026-10-05"), "2026-W41");
  assert.equal(isoWeek("2027-01-03"), "2026-W53");
  assert.equal(isoWeek("2020-12-31"), "2020-W53");
});
