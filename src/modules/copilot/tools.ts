import "server-only";
import { z } from "zod/v4";

// Herramientas del Vigía (tool calls tipadas del AI SDK). Las de registro
// no se ejecutan: se convierten en tarjetas (Confirmar, Editar, Deshacer).
// Las de consulta sí se ejecutan con los datos reales del usuario.

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD. Por defecto, hoy. 'ayer' = la fecha de ayer");

export const crearMovimiento = z.object({
  tipo: z.enum(["gasto", "ingreso"]).default("gasto"),
  monto: z.number().positive().describe("Importe en la moneda, en unidades (ej. 3500 para $3.500)"),
  moneda: z.enum(["ARS", "USD"]).default("ARS"),
  fecha,
  categoria: z.string().max(40).optional().describe("Una de las categorías del usuario (ej. Comida y delivery, Transporte, Supermercado)"),
  descripcion: z.string().min(1).max(160).describe("Comercio o en qué fue (ej. Kiosco, Nafta YPF)"),
  medio_pago: z.enum(["efectivo", "debito", "credito", "transferencia", "mercado_pago"]).optional(),
  nota: z.string().max(300).optional(),
  caja: z.enum(["personal", "negocio"]).default("personal").describe('"negocio" si es de su trabajo, su actividad, su emprendimiento o una changa o freelance; si no, "personal"'),
});

export const crearGastoEnGrupo = z.object({
  grupo: z.string().max(80).optional().describe("Nombre del grupo. Si no se dice, el grupo donde están las personas nombradas"),
  descripcion: z.string().min(1).max(140),
  monto: z.number().positive().describe("Importe total del gasto, en unidades"),
  moneda: z.enum(["ARS", "USD"]).default("ARS"),
  fecha,
  pagado_por: z.string().max(80).default("yo").describe('Quién pagó. "yo" = el usuario'),
  dividir_entre: z.array(z.string().max(80)).max(50).optional().describe("Personas entre las que se divide (sin contar al usuario). Vacío = todo el grupo"),
  incluirme: z.boolean().default(true),
  metodo: z.enum(["iguales", "porcentaje", "montos"]).default("iguales"),
  valores: z.record(z.string(), z.number()).optional().describe("Para porcentaje o montos: nombre → valor"),
  categoria: z.string().max(30).optional(),
});

export const crearGrupo = z.object({
  nombre: z.string().min(2).max(80),
  tipo: z.enum(["viaje", "personal", "oficina", "equipo", "proyecto", "socios"]).default("personal"),
  integrantes: z.array(z.string().max(80)).max(30).default([]).describe("Nombres de las personas a sumar (sin contar al usuario)"),
});

export const recordar = z.object({
  texto: z.string().min(2).max(200),
  cuando: z.string().describe("Fecha y hora ISO (YYYY-MM-DDTHH:mm) en hora de Argentina"),
});

export const consultarBitacora = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("YYYY-MM. Por defecto el actual"),
  categoria: z.string().max(40).optional(),
});

export const consultarSaldos = z.object({
  grupo: z.string().max(80).optional(),
  persona: z.string().max(80).optional().describe("Con quién (ej. Juan)"),
});

export const PROPOSAL_TOOLS = {
  crear_movimiento: { schema: crearMovimiento, description: "Registra un gasto o ingreso en la caja personal (Bitácora) o, si es del trabajo o de una changa, en la caja de negocio. Llamala una vez por cada movimiento (puede haber varios en un mensaje)." },
  crear_gasto_en_grupo: { schema: crearGastoEnGrupo, description: "Carga un gasto compartido en un grupo de gastos y lo divide (iguales, porcentaje o montos). Usala solo si el usuario habla de compartir con otras personas o de un grupo." },
  crear_grupo: { schema: crearGrupo, description: "Crea un grupo de gastos nuevo con las personas nombradas." },
  recordar: { schema: recordar, description: "Agenda un recordatorio para el usuario." },
} as const;

export type ProposalTool = keyof typeof PROPOSAL_TOOLS;
export const isProposalTool = (t: string): t is ProposalTool => t in PROPOSAL_TOOLS;
