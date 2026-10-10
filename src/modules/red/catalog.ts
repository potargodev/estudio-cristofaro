// Red de estudios: listas cerradas de la ficha (sin base de datos; las usan el
// directorio público, los filtros y el editor del estudio).

export const MODALITIES = [
  { key: "presencial", label: "Presencial" },
  { key: "remoto", label: "Remoto" },
  { key: "ambas", label: "Presencial y remoto" },
] as const;

export const TEAM_SIZES = [
  { key: "unipersonal", label: "Contador independiente" },
  { key: "2-5", label: "Estudio chico (2 a 5)" },
  { key: "6-15", label: "Estudio mediano (6 a 15)" },
  { key: "16+", label: "Estudio grande (16 o más)" },
] as const;

export const RED_SERVICES = [
  { key: "monotributo", label: "Monotributo" },
  { key: "responsable_inscripto", label: "Responsables inscriptos" },
  { key: "sociedades", label: "Sociedades" },
  { key: "sueldos", label: "Sueldos y cargas sociales" },
  { key: "ganancias_personas", label: "Ganancias y Bienes Personales" },
  { key: "facturacion", label: "Facturación electrónica" },
  { key: "auditoria", label: "Auditoría y balances" },
  { key: "societario", label: "Trámites societarios" },
  { key: "planificacion", label: "Planificación fiscal" },
  { key: "exportaciones", label: "Exportación de servicios" },
] as const;

export const PROVINCES = [
  "CABA",
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
] as const;

export const LICENSE_STATUS_LABEL = { sin_cargar: "Sin cargar", pendiente: "En verificación", verificada: "Verificada", rechazada: "Rechazada" } as const;

export const labelOf = (list: readonly { key: string; label: string }[], k: string | null | undefined) => list.find((x) => x.key === k)?.label ?? k ?? "";

export function responseLabel(h: number | null | undefined) {
  if (h == null) return "Sin datos todavía";
  if (h < 1) return "Responde en menos de una hora";
  if (h <= 24) return `Responde en ${Math.round(h)} h en promedio`;
  return `Responde en ${Math.round(h / 24)} días en promedio`;
}
