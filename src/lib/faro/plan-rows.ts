// Filas de la comparación de planes de la landing (docs/faro-producto.md §2.c y §3).
// Los límites numéricos salen de plans.ts; acá van los textos comparativos.

import { getPlan } from "./plans";

const lim = (key: string, f: "organizations" | "staffUsers" | "smartDocsPerMonth") => {
  const v = getPlan(key)?.limits[f];
  return v == null ? "Ilimitadas" : f === "smartDocsPerMonth" ? `${v.toLocaleString("es-AR")} documentos/mes` : `Hasta ${v}`;
};

/** [fila, Inicial, Profesional, Avanzado] */
export const STUDIO_ROWS: [string, string, string, string][] = [
  ["Para quién", "Contador independiente que arranca", "Estudio chico en crecimiento", "Estudio mediano que quiere automatizar"],
  ["Organizaciones", lim("inicial", "organizations"), lim("profesional", "organizations"), lim("avanzado", "organizations")],
  ["Usuarios del estudio", "1", lim("profesional", "staffUsers"), lim("avanzado", "staffUsers")],
  ["Organización extra", "USD 2 / mes", "USD 2 / mes", "USD 2 / mes"],
  ["Aparecer en la Red de estudios", "—", "✓", "✓"],
  ["Núcleo: portal, vencimientos, documentos, solicitudes y agenda", "✓", "✓", "✓"],
  ["Grupos de gastos", "✓", "✓", "✓"],
  ["Asistente IA", "Con clave propia, consultas", "Consultas y acciones con aprobación", "Acciones avanzadas y agentes"],
  ["Flujos", "1 plantilla activa", "10 flujos, plantillas", "Ilimitados, editor libre"],
  ["Recibos, legajo y comunicación interna", "—", "✓", "✓"],
  ["Lectura inteligente", lim("inicial", "smartDocsPerMonth"), lim("profesional", "smartDocsPerMonth"), lim("avanzado", "smartDocsPerMonth")],
  ["Cartera y tareas, Tango, ARCA", "Tango por archivos", "✓", "✓"],
  ["Cobranza de honorarios", "—", "✓", "✓"],
  ["Conciliación bancaria, indicadores, WhatsApp", "—", "—", "✓"],
  ["Marca blanca", "—", "—", "✓"],
  ["Soporte", "Comunidad y mail", "Mail prioritario", "Dedicado"],
];

/** [fila, Personas Gratis, Plus] */
export const PERSONA_ROWS: [string, string, string][] = [
  ["Bitácora: tus finanzas personales", "Captura por audio limitada al mes", "Captura ilimitada, mails y Mercado Pago"],
  ["Grupos de gastos", "✓", "✓"],
  ["Flotas: contratar un estudio en grupo", "✓", "✓"],
  ["Red de estudios: encontrar un contador", "✓", "✓"],
  ["WhatsApp, coach y metas", "—", "✓"],
  ["Asistente IA", "Consultas", "Consultas y acciones con aprobación"],
];

/** [fila, Autónomos Gratis, Pro] */
export const PERSONAL_ROWS: [string, string, string][] = [
  ["Facturación electrónica", "10 comprobantes/mes", "Ilimitada, con logo y link de pago"],
  ["Situación con ARCA y semáforo de monotributo", "✓", "✓"],
  ["Calendario y alertas", "Mail", "Mail y WhatsApp"],
  ["Ingresos y gastos", "Básico", "Con lectura inteligente de comprobantes"],
  ["Grupos de gastos", "✓", "✓"],
  ["Asistente IA", "Consultas", "Consultas y acciones con aprobación"],
  ["Encontrar un contador en la Red de estudios", "✓", "✓"],
];
