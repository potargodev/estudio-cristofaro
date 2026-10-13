import assert from "node:assert/strict";
import { test } from "node:test";
import { INVOICE_BODY, nextAttempt, signWebhook, verifyWebhook } from "./core";

test("firma de webhooks", () => {
  const h = signWebhook("secreto", '{"a":1}', 1_700_000_000);
  assert.ok(verifyWebhook("secreto", '{"a":1}', h, 300, 1_700_000_100));
  assert.ok(!verifyWebhook("otro", '{"a":1}', h, 300, 1_700_000_100));
  assert.ok(!verifyWebhook("secreto", '{"a":2}', h, 300, 1_700_000_100));
  assert.ok(!verifyWebhook("secreto", '{"a":1}', h, 300, 1_700_001_000));
});

test("reintentos y cuerpo del comprobante", () => {
  assert.equal(nextAttempt(1, 0)!.getTime(), 60_000);
  assert.equal(nextAttempt(5, 0)!.getTime(), 720 * 60_000);
  assert.equal(nextAttempt(6, 0), null);
  const ok = INVOICE_BODY.safeParse({ cliente: { nombre: "Juan" }, items: [{ descripcion: "Clase", cantidad: 1, precio: 1000 }] });
  assert.ok(ok.success && ok.data.cliente.tipo_doc === 99 && ok.data.emitir === false);
  assert.ok(!INVOICE_BODY.safeParse({ cliente: { nombre: "Juan" }, items: [] }).success);
});
