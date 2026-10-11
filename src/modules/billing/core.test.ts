import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { addMonths, dueReminder, exitSettlement, feeFor, nextStatus, parseRef, periodPrice, refOf, verifySignature } from "./core";

test("firma de webhook de Mercado Pago", () => {
  const ts = String(Date.now());
  const v1 = createHmac("sha256", "s3cr3t").update(`id:123;request-id:abc;ts:${ts};`).digest("hex");
  assert.equal(verifySignature(`ts=${ts},v1=${v1}`, "abc", "123", "s3cr3t"), true);
  assert.equal(verifySignature(`ts=${ts},v1=${v1}`, "abc", "124", "s3cr3t"), false, "otro id");
  assert.equal(verifySignature(`ts=${ts},v1=${v1}`, "abc", "123", "otro"), false, "otro secreto");
  const old = String(Date.now() - 3600_000);
  const v1old = createHmac("sha256", "s3cr3t").update(`id:123;request-id:abc;ts:${old};`).digest("hex");
  assert.equal(verifySignature(`ts=${old},v1=${v1old}`, "abc", "123", "s3cr3t"), false, "vieja");
  assert.equal(verifySignature(null, "abc", "123", "s3cr3t"), false);
});

test("referencias", () => {
  const id = "0b3c1d2e-1111-4222-8333-444455556666";
  assert.deepEqual(parseRef(refOf({ kind: "hon", id })), { kind: "hon", id });
  assert.equal(parseRef("faro:hon:../../x"), null);
  assert.equal(parseRef("otra cosa"), null);
});

test("estado de la suscripción", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const base = { status: "activa" as const, trialEndsAt: null, currentPeriodEnd: new Date("2026-11-01T00:00:00Z"), pastDueSince: null, cancelAtPeriodEnd: false };
  assert.equal(nextStatus(base, now), "activa");
  assert.equal(nextStatus({ ...base, pastDueSince: new Date("2026-10-18T00:00:00Z") }, now), "morosa");
  assert.equal(nextStatus({ ...base, pastDueSince: new Date("2026-10-01T00:00:00Z") }, now), "suspendida");
  assert.equal(nextStatus({ ...base, status: "prueba", trialEndsAt: new Date("2026-10-19T00:00:00Z") }, now), "suspendida");
  assert.equal(nextStatus({ ...base, cancelAtPeriodEnd: true }, new Date("2026-11-02T00:00:00Z")), "cancelada");
});

test("fechas y precios", () => {
  assert.equal(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(periodPrice(10, 1000, "mensual"), 1000000);
  assert.equal(periodPrice(10, 1000, "anual"), 10000000);
});

test("ajuste de abonos", () => {
  assert.equal(feeFor(100000, { kind: "porcentaje", everyMonths: 3, percent: 10 }, "2026-01", "2026-03"), 100000);
  assert.equal(feeFor(100000, { kind: "porcentaje", everyMonths: 3, percent: 10 }, "2026-01", "2026-04"), 110000);
  assert.equal(feeFor(100000, { kind: "porcentaje", everyMonths: 3, percent: 10 }, "2026-01", "2026-07"), 121000);
  const ipc = (m: string) => ({ "2025-12": 100, "2026-03": 105, "2026-06": 112 })[m] ?? null;
  assert.equal(feeFor(100000, { kind: "ipc", everyMonths: 3 }, "2026-01", "2026-04", ipc), 105000);
  assert.equal(feeFor(100000, { kind: "ipc", everyMonths: 3 }, "2026-01", "2026-07", ipc), 112000);
});

test("recordatorios escalonados", () => {
  assert.equal(dueReminder("2026-10-10", [], "2026-10-06"), null);
  assert.equal(dueReminder("2026-10-10", [], "2026-10-07"), -3);
  assert.equal(dueReminder("2026-10-10", [-3], "2026-10-10"), 0);
  assert.equal(dueReminder("2026-10-10", [-3, 0], "2026-10-12"), null);
  assert.equal(dueReminder("2026-10-10", [-3], "2026-10-20"), 7, "solo el más reciente");
});

test("salida de una flota sin deuda solidaria", () => {
  assert.deepEqual(exitSettlement({ monthlyShare: 30000, unpaid: 30000, paidAhead: 0, daysUsed: 15, daysInMonth: 30 }), { proportional: 15000, total: 45000, refund: 0, due: 45000 });
  assert.deepEqual(exitSettlement({ monthlyShare: 30000, unpaid: 0, paidAhead: 30000, daysUsed: 10, daysInMonth: 30 }), { proportional: 10000, total: -20000, refund: 20000, due: 0 });
});
