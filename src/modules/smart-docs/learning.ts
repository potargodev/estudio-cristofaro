// Aprendizaje por proveedor de la lectura inteligente (§2.q, etapa 2): lo que
// la persona corrige al confirmar (cuenta, centro de costo, tratamiento de
// percepciones, alícuota de los ítems, concepto y producto propio vinculado)
// queda como regla del proveedor y se propone en el próximo comprobante, con
// la marca «aprendido de tus correcciones» y la opción de deshacer. Puro.

import type { Extraction } from "./core";
import { defaultTreatment, tributoKey, type Tratamiento, type TributoTipo } from "./tributos";

/** Decisiones de la persona sobre un comprobante, además de lo extraído */
export interface Decisions {
  account: string | null;
  costCenter: string | null;
  /** Tratamiento por tributo («iibb:CABA» → pago_a_cuenta) */
  treatments: Record<string, Tratamiento>;
  /** Concepto del gasto («Energía eléctrica») */
  concept: string | null;
  /** Código del proveedor → producto propio (Stock, etapa 7) */
  productLinks: Record<string, string>;
}

export interface SupplierRule {
  account?: string | null;
  costCenter?: string | null;
  treatments?: Record<string, Tratamiento>;
  /** Alícuota de IVA de los ítems de este proveedor */
  itemRate?: number | null;
  concept?: string | null;
  productLinks?: Record<string, string>;
}

/** Lo que se propone sin reglas: cuenta sugerida y tratamientos por defecto */
export function baseDecisions(e: Extraction, account: string): Decisions {
  const treatments: Record<string, Tratamiento> = {};
  for (const p of [...e.percepciones, ...(e.retenciones ?? [])]) treatments[tributoKey(p)] = defaultTreatment((p.tipo ?? "otros") as TributoTipo);
  return { account, costCenter: null, treatments, concept: null, productLinks: {} };
}

/** Aplica la regla del proveedor: devuelve lo propuesto y qué campos salieron de la regla */
export function applyRule(e: Extraction, d: Decisions, rule: SupplierRule | null): { extraction: Extraction; decisions: Decisions; learned: string[] } {
  if (!rule) return { extraction: e, decisions: d, learned: [] };
  const learned: string[] = [];
  const decisions: Decisions = { ...d, treatments: { ...d.treatments }, productLinks: { ...d.productLinks } };
  if (rule.account && rule.account !== d.account) {
    decisions.account = rule.account;
    learned.push("cuenta");
  }
  if (rule.costCenter && rule.costCenter !== d.costCenter) {
    decisions.costCenter = rule.costCenter;
    learned.push("centro_costo");
  }
  if (rule.concept && rule.concept !== d.concept) {
    decisions.concept = rule.concept;
    learned.push("concepto");
  }
  for (const [k, v] of Object.entries(rule.treatments ?? {})) {
    if (k in decisions.treatments && decisions.treatments[k] !== v) {
      decisions.treatments[k] = v;
      if (!learned.includes("tratamiento")) learned.push("tratamiento");
    }
  }
  let items = e.items;
  if (rule.itemRate != null && e.items.some((i) => i.alicuota !== rule.itemRate)) {
    items = e.items.map((i) => ({ ...i, alicuota: rule.itemRate! }));
    learned.push("alicuota");
  }
  for (const it of e.items) {
    const p = it.codigo ? rule.productLinks?.[it.codigo] : null;
    if (p && decisions.productLinks[it.codigo!] !== p) {
      decisions.productLinks[it.codigo!] = p;
      if (!learned.includes("producto")) learned.push("producto");
    }
  }
  return { extraction: { ...e, items }, decisions, learned };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Campos de lo extraído que se comparan para medir la precisión */
const EXTRACTION_KEYS = ["cuit_emisor", "razon_social_emisor", "codigo_comprobante", "punto_venta", "numero", "fecha", "neto_gravado", "no_gravado", "exento", "total", "cae", "vencimiento_cae"] as const;

/**
 * Qué corrigió la persona respecto de lo propuesto (lo que leyó el modelo más
 * las reglas) y la regla nueva del proveedor con lo que corrigió.
 */
export function learnFrom(proposed: { extraction: Extraction; decisions: Decisions }, final: { extraction: Extraction; decisions: Decisions }, previous: SupplierRule | null): { corrected: string[]; rule: SupplierRule | null } {
  const corrected: string[] = [];
  for (const k of EXTRACTION_KEYS) if (!same(proposed.extraction[k], final.extraction[k])) corrected.push(k);
  const pd = proposed.decisions;
  const fd = final.decisions;
  const rule: SupplierRule = { ...(previous ?? {}) };
  let changed = false;
  if (!same(pd.account, fd.account)) {
    corrected.push("cuenta");
    rule.account = fd.account;
    changed = true;
  }
  if (!same(pd.costCenter, fd.costCenter)) {
    corrected.push("centro_costo");
    rule.costCenter = fd.costCenter;
    changed = true;
  }
  if (!same(pd.concept, fd.concept)) {
    corrected.push("concepto");
    rule.concept = fd.concept;
    changed = true;
  }
  const diffT = Object.keys(fd.treatments).filter((k) => pd.treatments[k] !== fd.treatments[k]);
  if (diffT.length) {
    corrected.push("tratamiento");
    rule.treatments = { ...(rule.treatments ?? {}), ...Object.fromEntries(diffT.map((k) => [k, fd.treatments[k]])) };
    changed = true;
  }
  const rates = new Set(final.extraction.items.map((i) => i.alicuota).filter((x): x is number => x != null));
  const rateChanged = final.extraction.items.some((it, i) => proposed.extraction.items[i] && proposed.extraction.items[i].alicuota !== it.alicuota);
  if (rateChanged) {
    corrected.push("alicuota");
    if (rates.size === 1) {
      rule.itemRate = [...rates][0];
      changed = true;
    }
  }
  const diffP = Object.keys(fd.productLinks).filter((k) => pd.productLinks[k] !== fd.productLinks[k]);
  if (diffP.length) {
    corrected.push("producto");
    rule.productLinks = { ...(rule.productLinks ?? {}), ...Object.fromEntries(diffP.map((k) => [k, fd.productLinks[k]])) };
    changed = true;
  }
  return { corrected, rule: changed ? rule : null };
}

export const LEARNED_LABEL: Record<string, string> = {
  cuenta: "cuenta",
  centro_costo: "centro de costo",
  concepto: "concepto",
  tratamiento: "tratamiento de percepciones",
  alicuota: "alícuota de los ítems",
  producto: "producto vinculado",
};
