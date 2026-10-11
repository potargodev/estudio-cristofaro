import { test } from "node:test";
import assert from "node:assert/strict";
import { dayByCuit, deadlines } from "./calendar";

test("tramos por terminación de CUIT", () => {
  assert.equal(dayByCuit("20304050601", [18, 19, 20, 21, 22]), 18);
  assert.equal(dayByCuit("20304050609", [18, 19, 20, 21, 22]), 22);
});

test("monotributo: cuota el 20 (o hábil siguiente) y recategorización en febrero", () => {
  const list = deadlines({ cuit: "20304050609", regime: "monotributo", iibb: "simplificado", autonomos: false }, new Date(2026, 0, 2), 2);
  assert.ok(list.some((d) => d.tax === "Monotributo" && d.dueDate === "2026-01-20"));
  assert.ok(list.some((d) => d.tax.startsWith("Recategorización") && d.dueDate === "2026-02-05"));
  // 20/12/2026 es domingo: pasa al lunes
  const dic = deadlines({ cuit: "20304050609", regime: "monotributo", iibb: "simplificado", autonomos: false }, new Date(2026, 11, 1), 1);
  assert.equal(dic[0].dueDate, "2026-12-21");
});

test("responsable inscripto con IIBB local y autónomos", () => {
  const list = deadlines({ cuit: "20304050600", regime: "responsable_inscripto", iibb: "local", autonomos: true }, new Date(2026, 4, 1), 2);
  assert.ok(list.some((d) => d.tax === "IVA" && d.period === "2026-04"));
  assert.ok(list.some((d) => d.tax.startsWith("Ganancias")));
  assert.ok(list.some((d) => d.tax === "Autónomos"));
  assert.ok(list.some((d) => d.tax === "Ingresos Brutos"));
});
