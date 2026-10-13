// Leyendas obligatorias en los comprobantes (§2.q etapa 5). El catálogo base
// vive acá; el Faro Manager lo mantiene (tabla legend_rules, en Escudo): edita
// textos, vigencia, fuente y estado, y avisa a los afectados cuando cambia una
// norma. Cada emisor configura una vez su perfil de leyendas (en los datos de
// facturación) y Faro las imprime solas en el PDF. Las condiciones son
// funciones fijas del código: una regla nueva elige una de la lista.
// Archivo sin "server-only": lo usan las pruebas y las pantallas.

export type LegendStatus = "vigente" | "a_validar" | "derogada";

export const LEGEND_STATUS: Record<LegendStatus, string> = {
  vigente: "Vigente (verificada)",
  a_validar: "A validar con la norma oficial",
  derogada: "Derogada",
};

/** Perfil de leyendas de un emisor: se carga una vez */
export interface LegendProfile {
  /** Ingresos Brutos en CABA: no inscripto en CABA, local, Convenio Multilateral o Régimen Simplificado */
  isibCaba: "no" | "local" | "convenio" | "simplificado";
  /** Alícuota de ISIB CABA de la actividad (si tiene varias, la menor) */
  isibAlicuota: number | null;
  /** Operaciones alcanzadas por regímenes de promoción económica de CABA */
  isibPromocion: boolean;
  /** Operaciones exentas de ISIB CABA */
  isibExento: boolean;
  /** ARCA incluyó a la CUIT en el régimen de emisión de comprobantes A con retención */
  sujetaRetencion: boolean;
  /** Otros impuestos nacionales indirectos contenidos en el precio, en % del neto (por defecto 0) */
  otrosNacionalesPct: number;
}

export const DEFAULT_PROFILE: LegendProfile = { isibCaba: "no", isibAlicuota: null, isibPromocion: false, isibExento: false, sujetaRetencion: false, otrosNacionalesPct: 0 };

export function asProfile(raw: unknown): LegendProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<LegendProfile>;
  const alic = Number(r.isibAlicuota);
  const otros = Number(r.otrosNacionalesPct);
  return {
    isibCaba: ["local", "convenio", "simplificado"].includes(r.isibCaba as string) ? (r.isibCaba as LegendProfile["isibCaba"]) : "no",
    isibAlicuota: r.isibAlicuota != null && Number.isFinite(alic) && alic >= 0 && alic <= 30 ? Math.round(alic * 100) / 100 : null,
    isibPromocion: r.isibPromocion === true,
    isibExento: r.isibExento === true,
    sujetaRetencion: r.sujetaRetencion === true,
    otrosNacionalesPct: Number.isFinite(otros) && otros > 0 && otros <= 50 ? Math.round(otros * 100) / 100 : 0,
  };
}

/** Lo que el motor sabe de un comprobante */
export interface LegendInvoice {
  letter: "A" | "B" | "C" | "E" | "M";
  /** Factura de Crédito Electrónica MiPyME (§2.p, B3) */
  fce?: boolean;
  kind: "factura" | "nota_debito" | "nota_credito";
  issuerIva: string;
  customerIva: string;
  issueDate: string;
  net: number;
  iva: number;
  total: number;
}

type Condition = (i: LegendInvoice, p: LegendProfile) => boolean;

const toConsumer = (i: LegendInvoice) => i.customerIva === "consumidor_final";
const isibCaba = (i: LegendInvoice, p: LegendProfile) => toConsumer(i) && (p.isibCaba === "local" || p.isibCaba === "convenio");

/** Condiciones disponibles (una regla nueva elige una) */
export const CONDITIONS: Record<string, { label: string; test: Condition; affects: (p: LegendProfile, issuerIva: string) => boolean }> = {
  transparencia: {
    label: "Responsable inscripto que vende a consumidor final (comprobantes B)",
    test: (i) => toConsumer(i) && i.issuerIva === "responsable_inscripto" && i.letter === "B",
    affects: (_p, iva) => iva === "responsable_inscripto",
  },
  isib_caba_alicuota: {
    label: "Inscripto en ISIB CABA (local o Convenio) que vende a consumidor final, sin exención",
    test: (i, p) => isibCaba(i, p) && !p.isibExento && p.isibAlicuota != null,
    affects: (p) => p.isibCaba === "local" || p.isibCaba === "convenio",
  },
  isib_caba_convenio: {
    label: "Contribuyente de Convenio Multilateral con alícuota CABA que vende a consumidor final",
    test: (i, p) => isibCaba(i, p) && p.isibCaba === "convenio" && !p.isibExento && p.isibAlicuota != null,
    affects: (p) => p.isibCaba === "convenio",
  },
  isib_caba_promocion: {
    label: "Operación alcanzada por un régimen de promoción económica de CABA, a consumidor final",
    test: (i, p) => isibCaba(i, p) && p.isibPromocion,
    affects: (p) => p.isibPromocion,
  },
  isib_caba_exenta: {
    label: "Operación exenta de ISIB CABA, a consumidor final",
    test: (i, p) => isibCaba(i, p) && p.isibExento,
    affects: (p) => p.isibExento,
  },
  sujeta_retencion: {
    label: "CUIT incluida por ARCA en el régimen de comprobantes A con retención",
    test: (i, p) => (p.sujetaRetencion && i.letter === "A") || i.letter === "M",
    affects: (p) => p.sujetaRetencion,
  },
  fce: {
    label: "Factura de Crédito Electrónica MiPyME",
    test: (i) => !!i.fce && i.kind === "factura",
    affects: () => true,
  },
  monotributo: {
    label: "Comprobante C de un monotributista",
    test: (i) => i.letter === "C",
    affects: (_p, iva) => iva === "monotributo",
  },
};

export interface LegendRule {
  key: string;
  jurisdiction: string;
  title: string;
  /** Texto con marcadores: {iva_contenido}, {otros_nacionales}, {alicuota} */
  template: string;
  condition: keyof typeof CONDITIONS | string;
  source: string;
  sourceUrl: string | null;
  status: LegendStatus;
  validFrom: string;
  /** Hasta (para normas con fecha de fin o derogadas) */
  validTo: string | null;
  active: boolean;
  version: number;
  note: string | null;
}

/**
 * Catálogo base (relevado el 12/10/2026). Ninguna se pudo leer en el sitio
 * oficial desde el entorno de Faro: todas quedan «a validar» hasta que un
 * contador las coteje con el Boletín Oficial (ver docs/decisiones.md §2.q).
 */
export const LEGEND_RULES: LegendRule[] = [
  {
    key: "transparencia_fiscal",
    jurisdiction: "Nacional",
    title: "Régimen de Transparencia Fiscal al Consumidor",
    template: "Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)\nIVA Contenido: {iva_contenido}\nOtros Impuestos Nacionales Indirectos: {otros_nacionales}",
    condition: "transparencia",
    source: "Ley 27.743 (Título VII) y RG ARCA 5614/2024: en los comprobantes a consumidores finales, el IVA contenido y los otros impuestos nacionales indirectos, abajo a la izquierda.",
    sourceUrl: "https://www.boletinoficial.gob.ar/detalleAviso/primera/317599/20241217",
    status: "a_validar",
    validFrom: "2025-04-01",
    validTo: null,
    active: true,
    version: 1,
    note: "Grandes empresas desde el 01/01/2025; el resto desde el 01/04/2025.",
  },
  {
    key: "isib_caba_alicuota",
    jurisdiction: "CABA (AGIP)",
    title: "Alícuota de ISIB CABA a consumidor final",
    template: "ALÍCUOTA ISIB CABA {alicuota}",
    condition: "isib_caba_alicuota",
    source: "Res. 169/AGIP/26 (art. 4), modificada por Res. 284/AGIP/26; plazo de adecuación hasta el 30/09/2026 (Res. 312/AGIP/26). Si hay varias alícuotas, va la menor. No alcanza al Régimen Simplificado.",
    sourceUrl: "https://boletinoficial.buenosaires.gob.ar/normativaba/norma/851654",
    status: "a_validar",
    validFrom: "2026-10-01",
    validTo: null,
    active: true,
    version: 1,
    note: null,
  },
  {
    key: "isib_caba_convenio",
    jurisdiction: "CABA (AGIP)",
    title: "Convenio Multilateral: base atribuida a CABA",
    template: "APLICABLE SOBRE INGRESOS BRUTOS ATRIBUIDOS A CABA",
    condition: "isib_caba_convenio",
    source: "Res. 169/AGIP/26 (art. 4): los contribuyentes de Convenio Multilateral agregan esta frase a la alícuota.",
    sourceUrl: "https://boletinoficial.buenosaires.gob.ar/normativaba/norma/851654",
    status: "a_validar",
    validFrom: "2026-10-01",
    validTo: null,
    active: true,
    version: 1,
    note: null,
  },
  {
    key: "isib_caba_promocion",
    jurisdiction: "CABA (AGIP)",
    title: "Operación con promoción económica CABA",
    template: "OPERACIÓN ALCANZADA POR REGÍMENES DE PROMOCIÓN ECONÓMICA CABA",
    condition: "isib_caba_promocion",
    source: "Res. 169/AGIP/26 (art. 4).",
    sourceUrl: "https://boletinoficial.buenosaires.gob.ar/normativaba/norma/851654",
    status: "a_validar",
    validFrom: "2026-10-01",
    validTo: null,
    active: true,
    version: 1,
    note: null,
  },
  {
    key: "isib_caba_exenta",
    jurisdiction: "CABA (AGIP)",
    title: "Operación exenta de ISIB CABA",
    template: "OPERACIÓN EXENTA ISIB CABA",
    condition: "isib_caba_exenta",
    source: "Res. 169/AGIP/26 (art. 4).",
    sourceUrl: "https://boletinoficial.buenosaires.gob.ar/normativaba/norma/851654",
    status: "a_validar",
    validFrom: "2026-10-01",
    validTo: null,
    active: true,
    version: 1,
    note: null,
  },
  {
    key: "sujeta_retencion",
    jurisdiction: "Nacional",
    title: "Factura A sujeta a retención",
    template: "OPERACIÓN SUJETA A RETENCIÓN",
    condition: "sujeta_retencion",
    source: "RG ARCA 5762 (vigente desde el 01/12/2025, reemplazó a la RG 1575): comprobantes A de las CUIT que ARCA incluye en el régimen.",
    sourceUrl: "https://www.arca.gob.ar/facturacion/regimen-general/comprobantes.asp",
    status: "a_validar",
    validFrom: "2025-12-01",
    validTo: null,
    active: true,
    version: 1,
    note: null,
  },
  {
    key: "fce_cbu",
    jurisdiction: "Nacional",
    title: "FCE MiPyME: pago en CBU informada",
    template: "PAGO EN CBU INFORMADA",
    condition: "fce",
    source: "Ley 27.440 y RG 4367/2018 (Factura de Crédito Electrónica MiPyME).",
    sourceUrl: "https://biblioteca.afip.gob.ar/dcp/REAG01004367_2018_12_19",
    status: "a_validar",
    validFrom: "2019-01-01",
    validTo: null,
    active: true,
    version: 1,
    note: "Se agrega sola en las FCE MiPyME (§2.p, B3).",
  },
  {
    key: "monotributo_c",
    jurisdiction: "Nacional",
    title: "Comprobante C de monotributo",
    template: "Comprobante de un responsable monotributo: no discrimina IVA.",
    condition: "monotributo",
    source: "Uso habitual en los comprobantes C (Ley 24.977, Anexo).",
    sourceUrl: null,
    status: "a_validar",
    validFrom: "2000-01-01",
    validTo: null,
    active: true,
    version: 1,
    note: null,
  },
];

const money = (n: number) => `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Se aplica la regla a esa fecha */
const inForce = (r: LegendRule, date: string) => r.active && r.status !== "derogada" && r.validFrom <= date && (!r.validTo || date <= r.validTo);

/** Las líneas que lleva un comprobante, en el orden del catálogo */
export function legendsFor(inv: LegendInvoice, profile: LegendProfile, rules: LegendRule[]): { key: string; lines: string[]; status: LegendStatus }[] {
  const out: { key: string; lines: string[]; status: LegendStatus }[] = [];
  for (const r of rules) {
    const cond = CONDITIONS[r.condition];
    if (!cond || !inForce(r, inv.issueDate) || !cond.test(inv, profile)) continue;
    // IVA contenido: el de un B ya está en el total (en un B el IVA no se discrimina pero existe)
    const otros = Math.round(inv.net * profile.otrosNacionalesPct) / 100;
    const text = r.template
      .replaceAll("{iva_contenido}", money(inv.iva))
      .replaceAll("{otros_nacionales}", money(otros))
      .replaceAll("{alicuota}", profile.isibAlicuota == null ? "—" : `${profile.isibAlicuota.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
    out.push({ key: r.key, lines: text.split("\n").map((l) => l.trim()).filter(Boolean), status: r.status });
  }
  return out;
}

/** ¿A este emisor le puede tocar la regla? (para avisar cuando cambia) */
export const affects = (r: Pick<LegendRule, "condition">, profile: LegendProfile, issuerIva: string) => !!CONDITIONS[r.condition]?.affects(profile, issuerIva);
