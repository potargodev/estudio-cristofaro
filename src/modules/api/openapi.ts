// Especificación OpenAPI 3.1 de /api/v1 (§2.p, B9). Se sirve en
// /api/v1/openapi.json y se muestra en /api/v1/docs.

import { API_SCOPES, WEBHOOK_EVENTS } from "./core";

const err = { $ref: "#/components/schemas/Error" };
const errors = {
  "401": { description: "Falta el token o no es válido", content: { "application/json": { schema: err } } },
  "403": { description: "El token no tiene ese permiso", content: { "application/json": { schema: err } } },
  "429": { description: "Pasaste el límite por minuto (mirá Retry-After)", content: { "application/json": { schema: err } } },
};

export function openApi(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "API de Faro",
      version: "1.0.0",
      description: `Facturación, comprobantes y buzón de tus organizaciones. Autenticación con un token de Configuración → API (Authorization: Bearer faro_api_…). Permisos: ${Object.entries(API_SCOPES)
        .map(([k, v]) => `${k} (${v})`)
        .join("; ")}. Límite: 120 pedidos por minuto por token. Crear comprobantes pide Idempotency-Key. Faro nunca pide ni guarda la clave fiscal.`,
    },
    servers: [{ url: `${baseUrl}/api/v1` }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "faro_api_…" } },
      schemas: {
        Error: { type: "object", properties: { error: { type: "object", properties: { codigo: { type: "string" }, mensaje: { type: "string" } }, required: ["codigo", "mensaje"] } } },
        Organizacion: { type: "object", properties: { id: { type: "string", format: "uuid" }, nombre: { type: "string" }, estado: { type: "string" } } },
        Comprobante: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            organizacion_id: { type: "string", format: "uuid" },
            cuit_emisor: { type: "string" },
            ambiente: { type: "string", enum: ["homologacion", "produccion"] },
            tipo: { type: "integer", description: "Código de ARCA (1 Factura A, 6 B, 11 C, 51 M, 201… FCE)" },
            tipo_nombre: { type: ["string", "null"] },
            punto_venta: { type: "integer" },
            numero: { type: ["integer", "null"] },
            fecha: { type: "string", format: "date" },
            cliente: { type: "object", properties: { tipo_doc: { type: "integer" }, documento: { type: "string" }, nombre: { type: "string" }, condicion_iva: { type: "string" } } },
            items: { type: "array", items: { type: "object", properties: { descripcion: { type: "string" }, cantidad: { type: "number" }, precio: { type: "number" }, alicuota: { type: ["number", "null"] } } } },
            neto: { type: "number" },
            iva: { type: "number" },
            total: { type: "number" },
            moneda: { type: "string" },
            estado: { type: "string", enum: ["borrador", "en_cola", "autorizada", "rechazada", "error"] },
            cae: { type: ["string", "null"] },
            vencimiento_cae: { type: ["string", "null"] },
            error: { type: ["string", "null"] },
            origen: { type: "string" },
            creado: { type: "string", format: "date-time" },
          },
        },
        NuevoComprobante: {
          type: "object",
          required: ["cliente", "items"],
          properties: {
            organizacion_id: { type: "string", format: "uuid", description: "Obligatorio si el token no es de una sola organización" },
            cuit_emisor: { type: "string", description: "11 números; por defecto, la primera CUIT de la organización" },
            punto_venta: { type: "integer", description: "Por defecto, el primero habilitado" },
            tipo: { type: "integer", description: "Por defecto, el que corresponde por las condiciones frente al IVA" },
            fecha: { type: "string", format: "date" },
            concepto: { type: "integer", enum: [1, 2, 3], default: 2, description: "1 productos, 2 servicios, 3 ambos" },
            cliente: {
              type: "object",
              required: ["nombre"],
              properties: { tipo_doc: { type: "integer", enum: [80, 86, 96, 99], default: 99 }, documento: { type: "string", default: "0" }, nombre: { type: "string" }, condicion_iva: { type: "string", enum: ["consumidor_final", "responsable_inscripto", "monotributo", "exento", "exterior"], default: "consumidor_final" }, email: { type: "string", format: "email" } },
            },
            items: { type: "array", minItems: 1, items: { type: "object", required: ["descripcion", "cantidad", "precio"], properties: { descripcion: { type: "string" }, cantidad: { type: "number" }, precio: { type: "number", description: "Neto por unidad (sin IVA en A y B)" }, alicuota: { type: "number", default: 21 } } } },
            emitir: { type: "boolean", default: false, description: "Emitir en ARCA. Solo se emite si el titular o su contador activaron «Facturar automáticamente lo que llega por la API»; si no, queda en borrador para aprobar." },
          },
        },
      },
    },
    paths: {
      "/organizaciones": { get: { summary: "Organizaciones del tenant", description: "Permiso organizaciones:leer.", responses: { "200": { description: "Lista", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Organizacion" } } } } } } }, ...errors } } },
      "/comprobantes": {
        get: {
          summary: "Comprobantes emitidos",
          description: "Permiso comprobantes:leer. Los más nuevos primero.",
          parameters: [
            { name: "organizacion_id", in: "query", schema: { type: "string", format: "uuid" } },
            { name: "desde", in: "query", schema: { type: "string", format: "date" } },
            { name: "hasta", in: "query", schema: { type: "string", format: "date" } },
            { name: "estado", in: "query", schema: { type: "string" }, description: "Uno o varios separados por coma" },
            { name: "limite", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          ],
          responses: { "200": { description: "Lista", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Comprobante" } } } } } } }, ...errors },
        },
        post: {
          summary: "Crear un comprobante",
          description: "Permiso comprobantes:emitir. Mandá Idempotency-Key: el mismo pedido repetido devuelve la misma respuesta (Idempotent-Replayed: true) y nunca crea dos comprobantes.",
          parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 8, maxLength: 120 } }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/NuevoComprobante" } } } },
          responses: {
            "201": { description: "Creado (en borrador, en cola o autorizado)", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Comprobante" }, aviso: { type: "string" } } } } } },
            "400": { description: "Pedido inválido", content: { "application/json": { schema: err } } },
            "422": { description: "ARCA o las reglas del comprobante lo rechazan, o la Idempotency-Key ya se usó con otro pedido", content: { "application/json": { schema: err } } },
            ...errors,
          },
        },
      },
      "/comprobantes/{id}": { get: { summary: "Un comprobante", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Comprobante", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Comprobante" } } } } } }, "404": { description: "No existe o no es del tenant", content: { "application/json": { schema: err } } }, ...errors } } },
      "/buzon": { get: { summary: "Buzón de comprobantes recibidos", description: "Permiso buzon:leer. Lo que está para revisar.", responses: { "200": { description: "Lista" }, ...errors } } },
      "/estado": { get: { summary: "Estado de Faro y de ARCA", security: [], responses: { "200": { description: "Estado público" } } } },
    },
    webhooks: Object.fromEntries(
      Object.entries(WEBHOOK_EVENTS).map(([k, v]) => [
        k,
        {
          post: {
            summary: v,
            description: "Cuerpo: { id, evento, creado, datos }. Encabezados: X-Faro-Event, X-Faro-Delivery y X-Faro-Signature (t=<segundos>,v1=HMAC-SHA256(secreto, \"<t>.<cuerpo>\")). Respondé 2xx; si no, se reintenta a los 1, 5 y 30 minutos, 2 y 12 horas.",
            responses: { "200": { description: "Recibido" } },
          },
        },
      ]),
    ),
  };
}
