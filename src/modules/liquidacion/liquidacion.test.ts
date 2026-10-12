import assert from "node:assert/strict";
import test from "node:test";
import { CCTS, scaleAt } from "./convenios";
import { DEFAULT_ORG, embargoLimit, enLetras, LEGAL_PARAMS, liquidarFinal, liquidarMensual, liquidarSac, liquidarVacaciones, seniorityYears, variations, type Employee, type Novelty } from "./core";

const comercio = CCTS.find((c) => c.key === "comercio")!;
const P = LEGAL_PARAMS[0];
const emp = (o: Partial<Employee> = {}): Employee => ({ id: "e1", name: "Ana", cuil: "27111111113", startDate: "2020-03-01", area: "Ventas", cctKey: "comercio", category: "VA", basicOverride: null, hours: null, affiliated: true, cbu: "0110000000000000000001", ...o });
const line = (r: { lines: { code: string; amount: number }[] }, code: string) => r.lines.find((l) => l.code === code)?.amount ?? 0;

test("hay al menos 25 convenios con categorías", () => {
  assert.ok(CCTS.length >= 25);
  for (const c of CCTS) assert.ok(c.categories.length > 0 && c.number && c.name, c.key);
  assert.equal(scaleAt(comercio, "2026-10-01", []).status, "a_validar");
  const v = scaleAt(comercio, "2026-11-15", [{ cctKey: "comercio", validFrom: "2026-11-01", status: "validada", source: "Acta", categories: [{ code: "VA", name: "Vendedor A", basic: 1_200_000 }] }]);
  assert.equal(v.categories[0].basic, 1_200_000);
  assert.equal(scaleAt(comercio, "2026-10-31", [{ cctKey: "comercio", validFrom: "2026-11-01", status: "validada", source: "Acta", categories: [] }]).status, "a_validar");
});

test("mensual de Comercio: básico, antigüedad, presentismo, aportes 17 % y contribuciones", () => {
  const r = liquidarMensual({ period: "2026-10", employee: emp(), categories: comercio.categories, novelties: [], org: DEFAULT_ORG, params: P });
  assert.equal(seniorityYears("2020-03-01", "2026-10-31"), 6);
  assert.equal(line(r, "basico"), 111_500_000);
  assert.equal(line(r, "antiguedad"), 6_690_000); // 6 % del básico
  const presentismo = Math.round(((111_500_000 + 6_690_000) * 8.33) / 100);
  assert.equal(line(r, "presentismo"), presentismo);
  assert.equal(r.rem, 111_500_000 + 6_690_000 + presentismo);
  assert.equal(line(r, "jubilacion"), Math.round((r.rem * 11) / 100));
  assert.equal(line(r, "pami") + line(r, "obra_social"), Math.round((r.rem * 3) / 100) * 2);
  assert.equal(line(r, "sindicato"), Math.round((r.rem * 2) / 100));
  assert.equal(r.net, r.rem + r.norem - r.desc);
  assert.ok(line(r, "contrib_sindical") > 0, "FAECYS");
  assert.equal(r.cost, r.rem + r.norem + r.contrib);
  assert.deepEqual(r.warnings, []);
});

test("novedades: horas extra, ausencias (pierde presentismo), vacaciones, adelanto y embargo con límite", () => {
  const n = (kind: Novelty["kind"], quantity: number | null, amount: number | null = null): Novelty => ({ employeeId: "e1", kind, quantity, amount, detail: null });
  const r = liquidarMensual({ period: "2026-10", employee: emp(), categories: comercio.categories, novelties: [n("horas_extra_50", 10), n("ausencia", 2), n("vacaciones", 7), n("adelanto", null, 100_000), n("embargo", null, 5_000_000)], org: DEFAULT_ORG, params: P });
  assert.ok(line(r, "he50") > 0);
  assert.ok(line(r, "ausencias") < 0);
  assert.equal(line(r, "presentismo"), 0);
  assert.ok(r.warnings.some((w) => w.includes("Pierde presentismo")));
  assert.ok(line(r, "vacaciones") > -line(r, "vacaciones_desc"), "las vacaciones se pagan al /25");
  assert.equal(line(r, "adelanto"), 10_000_000);
  assert.ok(line(r, "embargo") < 500_000_000 && r.warnings.some((w) => w.includes("límite legal")));
  assert.equal(embargoLimit(30_000_000, 330_000), 0);
  assert.equal(embargoLimit(50_000_000, 330_000), 1_700_000);
});

test("UOCRA por hora con fondo de cese; fuera de convenio con escala propia; ingreso a mitad de mes", () => {
  const u = liquidarMensual({ period: "2026-10", employee: emp({ cctKey: "uocra", category: "OF", startDate: "2026-01-10" }), categories: CCTS.find((c) => c.key === "uocra")!.categories, novelties: [{ employeeId: "e1", kind: "horas", quantity: 160, amount: null, detail: null }], org: DEFAULT_ORG, params: P });
  assert.equal(line(u, "basico"), 5_700 * 160 * 100);
  assert.ok(u.lines.some((l) => l.code === "fondo_cese" && l.quantity === 12));
  const own = liquidarMensual({ period: "2026-10", employee: emp({ cctKey: "fuera_convenio", category: "GER" }), categories: [], novelties: [], org: { ...DEFAULT_ORG, ownCategories: [{ code: "GER", name: "Gerente", basic: 5_000_000 }] }, params: P });
  assert.equal(line(own, "basico"), 500_000_000);
  assert.equal(line(own, "jubilacion"), Math.round((P.maxBase * 100 * 11) / 100), "con tope de la base imponible");
  const half = liquidarMensual({ period: "2026-10", employee: emp({ startDate: "2026-10-17" }), categories: comercio.categories, novelties: [], org: DEFAULT_ORG, params: P });
  assert.equal(line(half, "basico"), Math.round(111_500_000 * (15 / 30)));
  assert.ok(half.warnings.some((w) => w.includes("15 días")));
});

test("SAC: mitad de la mejor remuneración del semestre, proporcional", () => {
  const s = liquidarSac({ period: "2026-12", employee: emp(), remunerations: [100_000_000, 130_000_000, 120_000_000], org: DEFAULT_ORG, params: P });
  assert.equal(line(s, "sac"), 65_000_000);
  assert.ok(line(s, "jubilacion") > 0);
  const p = liquidarSac({ period: "2026-12", employee: emp({ startDate: "2026-10-01" }), remunerations: [120_000_000], org: DEFAULT_ORG, params: P });
  assert.equal(line(p, "sac"), Math.round(60_000_000 * (92 / 184)));
});

test("vacaciones adelantadas y liquidación final por despido", () => {
  const v = liquidarVacaciones({ period: "2026-10", employee: emp(), categories: comercio.categories, novelties: [{ employeeId: "e1", kind: "vacaciones", quantity: 14, amount: null, detail: null }], org: DEFAULT_ORG, params: P });
  assert.ok(line(v, "vacaciones") > 0 && line(v, "basico") === 0);
  const f = liquidarFinal({ endDate: "2026-10-15", reason: "despido_sin_causa", employee: emp(), categories: comercio.categories, novelties: [], org: DEFAULT_ORG, params: P, remunerations: [120_000_000], bestMonthly: 130_000_000, vacationsTaken: 0 });
  assert.equal(line(f, "indemnizacion"), 130_000_000 * 7, "6 años y 7 meses → 7");
  assert.equal(line(f, "preaviso"), 260_000_000, "más de 5 años → 2 meses");
  assert.ok(line(f, "integracion") > 0 && line(f, "vac_no_gozadas") > 0 && line(f, "sac") > 0);
  assert.ok(line(f, "jubilacion") < Math.round((130_000_000 * 11) / 100), "las indemnizaciones no llevan aportes");
  const ren = liquidarFinal({ endDate: "2026-10-15", reason: "renuncia", employee: emp(), categories: comercio.categories, novelties: [], org: DEFAULT_ORG, params: P, remunerations: [120_000_000], bestMonthly: 130_000_000, vacationsTaken: 0 });
  assert.equal(line(ren, "indemnizacion") + line(ren, "preaviso"), 0);
});

test("variaciones y número en letras", () => {
  const v = variations([{ employeeId: "a", name: "A", net: 130, cost: 200 }, { employeeId: "b", name: "B", net: 100, cost: 150 }, { employeeId: "c", name: "C", net: 90, cost: 100 }], [{ employeeId: "a", net: 100, cost: 150 }, { employeeId: "b", net: 95, cost: 140 }]);
  assert.deepEqual(v.map((x) => x.flag), ["sube", null, "nuevo"]);
  assert.equal(enLetras(123_456_750), "Pesos un millón doscientos treinta y cuatro mil quinientos sesenta y siete con 50/100");
  assert.equal(enLetras(100_000), "Pesos mil con 00/100");
  assert.equal(enLetras(2_100_000_00), "Pesos dos millones cien mil con 00/100");
});
