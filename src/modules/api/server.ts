import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { api_idempotency, api_tokens, invoices, organizations, studios } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isUuid } from "@/lib/ids";
import { studioOrganization } from "@/lib/organizations";
import { automationAllows } from "@/modules/agent/automations";
import { CBTE_TYPES } from "@/modules/arca/config";
import { isScope, type ApiScope, type InvoiceBody } from "./core";

// API pública /api/v1 (§2.p, B9). Tokens por tenant (opcionalmente de una
// sola organización) con permisos, límite por minuto e Idempotency-Key.
// Crear un comprobante deja un borrador; se emite solo si el pedido lo pide y
// el titular o su contador activaron «Facturar automáticamente lo que llega
// por la API» (auditado y con pausa). Todo filtra por el tenant del token.

const db = () => getDb();
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
type Actor = { id: string; email: string };
export interface ApiAuth {
  tokenId: string;
  studioId: string;
  organizationId: string | null;
  scopes: string[];
  rate: number;
  actor: { id: string; email: string; name: string; role: string };
}

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** Crea un token (se muestra una sola vez) */
export async function createApiToken(studioId: string, actor: Actor, i: { name: string; scopes: string[]; organizationId?: string | null }) {
  const name = i.name.trim().slice(0, 80);
  if (name.length < 2) throw new ApiError(400, "nombre", "Poné un nombre para reconocer el token.");
  const scopes = [...new Set(i.scopes.filter(isScope))];
  if (!scopes.length) throw new ApiError(400, "permisos", "Elegí al menos un permiso.");
  let organizationId: string | null = null;
  if (i.organizationId) {
    const org = await studioOrganization(i.organizationId, studioId);
    if (!org) throw new ApiError(404, "organizacion", "No encontramos esa organización.");
    organizationId = org.id;
  }
  const token = `faro_api_${randomBytes(32).toString("base64url")}`;
  const [row] = await db().insert(api_tokens).values({ studio_id: studioId, organization_id: organizationId, name, token_prefix: token.slice(0, 14), token_hash: hash(token), scopes, created_by: actor.id }).returning();
  await audit({ studioId, organizationId, actor, action: "api.token_crear", entityType: "api_token", entityId: row.id, metadata: { nombre: name, permisos: scopes } });
  return { token, row };
}

export async function listApiTokens(studioId: string) {
  return db()
    .select({ t: api_tokens, org: organizations.name })
    .from(api_tokens)
    .leftJoin(organizations, eq(organizations.id, api_tokens.organization_id))
    .where(eq(api_tokens.studio_id, studioId))
    .orderBy(desc(api_tokens.created_at));
}

export async function revokeApiToken(studioId: string, actor: Actor, id: string) {
  if (!isUuid(id)) return false;
  const r = await db().update(api_tokens).set({ revoked_at: new Date() }).where(and(eq(api_tokens.id, id), eq(api_tokens.studio_id, studioId), isNull(api_tokens.revoked_at))).returning({ id: api_tokens.id });
  if (r.length) await audit({ studioId, actor, action: "api.token_revocar", entityType: "api_token", entityId: id });
  return r.length > 0;
}

/** Token del encabezado Authorization: Bearer → a qué tenant y con qué permisos (o null) */
export async function authenticate(header: string | null): Promise<ApiAuth | null> {
  const token = header?.match(/^Bearer\s+(faro_api_[A-Za-z0-9_-]{20,80})$/)?.[1];
  if (!token) return null;
  const [r] = await db().select({ t: api_tokens, status: studios.status }).from(api_tokens).innerJoin(studios, eq(studios.id, api_tokens.studio_id)).where(eq(api_tokens.token_hash, hash(token)));
  if (!r || r.t.revoked_at || r.status === "suspendido") return null;
  await db().update(api_tokens).set({ last_used_at: new Date() }).where(eq(api_tokens.id, r.t.id));
  return { tokenId: r.t.id, studioId: r.t.studio_id, organizationId: r.t.organization_id, scopes: r.t.scopes, rate: r.t.rate_per_minute, actor: { id: r.t.created_by ?? "", email: `api:${r.t.token_prefix}`, name: `API · ${r.t.name}`, role: "dueno" } };
}

export function requireScope(a: ApiAuth, scope: ApiScope) {
  if (!a.scopes.includes(scope)) throw new ApiError(403, "permiso", `El token no tiene el permiso «${scope}».`);
}

/** Organización pedida, dentro del tenant y del alcance del token */
async function orgFor(a: ApiAuth, id: string | null | undefined) {
  const wanted = id ?? a.organizationId;
  if (!wanted) throw new ApiError(400, "organizacion_id", "Falta organizacion_id.");
  if (a.organizationId && wanted !== a.organizationId) throw new ApiError(404, "organizacion", "No encontramos esa organización.");
  const org = await studioOrganization(wanted, a.studioId);
  if (!org) throw new ApiError(404, "organizacion", "No encontramos esa organización.");
  return org;
}

// ───────────── Idempotency-Key ─────────────

/**
 * Corre el pedido una sola vez por (token, clave): si se repite con el mismo
 * cuerpo devuelve la respuesta guardada; con otro cuerpo, 422.
 */
export async function idempotent(a: ApiAuth, key: string | null, body: string, run: () => Promise<{ status: number; body: unknown }>) {
  if (!key || !/^[\w.:-]{8,120}$/.test(key)) throw new ApiError(400, "idempotency_key", "Mandá el encabezado Idempotency-Key (8 a 120 letras, números, puntos, guiones o dos puntos).");
  const rh = hash(body);
  const [claimed] = await db().insert(api_idempotency).values({ token_id: a.tokenId, key, request_hash: rh }).onConflictDoNothing().returning();
  if (!claimed) {
    const [prev] = await db().select().from(api_idempotency).where(and(eq(api_idempotency.token_id, a.tokenId), eq(api_idempotency.key, key)));
    if (prev.request_hash !== rh) throw new ApiError(422, "idempotency_key", "Esa Idempotency-Key ya se usó con otro pedido.");
    if (prev.status_code == null) throw new ApiError(409, "en_proceso", "Ese pedido todavía se está procesando. Probá en unos segundos.");
    return { status: prev.status_code, body: prev.response, replayed: true };
  }
  try {
    const r = await run();
    await db().update(api_idempotency).set({ status_code: r.status, response: r.body as object }).where(eq(api_idempotency.id, claimed.id));
    return { ...r, replayed: false };
  } catch (e) {
    // Un error de validación se puede reintentar con la misma clave
    await db().delete(api_idempotency).where(eq(api_idempotency.id, claimed.id));
    throw e;
  }
}

// ───────────── Recursos ─────────────

export async function apiOrganizations(a: ApiAuth) {
  requireScope(a, "organizaciones:leer");
  const rows = await db()
    .select({ id: organizations.id, nombre: organizations.name, estado: organizations.status })
    .from(organizations)
    .where(and(eq(organizations.studio_id, a.studioId), a.organizationId ? eq(organizations.id, a.organizationId) : undefined))
    .orderBy(organizations.name)
    .limit(500);
  return { data: rows };
}

type Inv = typeof invoices.$inferSelect;
const invoiceOut = (i: Inv) => ({
  id: i.id,
  organizacion_id: i.organization_id,
  cuit_emisor: i.cuit,
  ambiente: i.environment,
  tipo: i.cbte_type,
  tipo_nombre: CBTE_TYPES[i.cbte_type]?.label ?? null,
  punto_venta: i.point_of_sale,
  numero: i.number,
  fecha: i.issue_date,
  cliente: { tipo_doc: i.customer_doc_type, documento: i.customer_doc_number, nombre: i.customer_name, condicion_iva: i.customer_iva_condition },
  items: i.items.map((x) => ({ descripcion: x.description, cantidad: x.quantity, precio: x.unitPrice, alicuota: x.ivaRate })),
  neto: Number(i.net),
  iva: Number(i.iva),
  total: Number(i.total),
  moneda: i.currency,
  estado: i.status,
  cae: i.cae,
  vencimiento_cae: i.cae_due,
  error: i.error,
  origen: i.origin,
  creado: i.created_at.toISOString(),
});

export async function apiInvoices(a: ApiAuth, q: URLSearchParams) {
  requireScope(a, "comprobantes:leer");
  const orgId = q.get("organizacion_id");
  const org = orgId || a.organizationId ? await orgFor(a, orgId) : null;
  const desde = q.get("desde");
  const hasta = q.get("hasta");
  const estado = q.get("estado");
  const limit = Math.min(200, Math.max(1, Number(q.get("limite")) || 50));
  const rows = await db()
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.studio_id, a.studioId),
        org ? eq(invoices.organization_id, org.id) : undefined,
        desde && /^\d{4}-\d{2}-\d{2}$/.test(desde) ? gte(invoices.issue_date, desde) : undefined,
        hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta) ? lte(invoices.issue_date, hasta) : undefined,
        estado ? inArray(invoices.status, estado.split(",").slice(0, 6)) : undefined,
      ),
    )
    .orderBy(desc(invoices.created_at))
    .limit(limit);
  return { data: rows.map(invoiceOut) };
}

export async function apiInvoice(a: ApiAuth, id: string) {
  requireScope(a, "comprobantes:leer");
  if (!isUuid(id)) throw new ApiError(404, "no_encontrado", "No encontramos ese comprobante.");
  const [i] = await db().select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.studio_id, a.studioId), a.organizationId ? eq(invoices.organization_id, a.organizationId) : undefined));
  if (!i) throw new ApiError(404, "no_encontrado", "No encontramos ese comprobante.");
  return { data: invoiceOut(i) };
}

/** Crea el comprobante (borrador) y lo emite si se pide y el interruptor lo permite */
export async function apiCreateInvoice(a: ApiAuth, b: InvoiceBody, key: string) {
  requireScope(a, "comprobantes:emitir");
  const org = await orgFor(a, b.organizacion_id);
  const { ownCuits } = await import("@/modules/smart-docs/server");
  const cuits = await ownCuits(a.studioId, org.id);
  const cuit = b.cuit_emisor ?? cuits[0];
  if (!cuit || !cuits.includes(cuit)) throw new ApiError(400, "cuit_emisor", b.cuit_emisor ? "Esa CUIT no es de la organización." : "La organización no tiene una CUIT para facturar.");
  const arca = await import("@/modules/arca/server");
  const { scopeOf } = await import("@/modules/arca/queue");
  const scope = await scopeOf({ studio_id: a.studioId, organization_id: org.id, cuit });
  const pos = b.punto_venta ?? (await arca.listPoints(scope)).find((p) => !p.blocked)?.number ?? 1;
  try {
    let inv = await arca.createDraft(
      scope,
      {
        cbteType: b.tipo ?? null,
        pointOfSale: pos,
        issueDate: b.fecha ?? new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10),
        concept: b.concepto,
        customer: { docType: b.cliente.tipo_doc, docNumber: b.cliente.documento, name: b.cliente.nombre, ivaCondition: b.cliente.condicion_iva, email: b.cliente.email ?? null },
        items: b.items.map((x) => ({ description: x.descripcion, quantity: x.cantidad, unitPrice: x.precio, ivaRate: x.alicuota ?? 21 })),
        idempotencyKey: `api:${a.tokenId}:${key}`,
      },
      a.actor,
      "api",
    );
    const auto = b.emitir && (await automationAllows(a.studioId, org.id, "facturacion.api"));
    if (auto && inv.status === "borrador") inv = await arca.emitInvoice(scope, inv.id, a.actor, "api");
    await audit({ studioId: a.studioId, organizationId: org.id, actor: a.actor, action: "api.comprobante", entityType: "factura", entityId: inv.id, metadata: { emitir: b.emitir, automatica: auto, estado: inv.status } });
    return { status: 201, body: { data: invoiceOut(inv), ...(b.emitir && !auto ? { aviso: "Quedó en borrador: para que se emita solo, el titular o su contador tienen que activar «Facturar automáticamente lo que llega por la API» en Faro." } : {}) } };
  } catch (e) {
    if (e instanceof arca.ArcaError) throw new ApiError(422, "comprobante", e.message);
    throw e;
  }
}

/** Buzón: comprobantes recibidos para revisar */
export async function apiInbox(a: ApiAuth) {
  requireScope(a, "buzon:leer");
  const { inboxList } = await import("@/modules/buzon/server");
  const rows = (await inboxList(a.studioId, { org: a.organizationId })).filter((r) => !a.organizationId || r.d.organization_id === a.organizationId);
  return { data: rows.map((r) => ({ id: r.d.id, organizacion_id: r.d.organization_id, archivo: r.d.file_name, fuente: r.d.source, estado: r.d.status, problemas: r.problems, datos: r.d.extracted, recibido: r.d.created_at.toISOString() })) };
}
