// API pública /api/v1 (§2.p, B9): reglas puras. Permisos por token, el cuerpo
// para crear un comprobante, la firma de los webhooks y los reintentos.

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod/v4";

export const API_SCOPES = {
  "organizaciones:leer": "Ver las organizaciones",
  "comprobantes:leer": "Ver los comprobantes emitidos",
  "comprobantes:emitir": "Crear comprobantes (se emiten solos solo con el interruptor «Facturar automáticamente lo que llega por la API»)",
  "buzon:leer": "Ver el buzón de comprobantes recibidos",
} as const;
export type ApiScope = keyof typeof API_SCOPES;
export const isScope = (s: string): s is ApiScope => s in API_SCOPES;

/** Eventos que se pueden mandar por webhook (los mismos que disparan los flujos) */
export const WEBHOOK_EVENTS = {
  "factura.emitida": "Se emitió un comprobante con CAE",
  "documento.leido": "Se leyó un comprobante recibido",
  "documento.confirmado": "Se aprobó un comprobante recibido",
  "solicitud.creada": "Un cliente abrió una solicitud",
  "vencimiento.proximo": "Se acerca un vencimiento",
  "whatsapp.recibido": "Llegó un mensaje por WhatsApp",
} as const;
export const isWebhookEvent = (e: string) => e in WEBHOOK_EVENTS;

const money = z.number().finite().nonnegative();
export const INVOICE_BODY = z.object({
  organizacion_id: z.string().uuid().optional(),
  cuit_emisor: z.string().regex(/^\d{11}$/).optional(),
  punto_venta: z.number().int().min(1).max(99998).optional(),
  tipo: z.number().int().optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  concepto: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  cliente: z.object({
    tipo_doc: z.union([z.literal(80), z.literal(86), z.literal(96), z.literal(99)]).default(99),
    documento: z.string().max(13).default("0"),
    nombre: z.string().min(1).max(160),
    condicion_iva: z.enum(["consumidor_final", "responsable_inscripto", "monotributo", "exento", "exterior"]).default("consumidor_final"),
    email: z.string().email().optional(),
  }),
  items: z.array(z.object({ descripcion: z.string().min(1).max(200), cantidad: z.number().positive(), precio: money, alicuota: z.number().optional() })).min(1).max(100),
  emitir: z.boolean().default(false),
});
export type InvoiceBody = z.infer<typeof INVOICE_BODY>;

/** Firma de un webhook: t=<segundos>,v1=HMAC-SHA256(secreto, "<t>.<cuerpo>") */
export function signWebhook(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

/** Verificación del lado del que recibe (documentada en /api/v1/docs; la usan las pruebas) */
export function verifyWebhook(secret: string, body: string, header: string, toleranceSec = 300, now = Math.floor(Date.now() / 1000)) {
  const t = Number(header.match(/t=(\d+)/)?.[1]);
  const v1 = header.match(/v1=([a-f0-9]{64})/)?.[1];
  if (!t || !v1 || Math.abs(now - t) > toleranceSec) return false;
  const want = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return timingSafeEqual(Buffer.from(v1), Buffer.from(want));
}

/** Reintentos de un webhook: 1, 5, 30 minutos, 2 y 12 horas; después queda fallido */
const BACKOFF_MIN = [1, 5, 30, 120, 720];
export const nextAttempt = (attempts: number, now = Date.now()) => (attempts > BACKOFF_MIN.length ? null : new Date(now + BACKOFF_MIN[Math.max(0, attempts - 1)] * 60_000));
