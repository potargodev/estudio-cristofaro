// Red Contable: listas cerradas de la ficha (sin base de datos; las usan el
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
  { key: "asesoramiento_financiero", label: "Asesoramiento financiero (idóneo CNV)" },
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

/** Centro aproximado de cada provincia (lat, lng) para el mapa de la Red */
export const PROVINCE_COORDS: Record<(typeof PROVINCES)[number], [number, number]> = {
  CABA: [-34.6, -58.4],
  "Buenos Aires": [-36.7, -60.5],
  Catamarca: [-27.3, -66.9],
  Chaco: [-26.4, -60.8],
  Chubut: [-43.8, -68.5],
  Córdoba: [-31.4, -64.2],
  Corrientes: [-28.8, -57.9],
  "Entre Ríos": [-32.0, -59.2],
  Formosa: [-24.9, -60.0],
  Jujuy: [-23.3, -65.7],
  "La Pampa": [-37.1, -65.4],
  "La Rioja": [-29.7, -67.2],
  Mendoza: [-34.6, -68.5],
  Misiones: [-26.9, -54.6],
  Neuquén: [-38.6, -70.1],
  "Río Negro": [-40.0, -67.3],
  Salta: [-24.8, -65.4],
  "San Juan": [-30.9, -68.9],
  "San Luis": [-33.7, -66.0],
  "Santa Cruz": [-48.8, -69.9],
  "Santa Fe": [-30.7, -60.9],
  "Santiago del Estero": [-27.8, -63.3],
  "Tierra del Fuego": [-54.3, -67.7],
  Tucumán: [-26.9, -65.3],
};
