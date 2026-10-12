// Catálogo de tareas del Agente contable (§2.q). Sin "server-only": lo usan la
// pantalla (plantillas de tareas frecuentes) y el servidor (plan y hallazgos).
// Cada etapa de §2.q suma acá sus tareas; el plan de cada una se arma en
// plans.ts con las herramientas registradas.

import type { FaroModuleKey } from "@/modules/registry";

export type AgentScope = "organizacion" | "cartera" | "personal";

export interface AgentTemplate {
  key: string;
  title: string;
  description: string;
  /** Ejemplo para la pantalla (y para el pedido libre) */
  example: string;
  scopes: AgentScope[];
  /** Parámetros que necesita: período (AAAA-MM) o fecha (AAAA-MM-DD) */
  needs: ("periodo" | "fecha")[];
  /** Módulo del plan que además del Agente tiene que estar activo */
  module?: FaroModuleKey;
  /** Palabras del pedido libre que la eligen (en orden de prioridad del catálogo) */
  keywords: RegExp;
  /** Se puede programar como rutina */
  routine?: boolean;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    key: "cierre_mensual",
    title: "Cierre del mes",
    description: "Revisa vencimientos, comprobantes para confirmar, conciliación y el Libro IVA del período; deja hallazgos, tareas y el resumen mensual como borrador.",
    example: "Cerrá octubre de Agencia Norte",
    scopes: ["organizacion", "cartera"],
    needs: ["periodo"],
    keywords: /\bcerr[aáeé]|\bcierre\b/,
    routine: true,
  },
  {
    key: "revision_iva",
    title: "Revisión del crédito fiscal (IVA)",
    description: "Antes del vencimiento: analiza el Libro IVA compras y ventas de cada cliente (anomalías y lo que falta para presentar), los comprobantes sin confirmar y el vencimiento.",
    example: "Revisá el crédito fiscal de todos mis clientes antes del vencimiento",
    scopes: ["organizacion", "cartera"],
    needs: ["periodo"],
    keywords: /cr[eé]dito fiscal|\biva\b|libro iva/,
    routine: true,
  },
  {
    key: "conciliar_extracto",
    title: "Conciliación del extracto",
    description: "Estado del último extracto: movimientos sin conciliar o sugeridos, pagos sin factura, comisiones e impuestos.",
    example: "Conciliá el extracto de septiembre",
    scopes: ["organizacion", "cartera"],
    needs: ["periodo"],
    module: "bank_rec",
    keywords: /concili/,
    routine: true,
  },
  {
    key: "tope_monotributo",
    title: "Clientes cerca del tope del monotributo",
    description: "Facturación de los últimos 12 meses contra el tope de la categoría de cada monotributista, según lo cargado.",
    example: "¿Qué clientes están cerca del tope del monotributo?",
    scopes: ["cartera", "organizacion", "personal"],
    needs: [],
    keywords: /tope|monotribut|recategoriz/,
    routine: true,
  },
  {
    key: "resumen_mensual",
    title: "Resumen mensual para los clientes",
    description: "Prepara el resumen del mes de cada cliente y lo deja en Propuestas para aprobar (o lo envía si activaste esa automatización).",
    example: "Prepará el resumen mensual para todos los clientes",
    scopes: ["cartera", "organizacion"],
    needs: ["periodo"],
    keywords: /resumen (?:mensual|del mes)/,
    routine: true,
  },
  {
    key: "liquidar_sueldos",
    title: "Liquidar sueldos",
    description: "Arma la liquidación del período con el convenio y las novedades de cada empleado, marca lo raro (variaciones, datos que faltan, embargos, escalas a validar) y la deja en borrador para aprobar.",
    example: "Liquidá octubre de Panadería La Espiga",
    scopes: ["organizacion", "cartera"],
    needs: ["periodo"],
    module: "payroll",
    keywords: /liquid[aá]|sueldo|n[oó]mina|aguinaldo/,
    routine: true,
  },
  {
    key: "inventario",
    title: "Inventario valorizado y stock bajo",
    description: "Inventario valorizado a una fecha (por ejemplo al 31/12) con el CMV estimado del año, y los productos debajo del mínimo.",
    example: "Inventario al 31/12 de Distribuidora Oeste",
    scopes: ["organizacion", "cartera", "personal"],
    needs: ["fecha"],
    module: "stock",
    keywords: /inventario|\bstock\b|existencia/,
    routine: true,
  },
  {
    key: "libre",
    title: "Otra tarea",
    description: "Contale qué necesitás: arma un plan con las herramientas de Faro, investiga y te deja un informe. Necesita un modelo de IA configurado.",
    example: "¿Qué clientes tienen solicitudes abiertas hace más de una semana?",
    scopes: ["organizacion", "cartera", "personal"],
    needs: [],
    keywords: /$^/,
  },
];

export const getTemplate = (key: string) => AGENT_TEMPLATES.find((t) => t.key === key);

export const SEVERITY_LABEL = { alta: "Alta", media: "Media", baja: "Baja" } as const;

export const TASK_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "progress" | "ok" | "done" | "danger" | "gold" }> = {
  pendiente: { label: "En cola", tone: "neutral" },
  en_curso: { label: "Trabajando", tone: "progress" },
  pausada: { label: "Pausada", tone: "neutral" },
  cancelada: { label: "Cancelada", tone: "neutral" },
  completada: { label: "Lista", tone: "ok" },
  error: { label: "Con error", tone: "danger" },
};
