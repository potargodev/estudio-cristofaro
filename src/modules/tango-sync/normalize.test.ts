import assert from "node:assert/strict";
import { test } from "node:test";
import { applyRules, normKey, suggest } from "./normalize";

test("la misma empresa cargada de cuatro formas tiene la misma clave", () => {
  const k = normKey("COTO S.A.");
  for (const v of ["Coto SA", "coto s.a", "  Cotó  "]) assert.equal(normKey(v), k);
  assert.equal(k, "coto");
});

test("sugiere un nombre estándar con la forma societaria", () => {
  const s = suggest(["COTO S.A.", "Coto SA", "coto", "Panadería La Espiga SRL", "PANADERIA LA ESPIGA", "Única"]);
  const coto = s.find((x) => x.key === "coto")!;
  assert.equal(coto.standard, "Coto S.A.");
  assert.equal(coto.count, 3);
  assert.equal(s.find((x) => x.key === "panaderia la espiga")!.standard, "Panadería la Espiga S.R.L.");
  assert.equal(s.some((x) => x.key === "unica"), false);
});

test("aplica solo las reglas aprobadas que coinciden", () => {
  assert.equal(applyRules("coto s.a", [{ raw_key: "coto", standard: "Coto S.A." }]), "Coto S.A.");
  assert.equal(applyRules("Otro Cliente", [{ raw_key: "coto", standard: "Coto S.A." }]), "Otro Cliente");
});
