import "server-only";
import { createHash } from "node:crypto";

// Cliente de la API oficial de Xubio (REST, OAuth2 client credentials).
// Verificado contra el swagger oficial (https://xubio.com/API/1.1/swagger.json):
// - Token: POST {base}/TokenEndpoint, Basic client_id:secret_id,
//   grant_type=client_credentials. Responde { access_token, expires_in: "3600" }
//   (string). No hay refresh token: se pide uno nuevo al vencer.
// - Recursos: /miempresa, /clienteBean, /ProveedorBean,
//   /comprobanteVentaBean y /comprobanteCompraBean (fechaDesde/fechaHasta
//   AAAA-MM-DD) y /asientoContableManualBean. Los listados devuelven arrays.
// - Un token puede morir antes de tiempo ({"error":"invalid_token"}): se renueva
//   y se reintenta una vez.
// XUBIO_API_URL apunta a otro servidor (el mock de mocks/xubio para pruebas).

export const xubioBase = () => (process.env.XUBIO_API_URL?.trim() || "https://xubio.com/API/1.1").replace(/\/$/, "");

// Token en memoria por credencial (client_id + secret) y un solo pedido de
// token a la vez: si varios pedidos en paralelo encuentran el token muerto,
// comparten la renovación.
const tokens = new Map<string, { token: string; expires: number }>();
const inflight = new Map<string, Promise<string>>();
const keyOf = (c: XubioCredentials) => createHash("sha256").update(`${c.client_id}:${c.client_secret}`).digest("hex");

export class XubioError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface XubioCredentials {
  client_id: string;
  client_secret: string;
}

async function fetchToken(c: XubioCredentials) {
  const res = await fetch(`${xubioBase()}/TokenEndpoint`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.client_id}:${c.client_secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: string | number; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new XubioError(res.status === 401 || body.error === "invalid_client" ? "Xubio rechazó el Client ID o el Secret ID." : `Xubio no entregó el token (${res.status}${body.error_description ? `: ${body.error_description}` : ""}).`, res.status);
  }
  // Se renueva un minuto antes del vencimiento informado (3600 s por defecto)
  const ttl = Number(body.expires_in) || 3600;
  const entry = { token: body.access_token, expires: Date.now() + Math.max(60, ttl - 60) * 1000 };
  tokens.set(keyOf(c), entry);
  return entry.token;
}

async function token(c: XubioCredentials, dead?: string) {
  const key = keyOf(c);
  const cached = tokens.get(key);
  // Se renueva si venció o si el que murió es el que está guardado (otro pedido ya pudo renovarlo)
  if (cached && cached.expires > Date.now() && cached.token !== dead) return cached.token;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = fetchToken(c).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function xubioGet<T = unknown>(c: XubioCredentials, path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const url = new URL(`${xubioBase()}${path}`);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  let dead: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const bearer = await token(c, dead);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    const died = res.status === 401 || (body as { error?: string } | null)?.error === "invalid_token";
    if (died && attempt === 0) {
      dead = bearer;
      continue;
    }
    if (!res.ok || died) throw new XubioError(`Xubio respondió ${res.status} en ${path}.`, res.status);
    return body as T;
  }
  throw new XubioError("No se pudo renovar el token de Xubio.");
}

const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : v && typeof v === "object" ? [v as T] : []);

export interface XubioCliente {
  cliente_id?: number | string;
  nombre?: string;
  razonSocial?: string;
  cuit?: string;
  CUIT?: string;
  email?: string;
  [k: string]: unknown;
}
export interface XubioProveedor {
  proveedorid?: number | string;
  nombre?: string;
  razonSocial?: string;
  cuit?: string;
  CUIT?: string;
  [k: string]: unknown;
}
type Ref = { ID?: number | string; id?: number | string; nombre?: string };
export interface XubioComprobante {
  transaccionid?: number | string;
  tipo?: number;
  fecha?: string;
  numeroDocumento?: string;
  importetotal?: number;
  cliente?: Ref;
  proveedor?: Ref;
  [k: string]: unknown;
}
export interface XubioAsiento {
  transaccionid?: number | string;
  fecha?: string;
  numeroDocumento?: string;
  descripcion?: string;
  importetotal?: number;
  asientoContableManualItem?: { debeHaber?: number; importe?: number }[];
  [k: string]: unknown;
}

export const xubio = {
  miEmpresa: (c: XubioCredentials) => xubioGet<{ nombreEmpresa?: string; cuit?: string }>(c, "/miempresa"),
  clientes: async (c: XubioCredentials) => list<XubioCliente>(await xubioGet(c, "/clienteBean")),
  proveedores: async (c: XubioCredentials) => list<XubioProveedor>(await xubioGet(c, "/ProveedorBean")),
  ventas: async (c: XubioCredentials, desde: string, hasta: string) => list<XubioComprobante>(await xubioGet(c, "/comprobanteVentaBean", { fechaDesde: desde, fechaHasta: hasta })),
  compras: async (c: XubioCredentials, desde: string, hasta: string) => list<XubioComprobante>(await xubioGet(c, "/comprobanteCompraBean", { fechaDesde: desde, fechaHasta: hasta })),
  asientos: async (c: XubioCredentials) => list<XubioAsiento>(await xubioGet(c, "/asientoContableManualBean")),
};

/** Solo pruebas: olvidar los tokens en memoria */
export const resetXubioTokens = () => tokens.clear();
