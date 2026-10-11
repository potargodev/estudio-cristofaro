import assert from "node:assert/strict";
import test from "node:test";
import { brandVars, checkColors, normalizeDomain, reservedHost, txtName } from "./core";

test("normaliza dominios", () => {
  assert.equal(normalizeDomain("https://Portal.MiEstudio.com.ar/ingresar"), "portal.miestudio.com.ar");
  assert.equal(normalizeDomain("clientes.estudio.com:443"), "clientes.estudio.com");
  assert.equal(normalizeDomain("no es un dominio"), null);
  assert.equal(normalizeDomain("localhost"), null);
  assert.equal(txtName("a.com"), "_faro-verificacion.a.com");
});

test("no deja usar dominios de Faro", () => {
  assert.equal(reservedHost("app.estudiocristofaro.com", ["estudiocristofaro.com"]), true);
  assert.equal(reservedHost("portal.otro.com", ["estudiocristofaro.com"]), false);
});

test("valida contraste de colores", () => {
  assert.equal(checkColors("#1c2235", "#a57c6d"), null);
  assert.match(checkColors("#f5f5f5", null)!, /muy claro/);
  assert.match(checkColors("#1c2235", "#1d2336")!, /no se distingue/);
  assert.match(checkColors("azul", null)!, /código/);
  assert.deepEqual(brandVars("#102030", null), { "--color-night": "#102030", "--color-navy-deep": "#102030" });
});
