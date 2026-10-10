// Planes de Faro (docs/faro-producto.md §2.k y §3): nombres simples, por lo que
// son. Los límites, módulos y precios de referencia de cada plan viven acá, en
// configuración, y se siembran en faro_plans: el Faro Manager los edita (precio
// en USD con conversión a ARS configurable). Las pantallas y las acciones los
// leen con getEntitlements() / getPlans() y nunca los repiten. Archivo sin
// "server-only": lo usan también la landing y el Faro Manager.

import type { FaroModuleKey } from "@/modules/registry";

/** studio: estudios y contadores · personal: autónomos (Faro Personal) · persona: personas (Bitácora) */
export type TenantKind = "studio" | "personal" | "persona";
export type AiLevel = "consultas" | "acciones" | "avanzado";

export interface PlanLimits {
  /** Organizaciones (clientes) incluidas; null = ilimitadas */
  organizations: number | null;
  /** Personas del estudio con acceso al backoffice */
  staffUsers: number | null;
  /** Documentos por mes de lectura inteligente */
  smartDocsPerMonth: number | null;
  /** Flujos activos */
  flows: number | null;
  /** Comprobantes emitidos por mes (Faro Personal) */
  invoicesPerMonth: number | null;
}

export interface FaroPlan {
  key: string;
  kind: TenantKind;
  /** Nombre simple del plan (Gratis, Plus, Pro, Inicial…) */
  name: string;
  tagline: string;
  forWhom: string;
  /** Precio de referencia mensual en USD (0 = gratis). Editable en el Faro Manager */
  priceUsd: number;
  /** USD por organización extra por encima de las incluidas (solo estudios) */
  extraOrgUsd: number | null;
  /** Días de prueba gratis en planes pagos */
  trialDays: number;
  free: boolean;
  recommended?: boolean;
  ai: AiLevel;
  limits: PlanLimits;
  modules: FaroModuleKey[];
  support: string;
}

/** Meses de regalo en el pago anual (se paga 10 de 12) */
export const ANNUAL_FREE_MONTHS = 2;
/** Conversión de referencia USD → ARS si el Faro Manager no cargó otra */
export const DEFAULT_USD_ARS = 1400;

const CORE_STUDIO: FaroModuleKey[] = ["ai", "shared_expenses"];
const NO_LIMITS: PlanLimits = { organizations: 0, staffUsers: 1, smartDocsPerMonth: 0, flows: 0, invoicesPerMonth: null };

export const PLANS: FaroPlan[] = [
  {
    key: "persona_gratis",
    kind: "persona",
    name: "Gratis",
    tagline: "Para llevar tus finanzas y tus gastos con otros.",
    forWhom: "Cualquier persona",
    priceUsd: 0,
    extraOrgUsd: null,
    trialDays: 0,
    free: true,
    ai: "consultas",
    limits: { ...NO_LIMITS },
    modules: ["shared_expenses", "ai"],
    support: "Centro de ayuda",
  },
  {
    key: "persona_plus",
    kind: "persona",
    name: "Plus",
    tagline: "Captura sin límite, WhatsApp, coach y metas.",
    forWhom: "Quien quiere que todo se cargue solo",
    priceUsd: 4,
    extraOrgUsd: null,
    trialDays: 30,
    free: false,
    recommended: true,
    ai: "acciones",
    limits: { ...NO_LIMITS, smartDocsPerMonth: 100 },
    modules: ["shared_expenses", "ai", "smart_docs", "whatsapp"],
    support: "Mail",
  },
  {
    key: "autonomo_gratis",
    kind: "personal",
    name: "Gratis",
    tagline: "Para llevar tus números sin ser contador.",
    forWhom: "Autónomo que arranca",
    priceUsd: 0,
    extraOrgUsd: null,
    trialDays: 0,
    free: true,
    ai: "consultas",
    limits: { ...NO_LIMITS, invoicesPerMonth: 10 },
    modules: ["ai", "shared_expenses", "personal_invoicing", "arca"],
    support: "Comunidad y mail",
  },
  {
    key: "autonomo_pro",
    kind: "personal",
    name: "Pro",
    tagline: "Para facturar sin límite y que todo se cargue solo.",
    forWhom: "Autónomo con movimiento",
    priceUsd: 9,
    extraOrgUsd: null,
    trialDays: 30,
    free: false,
    recommended: true,
    ai: "acciones",
    limits: { ...NO_LIMITS, smartDocsPerMonth: 300 },
    modules: ["ai", "shared_expenses", "personal_invoicing", "arca", "smart_docs", "whatsapp"],
    support: "Mail prioritario",
  },
  {
    key: "inicial",
    kind: "studio",
    name: "Inicial",
    tagline: "Para empezar a ordenar la cartera.",
    forWhom: "Contador independiente que arranca",
    priceUsd: 49,
    extraOrgUsd: 2,
    trialDays: 30,
    free: false,
    ai: "consultas",
    limits: { organizations: 10, staffUsers: 1, smartDocsPerMonth: 30, flows: 1, invoicesPerMonth: null },
    modules: [...CORE_STUDIO, "smart_docs", "flows", "tango_files"],
    support: "Comunidad y mail",
  },
  {
    key: "profesional",
    kind: "studio",
    name: "Profesional",
    tagline: "Para el estudio que crece y quiere automatizar.",
    forWhom: "Estudio chico en crecimiento",
    priceUsd: 119,
    extraOrgUsd: 2,
    trialDays: 30,
    free: false,
    recommended: true,
    ai: "acciones",
    limits: { organizations: 40, staffUsers: 5, smartDocsPerMonth: 1000, flows: 10, invoicesPerMonth: null },
    modules: [...CORE_STUDIO, "smart_docs", "flows", "tango_files", "tango", "arca", "crm", "payroll", "employees", "comms", "billing", "ai_consults", "red_estudios"],
    support: "Mail prioritario",
  },
  {
    key: "avanzado",
    kind: "studio",
    name: "Avanzado",
    tagline: "Para el estudio que quiere operar en piloto automático.",
    forWhom: "Estudio mediano que quiere automatizar",
    priceUsd: 249,
    extraOrgUsd: 2,
    trialDays: 30,
    free: false,
    ai: "avanzado",
    limits: { organizations: 120, staffUsers: 25, smartDocsPerMonth: 10000, flows: null, invoicesPerMonth: null },
    modules: [
      ...CORE_STUDIO,
      "smart_docs",
      "flows",
      "tango_files",
      "tango",
      "arca",
      "crm",
      "payroll",
      "employees",
      "comms",
      "billing",
      "ai_consults",
      "red_estudios",
      "bank_rec",
      "insights",
      "whatsapp",
      "white_label",
    ],
    support: "Dedicado",
  },
];

export const getPlan = (key: string | null | undefined) => PLANS.find((p) => p.key === key);
export const plansFor = (kind: TenantKind) => PLANS.filter((p) => p.kind === kind);
export const DEFAULT_PLAN: Record<TenantKind, string> = { studio: "inicial", personal: "autonomo_gratis", persona: "persona_gratis" };

export const KIND_LABEL: Record<TenantKind, string> = { studio: "Estudio", personal: "Autónomo", persona: "Persona" };
/** Para quién es cada familia de planes */
export const KIND_PLANS_LABEL: Record<TenantKind, string> = { studio: "Estudios y contadores", personal: "Autónomos", persona: "Personas" };

/** "Autónomos · Pro", "Estudios · Inicial" */
export const planFullName = (p: Pick<FaroPlan, "kind" | "name">) => `${KIND_PLANS_LABEL[p.kind]} · ${p.name}`;

export const formatUsd = (n: number) => `USD ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
export const formatArs = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;

/** Precio mensual visible: "Gratis" o "USD 49 / mes" (con ARS si se pasa la conversión) */
export function priceLabel(p: Pick<FaroPlan, "free" | "priceUsd">, usdArs?: number) {
  if (p.free || !p.priceUsd) return "Gratis";
  return usdArs ? `${formatArs(p.priceUsd * usdArs)} / mes` : `${formatUsd(p.priceUsd)} / mes`;
}

/** Precio anual (con los meses de regalo) */
export const annualUsd = (p: Pick<FaroPlan, "priceUsd">) => p.priceUsd * (12 - ANNUAL_FREE_MONTHS);

export const AI_LEVEL_LABEL: Record<AiLevel, string> = {
  consultas: "Con clave propia: consultas",
  acciones: "Con clave propia: consultas y acciones con aprobación",
  avanzado: "Acciones avanzadas y agentes",
};
