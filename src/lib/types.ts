export type LeadStatus = "nuevo" | "contactado" | "presupuesto" | "ganado" | "perdido";
export type LeadSource = "diagnostico" | "contacto" | "whatsapp" | "manual" | "otro";
export type TaxRegime = "monotributo" | "responsable_inscripto" | "sociedad" | "exento" | "otro";

export interface Lead {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  contributor_type: string | null;
  activity: string | null;
  employees: string | null;
  needs: string[];
  message: string | null;
  source: LeadSource;
  status: LeadStatus;
  assigned_to: string | null;
  next_action: string | null;
  next_action_at: string | null;
  notes: string | null;
  lost_reason: string | null;
  client_id: string | null;
}

export interface Client {
  id: string;
  created_at: string;
  business_name: string;
  cuit: string | null;
  regime: TaxRegime;
  category: string | null;
  services: string[];
  monthly_fee: number | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  lead_id: string | null;
}

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

export interface Profile {
  id: string;
  studio_id: string;
  full_name: string | null;
  role: "admin" | "contador" | "cliente";
}

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
