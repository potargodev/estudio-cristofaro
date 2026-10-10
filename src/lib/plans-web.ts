// Planes tal como se muestran en la web (docs/home-contenido.md, sección 7).
import { SERVICE_PLANS } from "./service-plans";

export const HOME_PLANS = [
  {
    key: "negocio_en_orden",
    name: "Negocio en Orden",
    bullets: ["1 razón social y hasta 5 usuarios", "Vencimientos, documentos y solicitudes", "Resumen mensual y revisión trimestral", "Responsable asignado", "1 módulo"],
  },
  {
    key: "empresa_en_control",
    name: "Empresa en Control",
    featured: true,
    bullets: ["Hasta 2 razones sociales y 12 usuarios", "Roles por área", "Tablero y reunión mensual", "Automatizaciones", "Hasta 3 módulos y atención prioritaria"],
  },
  {
    key: "gestion_estrategica",
    name: "Gestión Estratégica",
    bullets: ["Hasta 5 razones sociales y 25 usuarios", "Equipo asignado e informe ejecutivo", "Planificación fiscal y proyecciones", "Indicadores personalizados", "Hasta 5 módulos"],
  },
] as const;

export const PLAN_ROWS: [string, string, string, string][] = [
  ["Razones sociales", "1", "Hasta 2", "Hasta 5"],
  ["Usuarios", "Hasta 5", "Hasta 12", "Hasta 25"],
  ["Vencimientos, documentos y solicitudes", "Incluido", "Incluido", "Incluido"],
  ["Seguimiento", "Resumen mensual y revisión trimestral", "Tablero y reunión mensual", "Informe ejecutivo"],
  ["Atención", "Responsable asignado", "Prioritaria, con roles por área", "Equipo asignado"],
  ["Automatizaciones", "—", "Incluido", "Incluido"],
  ["Planificación fiscal y proyecciones", "—", "—", "Incluido"],
  ["Indicadores", "—", "Operativos", "Personalizados"],
  ["Módulos", "1", "Hasta 3", "Hasta 5"],
];

export const MODULES = [
  "Sueldos y empleados",
  "Cuentas por cobrar",
  "Cuentas por pagar",
  "Flujo de fondos",
  "Documentación societaria",
  "Facturación",
  "Indicadores de gestión",
  "Novedades de personal",
];

/** Precio para mostrar: el cargado en el backoffice o "Consultá el precio" */
export function priceLabel(key: string, prices: Record<string, string | null> = {}) {
  const raw = prices[key];
  // Separador de miles en los importes cargados sin puntos ("$845130" → "$845.130")
  return raw ? raw.replace(/\d{4,}/g, (n) => Number(n).toLocaleString("es-AR")) : "Consultá el precio";
}


/**
 * Comparación completa para /planes: límites y cada prestación de
 * SERVICE_PLANS (los "Todo lo de …" se expanden a lo que incluyen).
 */
export function fullPlanRows(): [string, string, string, string][] {
  const included: string[][] = [];
  let acc: string[] = [];
  for (const p of SERVICE_PLANS) {
    acc = [...acc, ...p.features.filter((f) => !f.startsWith("Todo lo de"))];
    included.push(acc);
  }
  const features = [...new Set(included.flat())];
  const lim = (n: number, i: number) => (i === 0 ? String(n) : `Hasta ${n}`);
  return [
    ["Razones sociales", ...SERVICE_PLANS.map((p, i) => lim(p.max_legal_entities, i))] as [string, string, string, string],
    ["Usuarios", ...SERVICE_PLANS.map((p) => `Hasta ${p.max_users}`)] as [string, string, string, string],
    ["Módulos incluidos", ...SERVICE_PLANS.map((p, i) => lim(p.max_modules, i))] as [string, string, string, string],
    ...features.map((f) => [f, ...included.map((list) => (list.includes(f) ? "Incluido" : "—"))] as [string, string, string, string]),
  ];
}
