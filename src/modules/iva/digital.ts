// Libro IVA Digital (§2.p, B4): archivos de importación de ventas y compras
// con los diseños de registro conocidos de la RG 4597 (comprobantes y
// alícuotas, ancho fijo). Quedan «a validar» contra la versión vigente del
// aplicativo antes de presentar: Faro los arma, el contador los revisa y los
// sube. Sin base ni red.

import type { BookRow } from "./core";

/** Código de alícuota de ARCA */
const ALIC: Record<string, string> = { "0": "0003", "10.5": "0004", "21": "0005", "27": "0006", "5": "0008", "2.5": "0009" };
const LETTER_CODE: Record<string, number> = { A: 1, B: 6, C: 11, E: 19, M: 51 };

const digits = (v: string | number | null | undefined, n: number) => String(v ?? "").replace(/\D/g, "").slice(-n).padStart(n, "0");
const text = (v: string | null | undefined, n: number) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .slice(0, n)
    .padEnd(n, " ");
/** Importe en centavos → 15 posiciones con dos decimales implícitos (siempre positivo: el tipo dice si resta) */
const amount = (cents: number, n = 15) => String(Math.abs(Math.round(cents))).padStart(n, "0").slice(-n);
const ymd = (iso: string) => iso.replace(/-/g, "").slice(0, 8);
const typeOf = (r: BookRow) => r.codigo ?? (r.letra ? LETTER_CODE[r.letra] : null) ?? 11;
const docOf = (r: BookRow) => {
  const id = (r.cuit ?? "").replace(/\D/g, "");
  return id.length === 11 ? { code: "80", id } : id.length >= 7 && id.length <= 8 ? { code: "96", id } : { code: "99", id: "0" };
};

/** Libro IVA Digital de ventas: comprobantes (266 posiciones) y alícuotas (62) */
export function salesFiles(rows: BookRow[]) {
  const cbte: string[] = [];
  const alic: string[] = [];
  for (const r of rows) {
    if (r.status && r.status !== "autorizada") continue;
    const t = typeOf(r);
    const doc = docOf(r);
    const ivas = r.iva.filter((x) => x.importe || r.neto);
    const noIva = r.letra === "C" || r.letra === "E";
    cbte.push(
      [
        ymd(r.fecha),
        digits(t, 3),
        digits(r.puntoVenta, 5),
        digits(r.numero, 20),
        digits(r.numero, 20),
        doc.code,
        digits(doc.id, 20),
        text(r.nombre, 30),
        amount(r.total),
        amount(r.noGravado),
        amount(0),
        amount(r.exento),
        amount(0),
        amount(0),
        amount(0),
        amount(0),
        "PES",
        "0001000000",
        String(noIva ? 0 : Math.min(9, ivas.length)),
        r.exento && !r.neto ? "E" : "0",
        amount(0),
        "00000000",
      ].join(""),
    );
    if (!noIva) for (const x of ivas) alic.push([digits(t, 3), digits(r.puntoVenta, 5), digits(r.numero, 20), amount(baseOf(r, x)), ALIC[String(x.alicuota)] ?? "0005", amount(x.importe)].join(""));
  }
  return { cbte: cbte.join("\r\n"), alic: alic.join("\r\n"), count: cbte.length };
}

/** Libro IVA Digital de compras: comprobantes (325 posiciones) y alícuotas (84) */
export function purchaseFiles(rows: BookRow[], credit: (r: BookRow) => number) {
  const cbte: string[] = [];
  const alic: string[] = [];
  for (const r of rows) {
    const t = typeOf(r);
    const doc = docOf(r);
    const ivas = r.iva.filter((x) => x.importe);
    const noIva = r.letra === "C" || r.letra === "B" || !ivas.length;
    cbte.push(
      [
        ymd(r.fecha),
        digits(t, 3),
        digits(r.puntoVenta, 5),
        digits(r.numero, 20),
        text("", 16),
        doc.code,
        digits(doc.id, 20),
        text(r.nombre, 30),
        amount(r.total),
        amount(r.noGravado),
        amount(r.exento),
        amount(r.percepcionesIva),
        amount(0),
        amount(0),
        amount(0),
        amount(0),
        "PES",
        "0001000000",
        String(noIva ? 0 : Math.min(9, ivas.length)),
        r.exento && !r.neto ? "E" : "0",
        amount(credit(r)),
        amount(0),
        digits("", 11),
        text("", 30),
        amount(0),
      ].join(""),
    );
    if (!noIva) for (const x of ivas) alic.push([digits(t, 3), digits(r.puntoVenta, 5), digits(r.numero, 20), doc.code, digits(doc.id, 20), amount(baseOf(r, x)), ALIC[String(x.alicuota)] ?? "0005", amount(x.importe)].join(""));
  }
  return { cbte: cbte.join("\r\n"), alic: alic.join("\r\n"), count: cbte.length };
}

/** Base imponible de una alícuota: el impuesto dividido la tasa (o el neto si hay una sola) */
function baseOf(r: BookRow, x: { alicuota: number; importe: number }) {
  if (r.iva.length === 1) return r.neto;
  return x.alicuota ? Math.round(x.importe / (x.alicuota / 100)) : 0;
}

/**
 * Semáforo de la posición de IVA del mes contra el promedio de los 3
 * anteriores: verde si baja o sube poco, amarillo si sube más del 30 %, rojo
 * si más del 60 % (umbrales «a validar»). Saldo a favor: verde.
 */
export function ivaLight(current: number, previous: number[]) {
  if (current <= 0) return "verde" as const;
  const prev = previous.filter((x) => Number.isFinite(x));
  if (!prev.length) return "verde" as const;
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
  if (avg <= 0) return current > 0 ? ("amarillo" as const) : ("verde" as const);
  const delta = (current - avg) / avg;
  return delta > 0.6 ? ("rojo" as const) : delta > 0.3 ? ("amarillo" as const) : ("verde" as const);
}
