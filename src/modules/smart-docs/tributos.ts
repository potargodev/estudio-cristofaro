// Percepciones, retenciones y otros tributos de un comprobante de compra, por
// tipo y jurisdicción (§2.q, etapa 2). Puro: se prueba con unitarias.

export const TRIBUTO_TIPOS = ["iva", "iibb", "ganancias", "internos", "otros"] as const;
export type TributoTipo = (typeof TRIBUTO_TIPOS)[number];

export const TRIBUTO_LABEL: Record<TributoTipo, string> = {
  iva: "IVA",
  iibb: "Ingresos brutos",
  ganancias: "Ganancias",
  internos: "Impuestos internos",
  otros: "Otros tributos",
};

/** Jurisdicciones de ingresos brutos (códigos del Convenio Multilateral) */
const JURISDICCIONES: { code: string; name: string; match: RegExp }[] = [
  { code: "901", name: "CABA", match: /\b(caba|c\.?a\.?b\.?a|agip|ciudad (autonoma )?de buenos aires|capital federal)\b/ },
  { code: "902", name: "Buenos Aires", match: /\b(arba|pcia\.? (de )?(bs\.? ?as|buenos aires)|provincia de buenos aires|buenos aires)\b/ },
  { code: "903", name: "Catamarca", match: /\bcatamarca\b/ },
  { code: "904", name: "Córdoba", match: /\b(cordoba|dgr cba|rentas cordoba)\b/ },
  { code: "905", name: "Corrientes", match: /\bcorrientes\b/ },
  { code: "906", name: "Chaco", match: /\bchaco\b/ },
  { code: "907", name: "Chubut", match: /\bchubut\b/ },
  { code: "908", name: "Entre Ríos", match: /\b(entre rios|ater)\b/ },
  { code: "909", name: "Formosa", match: /\bformosa\b/ },
  { code: "910", name: "Jujuy", match: /\bjujuy\b/ },
  { code: "911", name: "La Pampa", match: /\bla pampa\b/ },
  { code: "912", name: "La Rioja", match: /\bla rioja\b/ },
  { code: "913", name: "Mendoza", match: /\b(mendoza|atm)\b/ },
  { code: "914", name: "Misiones", match: /\bmisiones\b/ },
  { code: "915", name: "Neuquén", match: /\bneuquen\b/ },
  { code: "916", name: "Río Negro", match: /\brio negro\b/ },
  { code: "917", name: "Salta", match: /\bsalta\b/ },
  { code: "918", name: "San Juan", match: /\bsan juan\b/ },
  { code: "919", name: "San Luis", match: /\bsan luis\b/ },
  { code: "920", name: "Santa Cruz", match: /\bsanta cruz\b/ },
  { code: "921", name: "Santa Fe", match: /\b(santa fe|api)\b/ },
  { code: "922", name: "Santiago del Estero", match: /\bsantiago del estero\b/ },
  { code: "923", name: "Tierra del Fuego", match: /\btierra del fuego\b/ },
  { code: "924", name: "Tucumán", match: /\btucuman\b/ },
];

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

/** Tipo y jurisdicción a partir del concepto impreso («Percepción IIBB CABA», «Perc. IVA RG 2408»…) */
export function classifyTributo(concepto: string): { tipo: TributoTipo; jurisdiccion: string | null } {
  const t = plain(concepto);
  const jur = JURISDICCIONES.find((j) => j.match.test(t))?.name ?? null;
  if (/iibb|ingresos brutos|ii\.?bb|\bib\b|convenio multilateral|sircreb|sirtac|arba|agip|\bdgr\b|rentas/.test(t)) return { tipo: "iibb", jurisdiccion: jur };
  if (/\biva\b|valor agregado|rg ?(2408|3337|2126|2854)/.test(t)) return { tipo: "iva", jurisdiccion: null };
  if (/ganancias|rg ?(830|2784|4815)/.test(t)) return { tipo: "ganancias", jurisdiccion: null };
  if (/internos?/.test(t)) return { tipo: "internos", jurisdiccion: null };
  return { tipo: "otros", jurisdiccion: jur };
}

/** Tratamiento de cada tributo en la compra */
export const TRATAMIENTOS = { credito_fiscal: "Crédito fiscal o pago a cuenta del IVA", pago_a_cuenta: "Pago a cuenta del impuesto", costo: "Mayor costo (no computable)" } as const;
export type Tratamiento = keyof typeof TRATAMIENTOS;

/** Tratamiento por defecto según el tipo (el contador lo corrige y queda aprendido por proveedor) */
export function defaultTreatment(tipo: TributoTipo): Tratamiento {
  if (tipo === "iva") return "credito_fiscal";
  if (tipo === "iibb" || tipo === "ganancias") return "pago_a_cuenta";
  return "costo";
}

/** Clave de un tributo para reglas y tratamientos: «iibb:CABA», «iva», «internos» */
export const tributoKey = (x: { tipo?: string | null; jurisdiccion?: string | null }) => `${x.tipo ?? "otros"}${x.jurisdiccion ? `:${x.jurisdiccion}` : ""}`;

/** Totales de percepciones por tipo (para la planilla y el Libro IVA) */
export function byTipo(list: { tipo?: string | null; importe: number }[]) {
  const out: Record<TributoTipo, number> = { iva: 0, iibb: 0, ganancias: 0, internos: 0, otros: 0 };
  for (const x of list) out[(TRIBUTO_TIPOS as readonly string[]).includes(x.tipo ?? "") ? (x.tipo as TributoTipo) : "otros"] += x.importe;
  return out;
}
