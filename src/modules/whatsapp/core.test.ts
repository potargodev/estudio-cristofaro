import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { advances, maskPhone, normalizePhone, paramCount, parseWebhook, renderTemplate, verifySignature } from "./core";

test("normaliza teléfonos argentinos", () => {
  assert.equal(normalizePhone("+54 9 11 2233-4455"), "5491122334455");
  assert.equal(normalizePhone("011 15 2233-4455"), "5491122334455");
  assert.equal(normalizePhone("1122334455"), "5491122334455");
  assert.equal(normalizePhone("0341 15 555-1234"), "5493415551234");
  assert.equal(normalizePhone("123"), null);
  assert.equal(maskPhone("5491122334455"), "+54 9 11 ••••-4455");
});

test("verifica la firma de Meta", () => {
  const raw = JSON.stringify({ a: 1 });
  const sig = "sha256=" + createHmac("sha256", "secreto").update(raw).digest("hex");
  assert.equal(verifySignature("secreto", raw, sig), true);
  assert.equal(verifySignature("otro", raw, sig), false);
  assert.equal(verifySignature("secreto", raw, null), false);
});

test("desarma el webhook", () => {
  const body = {
    entry: [{ changes: [{ value: { metadata: { phone_number_id: "PN1" }, contacts: [{ wa_id: "549111", profile: { name: "Ana" } }], messages: [{ id: "w1", from: "549111", type: "image", image: { id: "M1", mime_type: "image/jpeg", caption: "ticket" } }, { id: "w2", from: "549111", type: "text", text: { body: "hola" } }], statuses: [{ id: "o1", status: "read" }] } }] }],
  };
  const r = parseWebhook(body);
  assert.equal(r.messages.length, 2);
  assert.deepEqual([r.messages[0].type, r.messages[0].mediaId, r.messages[0].name, r.messages[0].phoneNumberId], ["imagen", "M1", "Ana", "PN1"]);
  assert.equal(r.messages[1].text, "hola");
  assert.deepEqual(r.statuses, [{ id: "o1", status: "leido", error: null }]);
});

test("plantillas y estados", () => {
  assert.equal(paramCount("Hola {{1}}: {{2}} y {{1}}"), 2);
  assert.equal(renderTemplate("Hola {{1}}: {{2}}", ["Ana", "vence IVA"]), "Hola Ana: vence IVA");
  assert.equal(advances("enviado", "leido"), true);
  assert.equal(advances("leido", "entregado"), false);
});
