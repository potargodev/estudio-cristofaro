import assert from "node:assert/strict";
import test from "node:test";
import { affects, asProfile, DEFAULT_PROFILE, LEGEND_RULES, legendsFor, type LegendInvoice } from "./catalog";

const inv = (o: Partial<LegendInvoice> = {}): LegendInvoice => ({ letter: "B", kind: "factura", issuerIva: "responsable_inscripto", customerIva: "consumidor_final", issueDate: "2026-10-12", net: 100000, iva: 21000, total: 121000, ...o });
const keys = (l: { key: string }[]) => l.map((x) => x.key);

test("transparencia fiscal: RI a consumidor final, con el IVA contenido", () => {
  const l = legendsFor(inv(), DEFAULT_PROFILE, LEGEND_RULES);
  assert.deepEqual(keys(l), ["transparencia_fiscal"]);
  assert.equal(l[0].lines[0], "Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)");
  assert.match(l[0].lines[1], /IVA Contenido: \$ 21\.000,00/);
  assert.match(l[0].lines[2], /Otros Impuestos Nacionales Indirectos: \$ 0,00/);
  assert.equal(legendsFor(inv({ customerIva: "responsable_inscripto", letter: "A" }), DEFAULT_PROFILE, LEGEND_RULES).length, 0);
  assert.equal(legendsFor(inv({ issueDate: "2025-03-31" }), DEFAULT_PROFILE, LEGEND_RULES).length, 0, "antes de la vigencia no va");
});

test("ISIB CABA: alícuota, convenio, promoción y exención; el Simplificado no lleva", () => {
  const local = asProfile({ isibCaba: "local", isibAlicuota: 3 });
  assert.deepEqual(legendsFor(inv(), local, LEGEND_RULES).find((x) => x.key === "isib_caba_alicuota")?.lines, ["ALÍCUOTA ISIB CABA 3,00%"]);
  const cm = asProfile({ isibCaba: "convenio", isibAlicuota: 1.5, isibPromocion: true });
  assert.deepEqual(keys(legendsFor(inv(), cm, LEGEND_RULES)), ["transparencia_fiscal", "isib_caba_alicuota", "isib_caba_convenio", "isib_caba_promocion"]);
  const ex = asProfile({ isibCaba: "local", isibExento: true });
  assert.deepEqual(keys(legendsFor(inv(), ex, LEGEND_RULES)), ["transparencia_fiscal", "isib_caba_exenta"]);
  const simp = asProfile({ isibCaba: "simplificado", isibAlicuota: 3 });
  assert.deepEqual(keys(legendsFor(inv({ letter: "C", issuerIva: "monotributo", iva: 0 }), simp, LEGEND_RULES)), ["monotributo_c"]);
  assert.equal(legendsFor(inv({ customerIva: "responsable_inscripto", letter: "A" }), local, LEGEND_RULES).length, 0, "solo a consumidor final");
  assert.equal(legendsFor(inv({ issueDate: "2026-09-30" }), local, LEGEND_RULES).some((x) => x.key.startsWith("isib")), false, "antes del 01/10/2026 no va");
});

test("factura A sujeta a retención y reglas derogadas o inactivas", () => {
  const p = asProfile({ sujetaRetencion: true });
  assert.deepEqual(keys(legendsFor(inv({ letter: "A", customerIva: "responsable_inscripto" }), p, LEGEND_RULES)), ["sujeta_retencion"]);
  const derogada = LEGEND_RULES.map((r) => (r.key === "sujeta_retencion" ? { ...r, status: "derogada" as const } : r));
  assert.equal(legendsFor(inv({ letter: "A", customerIva: "responsable_inscripto" }), p, derogada).length, 0);
  const hasta = LEGEND_RULES.map((r) => (r.key === "transparencia_fiscal" ? { ...r, validTo: "2026-06-30" } : r));
  assert.equal(legendsFor(inv(), DEFAULT_PROFILE, hasta).length, 0);
});

test("perfil: valores fuera de rango se descartan; a quién afecta cada regla", () => {
  const p = asProfile({ isibCaba: "otra", isibAlicuota: 99, otrosNacionalesPct: -3, sujetaRetencion: "si" });
  assert.deepEqual(p, DEFAULT_PROFILE);
  const otros = legendsFor(inv(), asProfile({ otrosNacionalesPct: 8 }), LEGEND_RULES)[0].lines[2];
  assert.match(otros, /\$ 8\.000,00/);
  const caba = LEGEND_RULES.find((r) => r.key === "isib_caba_alicuota")!;
  assert.equal(affects(caba, asProfile({ isibCaba: "convenio", isibAlicuota: 2 }), "responsable_inscripto"), true);
  assert.equal(affects(caba, DEFAULT_PROFILE, "responsable_inscripto"), false);
  assert.equal(affects(LEGEND_RULES[0], DEFAULT_PROFILE, "monotributo"), false);
});
