// Planes de Faro (docs/faro-producto.md §2.c y §3). Los límites y los módulos de
// cada plan viven acá, en configuración: las pantallas y las acciones los leen
// con getEntitlements() y nunca los repiten. Archivo sin "server-only": lo usan
// también la landing y el Faro Manager.

import type { FaroModuleKey } from "./modules";

export type TenantKind = "studio" | "personal";
export type AiLevel = "consultas" | "acciones" | "avanzado";

export interface PlanLimits {
  /** Organizaciones (clientes) del estudio; null = ilimitadas */
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
  name: string;
  tagline: string;
  forWhom: string;
  /** Precio mensual de referencia en ARS (null = a definir) */
  priceArs: number | null;
  free: boolean;
  recommended?: boolean;
  ai: AiLevel;
  limits: PlanLimits;
  modules: FaroModuleKey[];
  support: string;
}

const CORE_STUDIO: FaroModuleKey[] = ["ai", "shared_expenses"];

export const PLANS: FaroPlan[] = [
  {
    key: "senal",
    kind: "studio",
    name: "Señal",
    tagline: "Para empezar a ordenar la cartera.",
    forWhom: "Contador independiente que arranca",
    priceArs: 0,
    free: true,
    ai: "consultas",
    limits: { organizations: 5, staffUsers: 1, smartDocsPerMonth: 30, flows: 1, invoicesPerMonth: null },
    modules: [...CORE_STUDIO, "smart_docs", "flows", "tango_files"],
    support: "Comunidad y mail",
  },
  {
    key: "rumbo",
    kind: "studio",
    name: "Rumbo",
    tagline: "Para el estudio que crece y quiere automatizar.",
    forWhom: "Estudio chico en crecimiento",
    priceArs: null,
    free: false,
    recommended: true,
    ai: "acciones",
    limits: { organizations: 60, staffUsers: 5, smartDocsPerMonth: 1000, flows: 10, invoicesPerMonth: null },
    modules: [...CORE_STUDIO, "smart_docs", "flows", "tango_files", "tango", "arca", "crm", "payroll", "employees", "comms", "billing", "ai_consults"],
    support: "Mail prioritario",
  },
  {
    key: "horizonte",
    kind: "studio",
    name: "Horizonte",
    tagline: "Para el estudio que quiere operar en piloto automático.",
    forWhom: "Estudio mediano que quiere automatizar",
    priceArs: null,
    free: false,
    ai: "avanzado",
    limits: { organizations: null, staffUsers: 25, smartDocsPerMonth: 10000, flows: null, invoicesPerMonth: null },
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
      "bank_rec",
      "insights",
      "whatsapp",
      "white_label",
    ],
    support: "Dedicado",
  },
  {
    key: "destello",
    kind: "personal",
    name: "Destello",
    tagline: "Para llevar tus números sin ser contador.",
    forWhom: "Autónomo que arranca",
    priceArs: 0,
    free: true,
    ai: "consultas",
    limits: { organizations: 0, staffUsers: 1, smartDocsPerMonth: 0, flows: 0, invoicesPerMonth: 10 },
    modules: ["ai", "shared_expenses", "personal_invoicing", "arca"],
    support: "Comunidad y mail",
  },
  {
    key: "guia",
    kind: "personal",
    name: "Guía",
    tagline: "Para facturar sin límite y que todo se cargue solo.",
    forWhom: "Autónomo con movimiento",
    priceArs: null,
    free: false,
    recommended: true,
    ai: "acciones",
    limits: { organizations: 0, staffUsers: 1, smartDocsPerMonth: 300, flows: 0, invoicesPerMonth: null },
    modules: ["ai", "shared_expenses", "personal_invoicing", "arca", "smart_docs", "whatsapp"],
    support: "Mail prioritario",
  },
];

export const getPlan = (key: string | null | undefined) => PLANS.find((p) => p.key === key);
export const plansFor = (kind: TenantKind) => PLANS.filter((p) => p.kind === kind);
export const DEFAULT_PLAN: Record<TenantKind, string> = { studio: "senal", personal: "destello" };

export const KIND_LABEL: Record<TenantKind, string> = { studio: "Estudio", personal: "Autónomo" };

export const priceLabel = (p: FaroPlan) => (p.free ? "Gratis" : p.priceArs ? `$ ${p.priceArs.toLocaleString("es-AR")} / mes` : "Consultá el precio");

export const AI_LEVEL_LABEL: Record<AiLevel, string> = {
  consultas: "Con clave propia: consultas",
  acciones: "Con clave propia: consultas y acciones con aprobación",
  avanzado: "Acciones avanzadas y agentes",
};
