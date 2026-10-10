// Filas de la comparación de planes de la landing (docs/faro-producto.md §2.c y §3).
// Los límites numéricos salen de plans.ts; acá van los textos comparativos.

import { getPlan } from "./plans";

const lim = (key: string, f: "organizations" | "staffUsers" | "smartDocsPerMonth") => {
  const v = getPlan(key)?.limits[f];
  return v == null ? "Ilimitadas" : f === "smartDocsPerMonth" ? `${v.toLocaleString("es-AR")} documentos/mes` : `Hasta ${v}`;
};

/** [fila, Señal, Rumbo, Horizonte] */
export const STUDIO_ROWS: [string, string, string, string][] = [
  ["Para quién", "Contador independiente que arranca", "Estudio chico en crecimiento", "Estudio mediano que quiere automatizar"],
  ["Organizaciones", lim("senal", "organizations"), lim("rumbo", "organizations"), lim("horizonte", "organizations")],
  ["Usuarios del estudio", "1", lim("rumbo", "staffUsers"), lim("horizonte", "staffUsers")],
  ["Núcleo: portal, vencimientos, documentos, solicitudes y agenda", "✓", "✓", "✓"],
  ["Gastos compartidos", "✓", "✓", "✓"],
  ["Asistente IA", "Con clave propia, consultas", "Consultas y acciones con aprobación", "Acciones avanzadas y agentes"],
  ["Flujos", "1 plantilla activa", "10 flujos, plantillas", "Ilimitados, editor libre"],
  ["Recibos, legajo y comunicación interna", "—", "✓", "✓"],
  ["Lectura inteligente", lim("senal", "smartDocsPerMonth"), lim("rumbo", "smartDocsPerMonth"), lim("horizonte", "smartDocsPerMonth")],
  ["Cartera y tareas, Tango, ARCA", "Tango por archivos", "✓", "✓"],
  ["Cobranza de honorarios", "—", "✓", "✓"],
  ["Conciliación bancaria, indicadores, WhatsApp", "—", "—", "✓"],
  ["Marca blanca", "—", "—", "✓"],
  ["Soporte", "Comunidad y mail", "Mail prioritario", "Dedicado"],
];

/** [fila, Destello, Guía] */
export const PERSONAL_ROWS: [string, string, string][] = [
  ["Facturación electrónica", "10 comprobantes/mes", "Ilimitada, con logo y link de pago"],
  ["Situación con ARCA y semáforo de monotributo", "✓", "✓"],
  ["Calendario y alertas", "Mail", "Mail y WhatsApp"],
  ["Ingresos y gastos", "Básico", "Con lectura inteligente de comprobantes"],
  ["Gastos compartidos", "✓", "✓"],
  ["Asistente IA", "Consultas", "Consultas y acciones con aprobación"],
  ["Pedir ayuda a un contador", "✓", "✓"],
];
