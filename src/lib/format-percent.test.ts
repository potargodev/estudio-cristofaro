import assert from "node:assert/strict";
import test from "node:test";
import { formatPercent } from "./format";

test("porcentajes en formato argentino, con espacio que no se corta", () => {
  assert.equal(formatPercent(0.302), "30,2 %");
  assert.equal(formatPercent(0.5, 0), "50 %");
  assert.equal(formatPercent(251.8, 1, false), "251,8 %");
  assert.equal(formatPercent(21, 1, false), "21 %");
  assert.equal(formatPercent(1234.5, 1, false), "1.234,5 %");
});
