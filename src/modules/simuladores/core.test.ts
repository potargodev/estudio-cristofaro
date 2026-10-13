import assert from "node:assert/strict";
import { test } from "node:test";
import { markFor, modeAllowed, resolveMode } from "./core";

test("modo por organización, estudio o el de siempre", () => {
  assert.equal(resolveMode({ demo: true }), "simulador");
  assert.equal(resolveMode({ demo: false }), "real");
  assert.equal(resolveMode({ studio: "prueba", demo: false }), "prueba");
  assert.equal(resolveMode({ org: "simulador", studio: "prueba", demo: false }), "simulador");
  assert.equal(resolveMode({ org: "cualquiera", studio: null, demo: true }), "simulador");
});

test("reglas: la demo nunca real; un espacio real sin simulador fuera de staging", () => {
  assert.ok(modeAllowed("real", { demo: true, simulatorsAllowed: true }));
  assert.equal(modeAllowed("prueba", { demo: true, simulatorsAllowed: false }), null);
  assert.ok(modeAllowed("simulador", { demo: false, simulatorsAllowed: false }));
  assert.equal(modeAllowed("simulador", { demo: false, simulatorsAllowed: true }), null);
  assert.equal(markFor(["real", "prueba"]), "prueba");
  assert.equal(markFor(["real"]), null);
});
