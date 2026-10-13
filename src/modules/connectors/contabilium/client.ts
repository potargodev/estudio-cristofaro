import "server-only";
import { isSimClient, simContabilium } from "@/modules/simuladores/conectores";

// Cliente de la API de Contabilium (A0, principios §22). La API real no se
// pudo verificar desde el entorno: rutas y formas siguen la documentación
// pública conocida (token OAuth2 client_credentials en /token, búsquedas
// paginadas con Items y TotalItems) y quedan «a validar» en
// docs/pendientes-configuracion.md. CONTABILIUM_API_URL apunta al simulador
// de mocks/contabilium en pruebas.

const base = () => (process.env.CONTABILIUM_API_URL?.trim() || "https://rest.contabilium.com").replace(/\/$/, "");

export class ContabiliumError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface ContabiliumCredentials {
  client_id: string;
  client_secret: string;
}

interface CbCliente {
  Id: number;
  RazonSocial: string;
  NroDoc: string;
  CondicionIva: string;
  Email: string | null;
  Modificado?: string;
}

export interface CbComprobante {
  Id: number;
  Tipo: string;
  PuntoVenta: number;
  Numero: number;
  FechaEmision: string;
  RazonSocial: string;
  NroDoc: string;
  ImporteNeto: number;
  Iva: number;
  Percepciones?: number;
  ImporteTotal: number;
  Cae?: string;
}

const tokens = new Map<string, { token: string; expires: number }>();

async function token(c: ContabiliumCredentials) {
  const cached = tokens.get(c.client_id);
  if (cached && cached.expires > Date.now()) return cached.token;
  const res = await fetch(`${base()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.client_id, client_secret: c.client_secret }).toString(),
    signal: AbortSignal.timeout(20000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !body.access_token) throw new ContabiliumError(res.status === 401 ? "Contabilium rechazó las credenciales de la API." : `Contabilium no entregó el token (${res.status}).`, res.status);
  tokens.set(c.client_id, { token: body.access_token, expires: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000 });
  return body.access_token;
}

async function call<T>(c: ContabiliumCredentials, path: string, init: { method?: string; body?: unknown; params?: Record<string, string> } = {}): Promise<T> {
  // Parte C: una cuenta «simulador…» la atiende el simulador de Faro
  if (isSimClient(c.client_id)) return (await simContabilium(c.client_id, path, init)) as T;
  const url = new URL(`${base()}${path}`);
  for (const [k, v] of Object.entries(init.params ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${await token(c)}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 401) tokens.delete(c.client_id);
  if (!res.ok) throw new ContabiliumError(`Contabilium respondió ${res.status} en ${path}.`, res.status);
  return (await res.json()) as T;
}

/** Recorre todas las páginas de una búsqueda */
async function all<T>(c: ContabiliumCredentials, path: string, params: Record<string, string> = {}) {
  const out: T[] = [];
  for (let page = 1; page <= 200; page++) {
    const r = await call<{ Items: T[]; TotalPage?: number }>(c, path, { params: { ...params, page: String(page) } });
    out.push(...(r.Items ?? []));
    if (!r.Items?.length || page >= (r.TotalPage ?? 1)) break;
  }
  return out;
}

export const contabilium = {
  clientes: (c: ContabiliumCredentials) => all<CbCliente>(c, "/api/clientes/search"),
  ventas: (c: ContabiliumCredentials, desde: string, hasta: string) => all<CbComprobante>(c, "/api/comprobantes/search", { fechaDesde: desde, fechaHasta: hasta }),
  compras: (c: ContabiliumCredentials, desde: string, hasta: string) => all<CbComprobante>(c, "/api/compras/search", { fechaDesde: desde, fechaHasta: hasta }),
  modificarCliente: (c: ContabiliumCredentials, id: string, cambios: Record<string, unknown>) => call<CbCliente>(c, `/api/clientes/${encodeURIComponent(id)}`, { method: "PUT", body: cambios }),
  crearComprobante: (c: ContabiliumCredentials, comp: Record<string, unknown>) => call<CbComprobante>(c, "/api/comprobantes", { method: "POST", body: comp }),
};
