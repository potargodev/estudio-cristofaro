import "server-only";
import { zipSync, strToU8 } from "fflate";
import type { Report } from "@/lib/export-table";
import { formatCuit } from "@/lib/types";
import { creditOf, type BookRow } from "./core";
import { purchaseFiles, salesFiles } from "./digital";
import type { Book } from "./server";

// Exportación del Libro IVA por CUIT (§2.p, B4): Excel o PDF con el detalle y
// el resumen por alícuota, y los archivos de importación del Libro IVA Digital
// (comprobantes y alícuotas) en un ZIP. Los diseños de registro quedan «a
// validar» contra el aplicativo vigente: el contador revisa antes de subir.

const pesos = (c: number) => Math.round(c) / 100;
const ivaOf = (r: BookRow) => r.iva.reduce((a, x) => a + x.importe, 0);

export function ivaReport(rows: BookRow[], book: Book, meta: { org: string; period: string; cuit?: string | null; demo?: boolean }): Report {
  const fiscal = (r: BookRow) => (book === "compras" ? creditOf(r) : ivaOf(r));
  const byRate = new Map<number, { base: number; iva: number }>();
  for (const r of rows)
    for (const x of r.iva) {
      const t = byRate.get(x.alicuota) ?? { base: 0, iva: 0 };
      t.base += r.iva.length === 1 ? r.neto : x.alicuota ? Math.round(x.importe / (x.alicuota / 100)) : 0;
      t.iva += x.importe;
      byRate.set(x.alicuota, t);
    }
  const sum = (f: (r: BookRow) => number) => pesos(rows.reduce((a, r) => a + f(r), 0));
  return {
    title: `Libro IVA ${book} · ${meta.org}`,
    subtitle: `Período ${meta.period}${meta.cuit ? ` · CUIT ${formatCuit(meta.cuit)}` : ""}`,
    demo: meta.demo,
    sections: [
      {
        title: "Comprobantes",
        header: ["Fecha", "Tipo", "Punto de venta", "Número", book === "compras" ? "Proveedor" : "Cliente", "CUIT o documento", "Neto gravado", "No gravado", "Exento", "IVA", "Percepciones IVA", "Total", book === "compras" ? "Crédito fiscal" : "Débito fiscal"],
        rows: rows.map((r) => [r.fecha, `${r.letra ?? ""}${r.codigo ? ` (${r.codigo})` : ""}`, r.puntoVenta, r.numero, r.nombre, r.cuit, pesos(r.neto), pesos(r.noGravado), pesos(r.exento), pesos(ivaOf(r)), pesos(r.percepcionesIva), pesos(r.total), pesos(fiscal(r))]),
        totals: [["Total", "", "", "", `${rows.length} comprobantes`, "", sum((r) => r.neto), sum((r) => r.noGravado), sum((r) => r.exento), sum(ivaOf), sum((r) => r.percepcionesIva), sum((r) => r.total), sum(fiscal)]],
        widths: [7, 5, 5, 6, 14, 9, 7, 6, 6, 7, 6, 8, 8],
      },
      {
        title: "Por alícuota",
        header: ["Alícuota", "Base imponible", "IVA"],
        rows: [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [`${String(k).replace(".", ",")} %`, pesos(v.base), pesos(v.iva)]),
        widths: [4, 6, 6],
      },
    ],
  };
}

/** ZIP con los dos archivos de importación del Libro IVA Digital y una nota «a validar» */
export function ivaDigitalZip(rows: BookRow[], book: Book, meta: { period: string; cuit?: string | null }) {
  const files = book === "ventas" ? salesFiles(rows) : purchaseFiles(rows, creditOf);
  const prefix = `LIBRO_IVA_DIGITAL_${book.toUpperCase()}_${meta.period.replace("-", "")}${meta.cuit ? `_${meta.cuit}` : ""}`;
  const note = [
    `Libro IVA Digital · ${book} · ${meta.period}`,
    `${files.count} comprobantes.`,
    "",
    "Archivos armados por Faro con los diseños de registro de la RG 4597 (comprobantes y alícuotas).",
    "A VALIDAR: revisalos con el aplicativo de ARCA antes de presentar. Faro no presenta ni pide la clave fiscal.",
  ].join("\r\n");
  return zipSync({
    [`${prefix}_CBTE.txt`]: strToU8(files.cbte),
    [`${prefix}_ALICUOTAS.txt`]: strToU8(files.alic),
    "LEEME.txt": strToU8(note),
  });
}
