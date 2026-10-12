// Análisis del Libro IVA antes de presentar (§2.q, etapa 4). Puro: arma los
// libros de compras y ventas de un período, el resumen (crédito o débito
// fiscal por proveedor o cliente, por condición frente al IVA y por alícuota),
// la comparación con los períodos anteriores y las anomalías, cada una con su
// explicación. Son hechos para el contador, nunca una validación (principios
// §1). Montos en centavos.

export type Severity = "alta" | "media" | "baja";

export interface BookRow {
  id: string;
  /** smart_document (compras) | invoice (ventas) */
  kind: "compra" | "venta";
  fecha: string;
  letra: string | null;
  codigo: number | null;
  puntoVenta: number | null;
  numero: number | null;
  cuit: string | null;
  nombre: string;
  neto: number;
  noGravado: number;
  exento: number;
  /** IVA por alícuota, en centavos */
  iva: { alicuota: number; importe: number }[];
  /** Percepciones de IVA (computables como crédito en compras A y M) */
  percepcionesIva: number;
  total: number;
  cae: string | null;
  /** Validaciones guardadas (CUIT, CAE y la consulta a ARCA) */
  validation?: { cuit?: string; cae?: string; arca?: { cuit?: string; cae?: string } } | null;
  fingerprint: string | null;
  /** Fecha en que se cargó o confirmó (para «fuera de período») */
  loadedAt: string | null;
  /** Ventas: autorizada | rechazada | error | borrador */
  status?: string;
  /** Rubro aproximado del proveedor por su nombre (para la alícuota esperada) */
  supplierHint?: string | null;
}

export interface Anomaly {
  type: AnomalyType;
  severity: Severity;
  title: string;
  /** La explicación: qué se vio y por qué importa (sin decir qué hacer como verdad) */
  detail: string;
  rowIds: string[];
}

export const ANOMALY_LABEL = {
  concentracion: "Concentración en un proveedor",
  monotributistas: "Alta proporción de monotributistas",
  cuit_padron: "CUIT con problemas en el padrón",
  cae_invalido: "CAE no válido",
  duplicado: "Comprobante duplicado",
  fuera_periodo: "Comprobante fuera de período",
  importe_atipico: "Importe atípico para el proveedor",
  alicuota_rubro: "Alícuota distinta a la esperable por el rubro",
  credito_b_c: "IVA en una factura B o C",
  numeracion: "Saltos en la numeración",
  rechazados: "Comprobantes rechazados o con error",
  concentracion_clientes: "Concentración en un cliente",
} as const;
export type AnomalyType = keyof typeof ANOMALY_LABEL;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ivaOf = (r: BookRow) => sum(r.iva.map((x) => x.importe));
const pesos = (c: number) => `$ ${(c / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (x: number) => `${Math.round(x * 100)} %`;
const inPeriod = (date: string | null, period: string) => !!date && date.slice(0, 7) === period;

/** ¿Da crédito fiscal? Solo facturas A y M (y sus notas) a un responsable inscripto */
const givesCredit = (r: BookRow) => r.letra === "A" || r.letra === "M";
/** Crédito fiscal computable de una compra (IVA discriminado + percepciones de IVA) */
export const creditOf = (r: BookRow) => (givesCredit(r) ? ivaOf(r) + r.percepcionesIva : 0);

/** Condición frente al IVA de la contraparte, por la letra del comprobante */
export function conditionOf(r: BookRow) {
  if (r.letra === "A" || r.letra === "M") return "Responsable inscripto";
  if (r.letra === "C") return "Monotributista o exento";
  if (r.letra === "B") return "Factura B (sin crédito)";
  if (r.letra === "E") return "Exterior";
  return "Sin letra (ticket u otro)";
}

interface BookSummary {
  count: number;
  neto: number;
  iva: number;
  /** Compras: crédito fiscal computable · ventas: débito fiscal */
  fiscal: number;
  total: number;
  byParty: { key: string; nombre: string; count: number; fiscal: number; total: number }[];
  byCondition: { condition: string; count: number; fiscal: number; total: number }[];
  byRate: { alicuota: number; base: number; iva: number }[];
}

export function summarize(rows: BookRow[], book: "compras" | "ventas"): BookSummary {
  const fiscalOf = (r: BookRow) => (book === "compras" ? creditOf(r) : ivaOf(r));
  const party = new Map<string, BookSummary["byParty"][number]>();
  const cond = new Map<string, BookSummary["byCondition"][number]>();
  const rate = new Map<number, BookSummary["byRate"][number]>();
  for (const r of rows) {
    const k = r.cuit || r.nombre;
    const p = party.get(k) ?? { key: k, nombre: r.nombre, count: 0, fiscal: 0, total: 0 };
    p.count++;
    p.fiscal += fiscalOf(r);
    p.total += r.total;
    party.set(k, p);
    const c = conditionOf(r);
    const cc = cond.get(c) ?? { condition: c, count: 0, fiscal: 0, total: 0 };
    cc.count++;
    cc.fiscal += fiscalOf(r);
    cc.total += r.total;
    cond.set(c, cc);
    for (const x of r.iva) {
      const rr = rate.get(x.alicuota) ?? { alicuota: x.alicuota, base: 0, iva: 0 };
      rr.iva += x.importe;
      rr.base += x.alicuota ? Math.round((x.importe * 100) / x.alicuota) : 0;
      rate.set(x.alicuota, rr);
    }
  }
  return {
    count: rows.length,
    neto: sum(rows.map((r) => r.neto)),
    iva: sum(rows.map(ivaOf)),
    fiscal: sum(rows.map(fiscalOf)),
    total: sum(rows.map((r) => r.total)),
    byParty: [...party.values()].sort((a, b) => b.fiscal - a.fiscal || b.total - a.total),
    byCondition: [...cond.values()].sort((a, b) => b.total - a.total),
    byRate: [...rate.values()].sort((a, b) => b.alicuota - a.alicuota),
  };
}

/** Período anterior (AAAA-MM) */
export function prevPeriod(p: string, n = 1) {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Las filas del libro de un período: las fechadas en el período y, en compras,
 * también las que se cargaron en el período con fecha de otro (fuera de período).
 */
export function rowsOf(all: BookRow[], period: string) {
  return all.filter((r) => inPeriod(r.fecha, period) || (r.kind === "compra" && inPeriod(r.loadedAt, period) && r.fecha < `${period}-01`));
}

/** Alícuota esperable por el rubro del proveedor (aproximado por su nombre) */
function expectedRate(nombre: string): number | null {
  const n = nombre.toLowerCase();
  if (/edenor|edesur|metrogas|naturgy|aysa|telecom|telefonica|movistar|claro|personal|fibertel|camuzzi|epec|edelap/.test(n)) return 27;
  if (/molino|harina|panader|carnes?|frigor|verdul|frut|hortaliz|granja|leche|lacteo/.test(n)) return 10.5;
  return null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

/** Anomalías del libro de compras de un período, con su explicación */
export function purchaseAnomalies(rows: BookRow[], history: BookRow[], period: string): Anomaly[] {
  const out: Anomaly[] = [];
  const s = summarize(rows, "compras");
  // Concentración en un proveedor
  if (s.byParty.length >= 3 && s.total > 0) {
    const top = [...s.byParty].sort((a, b) => b.total - a.total)[0];
    const share = top.total / s.total;
    if (share > 0.4) out.push({ type: "concentracion", severity: "media", title: `${top.nombre} concentra el ${pct(share)} de las compras`, detail: `Un solo proveedor explica ${pct(share)} del total del período (${pesos(top.total)} de ${pesos(s.total)}). Conviene confirmar que todo corresponda a la actividad.`, rowIds: rows.filter((r) => (r.cuit || r.nombre) === top.key).map((r) => r.id) });
  }
  // Monotributistas
  const mono = rows.filter((r) => r.letra === "C");
  const monoShare = s.total ? sum(mono.map((r) => r.total)) / s.total : 0;
  if (mono.length >= 2 && monoShare > 0.5) out.push({ type: "monotributistas", severity: "media", title: `El ${pct(monoShare)} de las compras es a monotributistas`, detail: `${mono.length} comprobantes C por ${pesos(sum(mono.map((r) => r.total)))}: no generan crédito fiscal y una proporción alta puede pedir revisar a esos proveedores.`, rowIds: mono.map((r) => r.id) });
  for (const r of rows) {
    const v = r.validation ?? {};
    if (v.cuit === "error" || v.arca?.cuit === "inexistente")
      out.push({ type: "cuit_padron", severity: "alta", title: `CUIT con problemas: ${r.nombre}`, detail: v.cuit === "error" ? `El CUIT ${r.cuit ?? ""} no tiene un dígito verificador válido.` : `ARCA no tiene registrado el CUIT ${r.cuit ?? ""} o figura inactivo en el padrón.`, rowIds: [r.id] });
    if (v.cae === "error" || v.arca?.cae === "no_encontrado")
      out.push({ type: "cae_invalido", severity: "alta", title: `CAE no válido: ${r.nombre} ${r.numero ?? ""}`, detail: v.arca?.cae === "no_encontrado" ? "La constatación de ARCA (WSCDC) no encontró un comprobante con ese CAE y esos datos." : "El CAE no tiene el formato o la vigencia correctos.", rowIds: [r.id] });
    if (!givesCredit(r) && ivaOf(r) > 0 && (r.letra === "B" || r.letra === "C"))
      out.push({ type: "credito_b_c", severity: "alta", title: `Factura ${r.letra} con IVA: ${r.nombre}`, detail: `Una factura ${r.letra} no da derecho a crédito fiscal aunque muestre IVA (${pesos(ivaOf(r))}); no se cuenta en el crédito del período.`, rowIds: [r.id] });
    if (r.fecha < `${period}-01`)
      out.push({ type: "fuera_periodo", severity: "media", title: `Fuera de período: ${r.nombre} del ${r.fecha.split("-").reverse().join("/")}`, detail: "Se cargó en este período pero tiene fecha de uno anterior. Conviene revisar en qué período corresponde computarla.", rowIds: [r.id] });
    const hint = expectedRate(r.supplierHint ?? r.nombre);
    const rates = r.iva.filter((x) => x.importe > 0).map((x) => x.alicuota);
    if (hint != null && rates.length && !rates.includes(hint))
      out.push({ type: "alicuota_rubro", severity: "baja", title: `Alícuota de ${rates.join(" y ")} % en ${r.nombre}`, detail: `Por el rubro del proveedor, lo habitual es ${hint} %. Puede ser correcto (otro producto o servicio); conviene mirarlo.`, rowIds: [r.id] });
    // Importe atípico frente a lo habitual del mismo proveedor
    const prev = history.filter((h) => h.id !== r.id && h.cuit && h.cuit === r.cuit && h.fecha < `${period}-01`).map((h) => h.total);
    if (prev.length >= 3) {
      const med = median(prev);
      if (med > 0 && (r.total > med * 3 || r.total < med / 5))
        out.push({ type: "importe_atipico", severity: "media", title: `Importe atípico: ${r.nombre} por ${pesos(r.total)}`, detail: `Lo habitual con este proveedor ronda ${pesos(med)} (mediana de ${prev.length} comprobantes anteriores).`, rowIds: [r.id] });
    }
  }
  // Duplicados: la misma huella dos veces
  const byFp = new Map<string, BookRow[]>();
  for (const r of rows) if (r.fingerprint) byFp.set(r.fingerprint, [...(byFp.get(r.fingerprint) ?? []), r]);
  for (const [, list] of byFp) if (list.length > 1) out.push({ type: "duplicado", severity: "alta", title: `Duplicado: ${list[0].nombre} ${list[0].numero ?? ""}`, detail: `El mismo comprobante (emisor, tipo, punto de venta y número) está ${list.length} veces: el crédito fiscal se contaría de más.`, rowIds: list.map((r) => r.id) });
  return sortAnomalies(out);
}

/** Anomalías del libro de ventas de un período */
export function salesAnomalies(rows: BookRow[]): Anomaly[] {
  const out: Anomaly[] = [];
  const bad = rows.filter((r) => r.status === "rechazada" || r.status === "error");
  if (bad.length) out.push({ type: "rechazados", severity: "alta", title: `${bad.length} comprobante${bad.length === 1 ? "" : "s"} rechazado${bad.length === 1 ? "" : "s"} o con error`, detail: "No tienen CAE: no son comprobantes válidos y no entran al débito fiscal hasta que se emitan bien.", rowIds: bad.map((r) => r.id) });
  const ok = rows.filter((r) => r.status === "autorizada" && r.numero != null);
  const series = new Map<string, number[]>();
  for (const r of ok) series.set(`${r.codigo}-${r.puntoVenta}`, [...(series.get(`${r.codigo}-${r.puntoVenta}`) ?? []), r.numero!]);
  for (const [k, nums] of series) {
    const s = [...new Set(nums)].sort((a, b) => a - b);
    const gaps: string[] = [];
    for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > 1) gaps.push(`${s[i - 1] + 1}${s[i] - s[i - 1] > 2 ? `–${s[i] - 1}` : ""}`);
    if (gaps.length) out.push({ type: "numeracion", severity: "media", title: `Saltos en la numeración del punto de venta ${k.split("-")[1]}`, detail: `Faltan los números ${gaps.join(", ")}. Pueden ser comprobantes emitidos fuera de Faro.`, rowIds: [] });
  }
  const s = summarize(ok, "ventas");
  if (s.byParty.length >= 3 && s.total > 0) {
    const top = [...s.byParty].sort((a, b) => b.total - a.total)[0];
    if (top.total / s.total > 0.6) out.push({ type: "concentracion_clientes", severity: "baja", title: `${top.nombre} concentra el ${pct(top.total / s.total)} de las ventas`, detail: "Un solo cliente explica la mayor parte de la facturación del período.", rowIds: ok.filter((r) => (r.cuit || r.nombre) === top.key).map((r) => r.id) });
  }
  return sortAnomalies(out);
}

const ORDER: Record<Severity, number> = { alta: 0, media: 1, baja: 2 };
const sortAnomalies = (xs: Anomaly[]) => xs.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

export interface ChecklistItem {
  label: string;
  /** ok | pendiente | sin_dato (no se pudo verificar) */
  state: "ok" | "pendiente" | "sin_dato";
  detail?: string;
}
