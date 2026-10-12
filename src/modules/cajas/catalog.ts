// Cajas (docs/principios-producto.md §10, §11, §16, §17 y §18): una sola
// cuenta, varias cajas. Cada caja es un mundo cerrado con su gente, su plata
// y su propósito; entre cajas solo pasa plata con un movimiento explícito (el
// sueldo del dueño o un aporte). Archivo sin "server-only".

export type BoxKind = "personal" | "negocio" | "compartida";
type SharedPurpose = "pareja" | "familia" | "amigos" | "negocio" | "padres";

interface Category {
  key: string;
  name: string;
  kind: "gasto" | "ingreso" | "ahorro";
}

/** Categorías de la caja de negocio */
export const BUSINESS_CATEGORIES: Category[] = [
  { key: "ventas", name: "Ventas y cobros", kind: "ingreso" },
  { key: "changa", name: "Changa o freelance (sin facturar)", kind: "ingreso" },
  { key: "software", name: "Software y suscripciones", kind: "gasto" },
  { key: "oficina", name: "Oficina y librería", kind: "gasto" },
  { key: "servicios", name: "Servicios (internet, teléfono, luz)", kind: "gasto" },
  { key: "insumos", name: "Insumos y mercadería", kind: "gasto" },
  { key: "transporte", name: "Transporte y viáticos", kind: "gasto" },
  { key: "impuestos", name: "Impuestos y monotributo", kind: "gasto" },
  { key: "profesionales", name: "Honorarios profesionales", kind: "gasto" },
  { key: "capacitacion", name: "Capacitación", kind: "gasto" },
  { key: "publicidad", name: "Publicidad", kind: "gasto" },
  { key: "otros", name: "Otros", kind: "gasto" },
];

/** Movimientos entre cajas (no son gastos ni ingresos de la actividad) */
export const TRANSFER_KINDS = { retiro: "Sueldo del dueño", aporte: "Aporte" } as const;

interface SharedTemplate {
  purpose: SharedPurpose;
  name: string;
  /** Para qué es (se muestra al elegir) */
  description: string;
  /** Quién puede participar */
  who: string;
  categories: Category[];
  /** Cómo se lee el desglose */
  breakdown: string;
  /** Final por defecto al cargar */
  defaultMode: "registrar" | "dividir";
}

const ahorro: Category = { key: "ahorro", name: "Ahorro para una meta", kind: "ahorro" };

/** Opciones prearmadas (§18.2): el usuario elige una, sin configurar ni ponerle nombre */
export const SHARED_TEMPLATES: SharedTemplate[] = [
  {
    purpose: "pareja",
    name: "Pareja",
    description: "Los gastos en común, el alquiler, la mascota, las salidas y los ahorros de los dos.",
    who: "Vos y tu pareja",
    categories: [
      { key: "alquiler", name: "Alquiler y expensas", kind: "gasto" },
      { key: "super", name: "Supermercado", kind: "gasto" },
      { key: "servicios", name: "Servicios de la casa", kind: "gasto" },
      { key: "salidas", name: "Salidas y comidas", kind: "gasto" },
      { key: "mascota", name: "Mascota", kind: "gasto" },
      { key: "viajes", name: "Viajes", kind: "gasto" },
      { key: "otros", name: "Otros", kind: "gasto" },
      ahorro,
    ],
    breakdown: "Quién puso cuánto en cada cosa y si están a mano.",
    defaultMode: "registrar",
  },
  {
    purpose: "familia",
    name: "Familia",
    description: "La contabilidad de la casa, con ahorros separados por meta: la facultad, el auto, los quince.",
    who: "Tu familia",
    categories: [
      { key: "casa", name: "Casa y servicios", kind: "gasto" },
      { key: "super", name: "Supermercado", kind: "gasto" },
      { key: "colegio", name: "Colegio y educación", kind: "gasto" },
      { key: "salud", name: "Salud", kind: "gasto" },
      { key: "auto", name: "Auto", kind: "gasto" },
      { key: "vacaciones", name: "Vacaciones", kind: "gasto" },
      { key: "otros", name: "Otros", kind: "gasto" },
      ahorro,
    ],
    breakdown: "Cuánto aportó cada uno y cómo van las metas.",
    defaultMode: "registrar",
  },
  {
    purpose: "amigos",
    name: "Amigos",
    description: "Las juntadas, el asado, el regalo en común o el viaje con amigos.",
    who: "Tus amigos",
    categories: [
      { key: "comidas", name: "Comidas y juntadas", kind: "gasto" },
      { key: "regalos", name: "Regalos", kind: "gasto" },
      { key: "viajes", name: "Viajes", kind: "gasto" },
      { key: "entradas", name: "Entradas y salidas", kind: "gasto" },
      { key: "otros", name: "Otros", kind: "gasto" },
      ahorro,
    ],
    breakdown: "Quién puso qué y quién le debe a quién.",
    defaultMode: "dividir",
  },
  {
    purpose: "negocio",
    name: "Negocio con otros",
    description: "Lo que ponen los socios en un emprendimiento compartido: aportes, gastos e ingresos.",
    who: "Tus socios",
    categories: [
      { key: "aportes", name: "Aportes de los socios", kind: "ingreso" },
      { key: "ventas", name: "Ventas y cobros", kind: "ingreso" },
      { key: "insumos", name: "Insumos y mercadería", kind: "gasto" },
      { key: "servicios", name: "Servicios", kind: "gasto" },
      { key: "impuestos", name: "Impuestos", kind: "gasto" },
      { key: "otros", name: "Otros", kind: "gasto" },
      ahorro,
    ],
    breakdown: "Cuánto aportó cada socio y en qué se fue.",
    defaultMode: "registrar",
  },
  {
    purpose: "padres",
    name: "Padres y abuelos",
    description: "Para sostener a los padres o a los abuelos: remedios, cuidadora, alquiler, lo que haga falta.",
    who: "Cualquiera que ayude: hermanos, cuñados, primos, sobrinos, nietos",
    categories: [
      { key: "remedios", name: "Remedios y salud", kind: "gasto" },
      { key: "cuidadora", name: "Cuidadora", kind: "gasto" },
      { key: "casa", name: "Casa y servicios", kind: "gasto" },
      { key: "super", name: "Supermercado", kind: "gasto" },
      { key: "obra_social", name: "Obra social o prepaga", kind: "gasto" },
      { key: "otros", name: "Otros", kind: "gasto" },
      ahorro,
    ],
    breakdown: "Quién puso cuánto, en qué se gastó y si están a mano.",
    defaultMode: "registrar",
  },
];

export const templateOf = (p: string | null | undefined) => SHARED_TEMPLATES.find((t) => t.purpose === p) ?? null;

export const categoriesFor = (kind: BoxKind, purpose?: string | null): Category[] => (kind === "negocio" ? BUSINESS_CATEGORIES : (templateOf(purpose)?.categories ?? []));

export const categoryName = (kind: BoxKind, purpose: string | null | undefined, key: string) => categoriesFor(kind, purpose).find((c) => c.key === key)?.name ?? "Otros";

export const SALARY_FREQUENCIES = { mensual: "Mensual", quincenal: "Cada 15 días", semanal: "Semanal" } as const;
export type SalaryFrequency = keyof typeof SALARY_FREQUENCIES;

/** Próxima fecha de un sueldo (YYYY-MM-DD) */
export function nextSalaryDate(from: string, f: SalaryFrequency) {
  const d = new Date(`${from}T12:00:00Z`);
  if (f === "semanal") d.setUTCDate(d.getUTCDate() + 7);
  else if (f === "quincenal") d.setUTCDate(d.getUTCDate() + 15);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Palabras que hacen pensar que un gasto personal es del negocio (§10): la
 * licencia de un software, algo de oficina. Solo para sugerir moverlo.
 */
const BUSINESS_HINTS = [
  "licencia", "software", "hosting", "dominio", "servidor", "adobe", "figma", "canva", "github", "notion", "slack", "zoom", "google workspace", "microsoft 365", "office 365", "aws", "vercel", "chatgpt", "openai", "claude", "jetbrains",
  "oficina", "libreria", "resma", "toner", "cartucho", "impresora", "carpeta", "papeleria", "coworking", "monotributo", "factura c", "mercaderia", "insumos", "proveedor", "honorarios",
];

const norm = (t: string) => ` ${t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ")} `;

/** ¿Este gasto personal parece del negocio? Devuelve la pista que lo delata */
export function looksLikeBusiness(description: string, note?: string | null): string | null {
  const t = norm(`${description} ${note ?? ""}`);
  return BUSINESS_HINTS.find((h) => t.includes(` ${h} `) || t.includes(` ${h}`)) ?? null;
}

/** Categoría de negocio sugerida para un gasto que se mueve */
export function businessCategoryFor(description: string): string {
  const t = norm(description);
  if (/licencia|software|hosting|dominio|servidor|adobe|figma|canva|github|notion|slack|zoom|workspace|365|aws|vercel|chatgpt|openai|claude|jetbrains/.test(t)) return "software";
  if (/oficina|libreria|resma|toner|cartucho|impresora|carpeta|papeleria|coworking/.test(t)) return "oficina";
  if (/monotributo|factura/.test(t)) return "impuestos";
  if (/mercaderia|insumos|proveedor/.test(t)) return "insumos";
  if (/honorarios/.test(t)) return "profesionales";
  return "otros";
}

/**
 * Sueldo sugerido como dato (§11 y §1.a): con el resultado promedio de los
 * últimos meses del negocio, una cifra que deja un margen en la caja. Nunca
 * es una recomendación profesional.
 */
export function suggestedSalary(monthlyResults: number[], keep = 0.3): { average: number; suggestion: number } | null {
  const months = monthlyResults.filter((n) => Number.isFinite(n));
  if (months.length === 0) return null;
  const average = Math.round(months.reduce((s, n) => s + n, 0) / months.length);
  if (average <= 0) return { average, suggestion: 0 };
  return { average, suggestion: Math.floor((average * (1 - keep)) / 100_000) * 100_000 };
}
