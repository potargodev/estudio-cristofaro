// Filas de la comparación de planes de la landing (docs/faro-producto.md §2.c y §3).
// Los límites numéricos salen de plans.ts; acá van los textos comparativos.

import { getPlan } from "./plans";
import { formatNumber } from "@/lib/format";

const lim = (key: string, f: "organizations" | "staffUsers" | "smartDocsPerMonth") => {
  const v = getPlan(key)?.limits[f];
  return v == null ? "Ilimitadas" : f === "smartDocsPerMonth" ? `${formatNumber(v)} documentos/mes` : `Hasta ${v}`;
};
const flowsOf = (key: string) => {
  const v = getPlan(key)?.limits.flows;
  return v == null ? "Ilimitados, editor libre" : `${v} flujo${v === 1 ? "" : "s"} activo${v === 1 ? "" : "s"}, plantillas`;
};
const invoicesOf = (key: string) => {
  const v = getPlan(key)?.limits.invoicesPerMonth;
  return v == null ? "Ilimitada, con logo y link de pago" : `${v} comprobantes/mes`;
};

/** [fila, Inicial, Profesional, Avanzado] */
export const STUDIO_ROWS: [string, string, string, string][] = [
  ["Para quién", "Contador independiente que arranca", "Estudio chico en crecimiento", "Estudio mediano que quiere automatizar"],
  ["Organizaciones", lim("inicial", "organizations"), lim("profesional", "organizations"), lim("avanzado", "organizations")],
  ["Usuarios del estudio", lim("inicial", "staffUsers"), lim("profesional", "staffUsers"), lim("avanzado", "staffUsers")],
  ["Organización extra", "— (se pasa a Profesional)", "USD 2 / mes", "USD 2 / mes"],
  ["Precio", "Gratis, sin prueba ni débito", "30 días de prueba", "30 días de prueba"],
  ["Aparecer en la Red Contable", "—", "✓", "✓"],
  ["Núcleo: portal, vencimientos, documentos, solicitudes y agenda", "✓", "✓", "✓"],
  ["Grupos de gastos", "✓", "✓", "✓"],
  ["Asistente IA", "Con clave propia, consultas", "Consultas y acciones con aprobación", "Acciones avanzadas y agentes"],
  ["Flujos", flowsOf("inicial"), flowsOf("profesional"), flowsOf("avanzado")],
  ["Facturación avanzada: panel de CUIT, lotes, recurrentes, ARCA en cola, Libro IVA Digital", "—", "✓", "✓"],
  ["Ventas de tiendas para facturar, API y webhooks", "—", "✓", "✓"],
  ["Buzón de comprobantes recibidos (app, portal, mail, ARCA y rendiciones)", "✓", "✓", "✓"],
  ["Recibos, legajo y comunicación interna", "—", "✓", "✓"],
  ["Lectura inteligente", lim("inicial", "smartDocsPerMonth"), lim("profesional", "smartDocsPerMonth"), lim("avanzado", "smartDocsPerMonth")],
  ["Cartera y tareas, Tango, ARCA", "Tango por archivos", "✓", "✓"],
  ["Cobranza de honorarios", "—", "✓", "✓"],
  ["Conciliación bancaria, indicadores, WhatsApp (avisos y facturar por WhatsApp)", "—", "—", "✓"],
  ["Marca blanca", "—", "—", "✓"],
  ["Soporte", "Comunidad y mail", "Mail prioritario", "Dedicado"],
];

/** [fila, Personas Gratis, Plus] */
export const PERSONA_ROWS: [string, string, string][] = [
  ["Bitácora: tus finanzas personales", "Captura por audio limitada al mes", "Captura ilimitada, mails y Mercado Pago"],
  ["Grupos de gastos", "✓", "✓"],
  ["Flotas: contratar un estudio en grupo", "✓", "✓"],
  ["Red Contable: encontrar un contador", "✓", "✓"],
  ["WhatsApp, coach y metas", "—", "✓"],
  ["Asistente IA", "Consultas", "Consultas y acciones con aprobación"],
];

/** [fila, Autónomos Gratis, Pro] */
export const PERSONAL_ROWS: [string, string, string][] = [
  ["Facturación electrónica", invoicesOf("autonomo_gratis"), invoicesOf("autonomo_pro")],
  ["Factura rápida desde el celular, sin pedirte la clave fiscal", "✓", "✓"],
  ["Situación con ARCA y semáforo de monotributo", "✓", "✓"],
  ["Calendario y alertas", "Mail", "Mail y WhatsApp"],
  ["Ingresos y gastos", "Básico", "Con lectura inteligente de comprobantes"],
  ["Grupos de gastos", "✓", "✓"],
  ["Asistente IA", "Consultas", "Consultas y acciones con aprobación"],
  ["Encontrar un contador en la Red Contable", "✓", "✓"],
];
