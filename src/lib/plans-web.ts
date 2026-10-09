// Planes tal como se muestran en la web (docs/home-contenido.md, sección 7).
import { PLAN_PRICES } from "./home";

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

export function priceLabel(key: string) {
  const p = PLAN_PRICES[key];
  return p ? `desde ${p}/mes` : "Consultá el precio";
}

