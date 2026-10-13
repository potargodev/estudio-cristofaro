import assert from "node:assert/strict";
import test from "node:test";
import { creditOf, prevPeriod, purchaseAnomalies, rowsOf, salesAnomalies, summarize, type BookRow } from "./core";

const row = (id: string, o: Partial<BookRow>): BookRow => ({ id, kind: "compra", fecha: "2026-09-10", letra: "A", codigo: 1, puntoVenta: 1, numero: Number(id.replace(/\D/g, "") || 1), cuit: "30712345671", nombre: "Proveedor", neto: 100000, noGravado: 0, exento: 0, iva: [{ alicuota: 21, importe: 21000 }], percepcionesIva: 0, total: 121000, cae: "75123456789012", validation: { cuit: "ok", cae: "ok", arca: { cuit: "activo", cae: "autorizado" } }, fingerprint: `fp-${id}`, loadedAt: "2026-09-12", ...o });

test("crédito fiscal: solo A y M, con percepciones de IVA", () => {
  assert.equal(creditOf(row("1", { percepcionesIva: 3000 })), 24000);
  assert.equal(creditOf(row("2", { letra: "B" })), 0);
  assert.equal(creditOf(row("p", { creditShare: 0.5 })), 10500);
  assert.equal(creditOf(row("n", { creditShare: 0 })), 0);
  assert.equal(creditOf(row("3", { letra: "C", iva: [] })), 0);
  const s = summarize([row("1", {}), row("2", { cuit: "20111111112", nombre: "Mono", letra: "C", iva: [], total: 50000 })], "compras");
  assert.equal(s.fiscal, 21000);
  assert.deepEqual(s.byCondition.map((c) => c.condition), ["Responsable inscripto", "Monotributista o exento"]);
  assert.equal(s.byRate[0].alicuota, 21);
  assert.equal(prevPeriod("2026-01"), "2025-12");
});

test("libro del período: fechadas en el período y cargadas en el período con fecha anterior", () => {
  const all = [row("1", {}), row("2", { fecha: "2026-08-20", loadedAt: "2026-09-02" }), row("3", { fecha: "2026-08-20", loadedAt: "2026-08-21" })];
  assert.deepEqual(rowsOf(all, "2026-09").map((r) => r.id).sort(), ["1", "2"]);
});

test("anomalías de compras: nueve tipos, cada una explicada", () => {
  const history = [1, 2, 3, 4].map((n) => row(`h${n}`, { fecha: `2026-0${n + 3}-05`, cuit: "30500010912", nombre: "Habitual SA", total: 10000 }));
  const rows = [
    row("1", { cuit: "30500010912", nombre: "Habitual SA", total: 900000, neto: 743801, iva: [{ alicuota: 21, importe: 156199 }] }),
    row("2", { fingerprint: "dup", nombre: "Doble SRL", cuit: "30709998885" }),
    row("3", { fingerprint: "dup", nombre: "Doble SRL", cuit: "30709998885" }),
    row("4", { validation: { cuit: "ok", cae: "ok", arca: { cuit: "inexistente", cae: "autorizado" } }, nombre: "Fantasma SA", cuit: "30111111118" }),
    row("5", { validation: { cuit: "ok", cae: "ok", arca: { cuit: "activo", cae: "no_encontrado" } }, nombre: "Sin CAE SA", cuit: "30222222229" }),
    row("6", { letra: "B", nombre: "Kiosco B", cuit: "20333333334" }),
    row("7", { fecha: "2026-07-01", loadedAt: "2026-09-03", nombre: "Atrasada SA", cuit: "30444444445" }),
    row("8", { nombre: "Edenor SA", cuit: "30655116202", iva: [{ alicuota: 21, importe: 21000 }] }),
    ...[1, 2, 3].map((n) => row(`m${n}`, { letra: "C", iva: [], cuit: `2055555555${n}`, nombre: `Monotributista ${n}`, total: 2000000 })),
  ];
  const a = purchaseAnomalies(rows, [...history, ...rows], "2026-09");
  const types = new Set(a.map((x) => x.type));
  for (const t of ["importe_atipico", "duplicado", "cuit_padron", "cae_invalido", "credito_b_c", "fuera_periodo", "alicuota_rubro", "monotributistas"]) assert.ok(types.has(t as never), `falta ${t}`);
  // Concentración: un proveedor con más del 40 % de las compras
  const conc = purchaseAnomalies([row("c1", { total: 5000000 }), row("c2", { cuit: "30709998885", nombre: "Otro" }), row("c3", { cuit: "30111111118", nombre: "Tercero" })], [], "2026-09");
  assert.ok(conc.some((x) => x.type === "concentracion" && /concentra/.test(x.title)));
  assert.equal(a[0].severity, "alta", "ordenadas por importancia");
  assert.ok(a.every((x) => x.detail.length > 20));
});

test("anomalías de ventas: rechazadas y saltos de numeración", () => {
  const v = (id: string, numero: number, status = "autorizada"): BookRow => ({ ...row(id, { numero }), kind: "venta", status, fingerprint: null });
  const a = salesAnomalies([v("1", 10), v("2", 11), v("3", 14), v("4", 15, "rechazada")]);
  assert.ok(a.some((x) => x.type === "rechazados" && x.severity === "alta"));
  const gap = a.find((x) => x.type === "numeracion");
  assert.ok(gap && /12–13/.test(gap.detail));
});
