import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFromMail, detectLeaks, detectRecurring, mapRows, merchantKey, mercadoPagoMapping, parseAmount, parseCsv, parseDate, realValue, rowsFromPdfText, suggestBudgets, weeklySaving, type Mov } from "./smart";

const today = new Date(2026, 9, 11, 12);
const g = (date: string, description: string, amount: number, extra: Partial<Mov> = {}): Mov => ({ kind: "gasto", amount, currency: "ARS", date, description, categoryId: null, ...extra });

test("sobres sugeridos: mediana redondeada a $1.000", () => {
  assert.deepEqual(suggestBudgets({ a: [12345600, 15000000, 13000000], b: [0, 0], c: [50000] }), { a: 13000000, c: 100000 });
});

test("clave de comercio", () => {
  assert.equal(merchantKey("NETFLIX.COM 1234"), "netflix");
  assert.equal(merchantKey("Pago débito automático Edenor S.A."), "edenor");
});

test("detecta un fijo mensual y el aumento", () => {
  const r = detectRecurring([g("2026-07-05", "Alquiler depto", 30000000), g("2026-08-05", "Alquiler depto", 30000000), g("2026-09-05", "Alquiler depto", 30000000), g("2026-10-05", "Alquiler depto", 36000000)], today);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, "fijo");
  assert.equal(r[0].nextDate, "2026-11-05");
  assert.equal(r[0].priceChangePct, 20);
});

test("suscripción con dos meses alcanza; algo suelto no", () => {
  const r = detectRecurring([g("2026-09-12", "Spotify", 359900), g("2026-10-12", "Spotify", 359900), g("2026-10-01", "Kiosco", 120000)], today);
  assert.deepEqual(r.map((x) => [x.key, x.kind]), [["spotify", "suscripcion"]]);
});

test("montos muy distintos no son fijos", () => {
  assert.equal(detectRecurring([g("2026-08-01", "Super Coto", 2000000), g("2026-09-01", "Super Coto", 9000000), g("2026-10-01", "Super Coto", 3000000)], today).length, 0);
});

test("fugas: delivery de noche y finde después de cobrar", () => {
  const night = ["2026-10-01", "2026-10-03", "2026-10-06", "2026-10-09"].map((d) => g(d, "Rappi", 1500000, { hour: 23 }));
  const pay: Mov = { kind: "ingreso", amount: 100000000, currency: "ARS", date: "2026-09-01", description: "Sueldo", categoryId: null };
  const weekends = [g("2026-09-05", "Salida", 9000000), g("2026-09-12", "Salida", 2000000), g("2026-09-19", "Salida", 2000000), g("2026-09-26", "Salida", 2000000)];
  const leaks = detectLeaks([...night, pay, ...weekends], [], today);
  assert.ok(leaks.some((l) => l.kind === "delivery_noche"));
  assert.ok(leaks.some((l) => l.kind === "finde_cobro"));
});

test("meta: ahorro semanal", () => {
  assert.equal(weeklySaving(10000000, 2000000, "2026-12-06", today), 1000000);
  assert.equal(weeklySaving(100, 200, null, today), 0);
});

test("valor real con IPC", () => {
  assert.equal(realValue(100000, 200, 300), 150000);
  assert.equal(realValue(100000, null, 300), null);
});

test("importes y fechas argentinas", () => {
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount("-1234.56"), -123456);
  assert.equal(parseAmount("$ 12.000"), 1200000);
  assert.equal(parseAmount("(500,00)"), -50000);
  assert.equal(parseDate("05/10/2026"), "2026-10-05");
  assert.equal(parseDate("5-10-26"), "2026-10-05");
  assert.equal(parseDate("31/02/2026"), null);
});

test("CSV con punto y coma y débito/crédito", () => {
  const rows = parseCsv('Fecha;Concepto;Débito;Crédito\n05/10/2026;"Compra, Coto";12.000,50;\n06/10/2026;Sueldo;;800.000,00\n');
  const out = mapRows(rows, { date: 0, description: 1, debit: 2, credit: 3, skipHeader: true });
  assert.deepEqual(out.map((r) => [r.date, r.kind, r.amount]), [["2026-10-05", "gasto", 1200050], ["2026-10-06", "ingreso", 80000000]]);
  assert.equal(out[0].description, "Compra, Coto");
  assert.notEqual(out[0].externalId, out[1].externalId);
});

test("Mercado Pago CSV", () => {
  const rows = parseCsv("RELEASE_DATE,TRANSACTION_TYPE,REFERENCE_ID,TRANSACTION_NET_AMOUNT\n2026-10-02,Pago a Kiosco,123,-1500.00\n2026-10-03,Transferencia recibida,124,20000.00");
  const map = mercadoPagoMapping(rows[0])!;
  assert.deepEqual(mapRows(rows, map).map((r) => r.kind), ["gasto", "ingreso"]);
  assert.equal(mercadoPagoMapping(["Fecha", "Descripción", "Importe"]), null);
});

test("PDF de resumen: fecha, descripción e importe", () => {
  const rows = rowsFromPdfText("RESUMEN\n05/10 MERPAGO*KIOSCO 1.500,00\n06/10/26 DEVOLUCION 200,00-\nTotal 1.300,00", 2026);
  assert.deepEqual(rows, [["05/10", "MERPAGO*KIOSCO", "1.500,00"], ["06/10/26", "DEVOLUCION", "-200,00"]]);
});

test("mails: servicio, suscripción y resumen", () => {
  assert.equal(detectFromMail({ from: "Edenor <facturas@edenor.com>", subject: "Tu factura de octubre", snippet: "Total a pagar $ 25.430,10 vence el 20/10" })?.amount, 2543010);
  assert.equal(detectFromMail({ from: "Netflix <info@netflix.com>", subject: "Tu recibo de Netflix", snippet: "Cobramos $ 8.999,00 de tu tarjeta" })?.detected, "suscripcion");
  assert.equal(detectFromMail({ from: "Visa <resumen@visa.com>", subject: "Tu resumen de tarjeta está disponible", snippet: "Saldo actual $ 345.000,00" })?.detected, "resumen_tarjeta");
  assert.equal(detectFromMail({ from: "Juan", subject: "Asado del sábado", snippet: "¿Quién lleva el carbón?" }), null);
});
