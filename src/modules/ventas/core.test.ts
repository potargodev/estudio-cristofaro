import assert from "node:assert/strict";
import { test } from "node:test";
import { buyerOf, creditNoteFor, dayOf, itemsOf, orderTotal } from "./core";

test("total, comprador e ítems de un pedido", () => {
  assert.equal(orderTotal([{ title: "Yerba", qty: 2, price: 1500.5 }, { title: "Mate", qty: 1, price: 999 }]), 4000);
  assert.deepEqual(buyerOf({ buyer: { name: "Gran Empresa SA", doc_number: "30-55566677-8", iva_condition: "responsable_inscripto" } }), { docType: 80, docNumber: "30555666778", name: "Gran Empresa SA", ivaCondition: "responsable_inscripto" });
  assert.equal(buyerOf({ buyer: { doc_number: "20123456" } }).docType, 96);
  assert.deepEqual(buyerOf(null), { docType: 99, docNumber: "0", name: "Consumidor final", ivaCondition: "consumidor_final" });
  assert.equal(itemsOf([{ title: "Yerba", qty: 1, price: 1210 }], true)[0].unitPrice, 1000);
  assert.equal(itemsOf([{ title: "Yerba", qty: 1, price: 1210 }], false)[0].unitPrice, 1210);
});

test("nota de crédito de la misma letra y día en Buenos Aires", () => {
  assert.equal(creditNoteFor(1), 3);
  assert.equal(creditNoteFor(6), 8);
  assert.equal(creditNoteFor(11), 13);
  assert.equal(dayOf(new Date("2026-10-13T02:00:00Z")), "2026-10-12");
});
