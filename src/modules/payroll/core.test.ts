import assert from "node:assert/strict";
import test from "node:test";
import { cuilFromName, cuilsIn, deviceOf, groupPages, periodIn, seal, signReminderDue, validCuil } from "./core";

test("CUIL", () => {
  assert.equal(validCuil("20-30405060-9"), true);
  assert.equal(validCuil("20-30405060-8"), false);
  assert.deepEqual(cuilsIn("Empleador 30-71111111-9 · Empleado: PÉREZ JUAN CUIL 20-30405060-9"), ["20304050609"]);
  assert.equal(cuilFromName("recibo_20304050609_2026-09.pdf"), "20304050609");
});

test("división de un PDF único por CUIL", () => {
  const pages = ["RECIBO CUIL 20-30405060-9 Período 09/2026", "continúa", "RECIBO CUIL 27-28555666-5", "RECIBO 20304050609 duplicado"];
  const g = groupPages(pages);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0], { cuil: "20304050609", pages: [0, 1, 3] });
  assert.equal(g[1].pages[0], 2);
  assert.deepEqual(groupPages(["sin cuil", "CUIL 20-30405060-9"]).map((x) => x.cuil), [null, "20304050609"]);
});

test("período del recibo", () => {
  assert.equal(periodIn("Período: 9/2026"), "2026-09");
  assert.equal(periodIn("Liquidación de septiembre de 2026"), "2026-09");
  assert.equal(periodIn("Mes 2026-10"), "2026-10");
  assert.equal(periodIn("nada"), null);
});

test("sello de la firma y recordatorios", () => {
  const r = { decision: "conforme" as const, reason: null, at: "2026-10-11T12:00:00Z", ip: "1.2.3.4", userAgent: "x", documentHash: "abc", signerId: "u", signerName: "Ana" };
  assert.equal(seal(r), seal({ ...r }));
  assert.notEqual(seal(r), seal({ ...r, documentHash: "abd" }));
  const pub = new Date("2026-10-01T12:00:00Z");
  assert.equal(signReminderDue(pub, [], new Date("2026-10-03T12:00:00Z")), null);
  assert.equal(signReminderDue(pub, [], new Date("2026-10-04T12:00:00Z")), 3);
  assert.equal(signReminderDue(pub, [3], new Date("2026-10-05T12:00:00Z")), null);
  assert.equal(signReminderDue(pub, [3], new Date("2026-10-20T12:00:00Z")), 14);
  assert.equal(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604.1"), "Safari en iOS");
});
