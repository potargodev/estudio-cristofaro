import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell, toCsv } from "./csv";

test("neutraliza fórmulas y escapa", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"\"x\"\")".replace(/^/, '"') + '"');
  assert.equal(csvCell("@SUMA(A1)"), "'@SUMA(A1)");
  assert.equal(csvCell("-12.50"), "-12.50");
  assert.equal(csvCell(-3.5, { decimalComma: true }), "-3,5");
  assert.equal(csvCell("a;b"), '"a;b"');
  assert.equal(csvCell("a,b", { sep: "," }), '"a,b"');
  assert.equal(toCsv([["a", 1], ["b", null]], { bom: true }), "﻿a;1\r\nb;");
});
