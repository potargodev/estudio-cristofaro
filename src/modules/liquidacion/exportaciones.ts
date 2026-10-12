// Archivos de salida de una liquidación (§2.q etapa 6): Libro de Sueldos
// Digital (ARCA), importación de nómina para el F.931 (SICOSS) y acreditación
// bancaria. Los diseños de registro son los conocidos públicamente y están
// «a validar» contra la versión vigente de cada organismo o banco antes de
// presentar: Faro los arma, el contador los revisa y los sube.
// Archivo sin "server-only": lo usan las pruebas.

import type { Line } from "./core";

export const FORMATS = {
  lsd: { label: "Libro de Sueldos Digital (ARCA)", status: "a_validar" as const, note: "Registros 01 a 04 según el diseño publicado por ARCA; cotejar con la versión vigente del aplicativo." },
  f931: { label: "Importación de nómina para el F.931 (SICOSS)", status: "a_validar" as const, note: "Formato de importación de SICOSS; cotejar las posiciones con la versión del aplicativo." },
  banco: { label: "Acreditación de haberes", status: "a_validar" as const, note: "Formato genérico (CBU, CUIL, importe); cada banco tiene el suyo." },
};

export interface ExportItem {
  cuil: string;
  name: string;
  legajo: string;
  cbu: string | null;
  area: string | null;
  lines: Line[];
  rem: number;
  norem: number;
  net: number;
  /** Base imponible de aportes y de contribuciones (centavos) */
  baseAportes: number;
  baseContrib: number;
  daysWorked: number;
  convencionado: boolean;
}

interface ExportRun {
  cuit: string;
  period: string;
  /** M mensual · S SAC/otras */
  kind: "mensual" | "sac" | "vacaciones" | "final";
  number: number;
  payDate: string;
}

const pad = (s: string, n: number) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, " ").slice(0, n).padEnd(n, " ");
const num = (cents: number, n: number) => String(Math.abs(Math.round(cents))).padStart(n, "0").slice(-n);
const digits = (s: string | null, n: number) => (s ?? "").replace(/\D/g, "").slice(0, n).padStart(n, "0");
const ymd = (d: string) => d.replace(/-/g, "");
/** Código de concepto del empleador (hasta 10): el de Faro en mayúsculas */
const conceptCode = (code: string) => pad(code.toUpperCase().replace(/[^A-Z0-9]/g, ""), 10);

/** Libro de Sueldos Digital: 01 envío, 02 por trabajador, 03 por concepto, 04 datos del F.931 */
export function lsdFile(run: ExportRun, items: ExportItem[]) {
  const out: string[] = [];
  out.push(["01", digits(run.cuit, 11), "SJ", run.period.replace("-", ""), run.kind === "mensual" ? "M" : "S", num(run.number, 5), "30", num(items.length, 6)].join(""));
  for (const it of items) {
    out.push(["02", digits(it.cuil, 11), pad(it.legajo, 10), pad(it.area ?? "", 50), it.cbu ? digits(it.cbu, 22) : pad("", 22), num(it.daysWorked, 3), ymd(run.payDate), pad("", 8), it.cbu ? "3" : "1"].join(""));
  }
  for (const it of items) {
    for (const l of it.lines.filter((x) => x.kind !== "contrib")) {
      const qty = l.quantity == null ? 0 : Math.round(l.quantity * 100);
      out.push(["03", digits(it.cuil, 11), conceptCode(l.code), num(qty, 5), l.quantity == null ? " " : "D", num(l.amount, 15), l.kind === "desc" || l.amount < 0 ? "D" : "C", pad("", 6)].join(""));
    }
  }
  for (const it of items) {
    out.push(["04", digits(it.cuil, 11), "0", "00", "0", "01", "01", "049", "01", "008", "000000", "00", num(it.rem + it.norem, 15), num(it.baseAportes, 15), num(it.baseContrib, 15), num(it.daysWorked, 2), it.convencionado ? "1" : "0"].join(""));
  }
  return out.join("\r\n") + "\r\n";
}

/** Importación de nómina para SICOSS (F.931): una línea por trabajador */
export function f931File(items: ExportItem[]) {
  const money = (cents: number, n: number) => (Math.round(cents) / 100).toFixed(2).replace(".", ",").padStart(n, " ").slice(-n);
  const sumOf = (it: ExportItem, codes: string[]) => it.lines.filter((l) => codes.includes(l.code)).reduce((s, l) => s + l.amount, 0);
  return (
    items
      .map((it) =>
        [
          digits(it.cuil, 11),
          pad(it.name, 30),
          "0", // cónyuge
          "00", // hijos
          "01", // situación: activo
          "01", // condición: servicios comunes mayor de 18
          "049", // actividad
          "01", // zona
          money(0, 5), // aporte adicional SS
          "008", // modalidad: tiempo indeterminado
          "000000", // obra social (se completa en SICOSS)
          "00", // adherentes
          money(it.rem + it.norem, 12), // remuneración total
          money(it.baseAportes, 12), // imponible 1
          money(0, 9), // asignaciones familiares
          money(0, 9),
          money(0, 9),
          money(0, 9),
          money(0, 9),
          pad("", 50), // provincia y localidad
          money(it.baseContrib, 12), // imponible 2
          money(it.baseAportes, 12), // imponible 3
          money(it.baseAportes, 12), // imponible 4
          "00", // siniestrado
          "0", // reducción
          money(0, 9),
          "1", // tipo de empresa
          money(0, 9),
          "1", // régimen: reparto
          "01", "01", // situación de revista 1 y día
          "00", "00", "00", "00",
          money(sumOf(it, ["basico", "antiguedad", "presentismo"]), 12), // sueldo
          money(sumOf(it, ["sac"]), 12), // SAC
          money(sumOf(it, ["he50", "he100"]), 12), // horas extra
          money(0, 12), // zona desfavorable
          money(sumOf(it, ["vacaciones"]), 12), // vacaciones
          String(it.daysWorked).padStart(9, " "), // días trabajados
          money(it.baseAportes, 12), // imponible 5
          it.convencionado ? "1" : "0",
          money(it.baseAportes, 12), // imponible 6
          "0", // tipo de operación
          money(0, 12), money(0, 12), money(0, 12), money(0, 12),
          "000", // cantidad de horas extra
          money(it.norem, 12), // no remunerativos
        ].join(""),
      )
      .join("\r\n") + "\r\n"
  );
}

/** Acreditación bancaria: CSV (CUIL, nombre, CBU, importe) y TXT de ancho fijo */
export function bankFiles(items: ExportItem[]) {
  const withCbu = items.filter((it) => it.cbu && it.net > 0);
  const csv = ["CUIL;Apellido y nombre;CBU;Importe", ...withCbu.map((it) => [it.cuil, it.name.replace(/;/g, " "), it.cbu, (it.net / 100).toFixed(2).replace(".", ",")].join(";"))].join("\r\n") + "\r\n";
  const txt = withCbu.map((it) => [digits(it.cbu, 22), num(it.net, 15), digits(it.cuil, 11), pad(it.name, 30)].join("")).join("\r\n") + "\r\n";
  return { csv, txt, missing: items.filter((it) => !it.cbu).map((it) => it.name), total: withCbu.reduce((s, it) => s + it.net, 0) };
}
