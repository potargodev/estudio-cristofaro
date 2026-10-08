import type { clients, leads, userRole } from "@/db/schema";

export type LeadStatus = "nuevo" | "contactado" | "presupuesto" | "ganado" | "perdido";
export type LeadSource = "diagnostico" | "contacto" | "whatsapp" | "manual" | "otro";
export type TaxRegime = "monotributo" | "responsable_inscripto" | "sociedad" | "exento" | "otro";

// Filas tal como las devuelve Drizzle (fechas como Date, numeric como string).
export type Lead = typeof leads.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];

// Contenidos públicos: mismo formato para la base y para el respaldo de src/lib/content.ts.
export interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  published: boolean;
  published_at: string | null;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  position: number;
  published: boolean;
}

export interface Plan {
  id: string;
  name: string;
  segment: string | null;
  price_label: string | null;
  description: string | null;
  features: string[];
  highlighted: boolean;
  position: number;
  published: boolean;
}

export const ROLES: Record<UserRole, string> = {
  admin: "Administrador",
  contador: "Contador",
  cliente: "Cliente",
};

export const LEAD_STATUSES: { value: LeadStatus; label: string }[] = [
  { value: "nuevo", label: "Nuevas" },
  { value: "contactado", label: "Contactadas" },
  { value: "presupuesto", label: "Presupuesto enviado" },
  { value: "ganado", label: "Ganadas" },
  { value: "perdido", label: "Perdidas" },
];

export const LEAD_SOURCES: Record<LeadSource, string> = {
  diagnostico: "Diagnóstico web",
  contacto: "Formulario de contacto",
  whatsapp: "WhatsApp",
  manual: "Carga manual",
  otro: "Otro",
};

export const REGIMES: Record<TaxRegime, string> = {
  monotributo: "Monotributo",
  responsable_inscripto: "Responsable Inscripto",
  sociedad: "Sociedad",
  exento: "Exento",
  otro: "Otro",
};

export const CONTRIBUTOR_TYPES: Record<string, string> = {
  monotributista: "Monotributista",
  responsable_inscripto: "Responsable Inscripto",
  sociedad: "Sociedad (SAS, SRL, SA)",
  empleador: "Empleador",
  emprendedor: "Estoy por empezar",
  otro: "Otro / no sé",
};
