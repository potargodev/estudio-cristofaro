import "server-only";
import { emitEvent } from "@/modules/flows/events";
import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  arca_taxpayers,
  guided_checks,
  income_adjustments,
  invoice_customers,
  invoice_points,
  invoice_products,
  invoice_settings,
  invoices,
  legal_entities,
  monotributo_scales,
  obligations,
  organizations,
  studios,
  tax_profiles,
  type InvoiceItem,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth";
import { checkLimit, hasModule } from "@/lib/faro/entitlements";
import { ownOrganization } from "@/lib/faro/tenants";
import { allowedTypes, CBTE_TYPES, IVA_CONDITION_CODE, validCuit } from "./config";
import { fromArcaDate, invoiceTotals, ivaCode, toArcaDate } from "./calc";
import { deadlines, type TaxProfileInput } from "./calendar";
import { checkByKey, GUIDED_CHECKS } from "./checks";
import { activeEnv, loadCredential } from "./credentials";
import { SEED_SCALE, semaforo, type ScaleCategory } from "./monotributo";
import { getPersona } from "./padron";
import { ArcaError } from "./soap";
import { consultarComprobante, lastAuthorized, salesPoints, solicitarCae } from "./wsfe";

// Facturación, situación fiscal, semáforo, calendario y chequeos de un
// emisor: el autónomo (su organización propia) o una organización del estudio.
// El alcance SIEMPRE se arma con la sesión (personalIssuer / orgIssuer); los
// IDs que llegan del navegador solo se aceptan si pertenecen a ese alcance.

export { ArcaError };

export interface ArcaActor {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface IssuerScope {
  studioId: string;
  organizationId: string;
  organizationName: string;
  cuit: string;
  kind: "personal" | "studio";
  /** Puede emitir (titular, dueño o contador); el colaborador prepara borradores */
  canEmit: boolean;
  /** Rutas de este emisor: base (nueva, detalle) y home (lista) */
  base: string;
  home: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = "No encontramos ese comprobante.";
const db = () => getDb();

// ───────────── Alcance ─────────────

/** Autónomo: su organización propia y la CUIT de su cuenta */
export async function personalIssuer(user: StaffUser): Promise<IssuerScope> {
  if (user.role !== "titular" || user.tenantKind === "studio") throw new ArcaError("La facturación personal es para cuentas de Faro Personal.");
  const own = await ownOrganization(user.studioId);
  if (!own) throw new ArcaError("Tu cuenta todavía no tiene sus datos fiscales. Completalos en Bienvenida.");
  const [t] = await db().select({ cuit: studios.cuit }).from(studios).where(eq(studios.id, user.studioId));
  const [entity] = await db().select({ cuit: legal_entities.cuit }).from(legal_entities).where(and(eq(legal_entities.organization_id, own.id), eq(legal_entities.studio_id, user.studioId))).limit(1);
  const cuit = (entity?.cuit ?? t?.cuit ?? "").replace(/\D/g, "");
  return { studioId: user.studioId, organizationId: own.id, organizationName: own.name, cuit, kind: "personal", canEmit: true, base: "/facturacion", home: "/facturacion" };
}

/** Organización del estudio (validada contra el estudio de la sesión) */
export async function orgIssuer(user: StaffUser, orgId: string, cuit?: string | null): Promise<IssuerScope> {
  if (!UUID.test(orgId)) throw new ArcaError("Organización inválida.");
  if (user.tenantKind !== "studio" || !["dueno", "contador", "colaborador"].includes(user.role)) throw new ArcaError("Sin permiso.");
  const [org] = await db().select({ id: organizations.id, name: organizations.name }).from(organizations).where(and(eq(organizations.id, orgId), eq(organizations.studio_id, user.studioId)));
  if (!org) throw new ArcaError("No encontramos esa organización.");
  const entities = await db().select({ cuit: legal_entities.cuit }).from(legal_entities).where(and(eq(legal_entities.organization_id, org.id), eq(legal_entities.studio_id, user.studioId))).orderBy(asc(legal_entities.created_at));
  const wanted = cuit?.replace(/\D/g, "");
  const chosen = entities.find((e) => (e.cuit ?? "").replace(/\D/g, "") === wanted) ?? entities[0];
  return {
    studioId: user.studioId,
    organizationId: org.id,
    organizationName: org.name,
    cuit: (chosen?.cuit ?? "").replace(/\D/g, ""),
    kind: "studio",
    canEmit: user.role === "dueno" || user.role === "contador",
    base: `/admin/organizaciones/${org.id}/arca`,
    home: `/admin/organizaciones/${org.id}?tab=arca`,
  };
}

/** Alcance para herramientas (Vigía, MCP, Flujos): el tenant y el rol salen del contexto validado */
export async function issuerForTool(studioId: string, role: string, orgId?: string | null): Promise<IssuerScope> {
  const [t] = await db().select({ kind: studios.kind }).from(studios).where(eq(studios.id, studioId));
  if (!t) throw new ArcaError("Cuenta inexistente.");
  if (t.kind !== "studio") {
    if (role !== "titular") throw new ArcaError("Sin permiso.");
    return personalIssuer({ id: "", name: "", email: "", role: "titular", studioId, tenantKind: t.kind } as StaffUser);
  }
  if (!orgId) throw new ArcaError("Indicá la organización.");
  return orgIssuer({ id: "", name: "", email: "", role, studioId, tenantKind: "studio" } as StaffUser, orgId);
}

/** Alcance de un formulario: con `org` es una organización del estudio; sin, la cuenta personal */
export async function issuerFromForm(user: StaffUser, fd: FormData) {
  const org = String(fd.get("org") ?? "");
  return org ? orgIssuer(user, org, String(fd.get("cuit") ?? "") || null) : personalIssuer(user);
}

export async function requireArca(scope: IssuerScope) {
  if (!(await hasModule(scope.studioId, "arca"))) throw new ArcaError("La integración con ARCA no está incluida en tu plan.");
}

const actorOf = (u: StaffUser | ArcaActor): ArcaActor => ({ id: u.id, email: u.email, name: u.name, role: u.role });

// ───────────── Datos del emisor ─────────────

export async function getSettings(scope: IssuerScope) {
  const [s] = await db()
    .select()
    .from(invoice_settings)
    .where(and(eq(invoice_settings.organization_id, scope.organizationId), eq(invoice_settings.studio_id, scope.studioId), eq(invoice_settings.cuit, scope.cuit)));
  if (s) return s;
  const situation = await latestSituation(scope);
  const data = situation?.data as { name?: string; regime?: string; address?: string | null } | undefined;
  const [entity] = await db().select().from(legal_entities).where(and(eq(legal_entities.organization_id, scope.organizationId), eq(legal_entities.studio_id, scope.studioId))).limit(1);
  const iva = data?.regime === "responsable_inscripto" ? "responsable_inscripto" : data?.regime === "exento" ? "exento" : entity?.regime === "responsable_inscripto" ? "responsable_inscripto" : "monotributo";
  return {
    id: null,
    studio_id: scope.studioId,
    organization_id: scope.organizationId,
    cuit: scope.cuit,
    business_name: data?.name ?? entity?.business_name ?? scope.organizationName,
    iva_condition: iva,
    address: data?.address ?? entity?.tax_address ?? null,
    activity_start: null,
    iibb: null,
    logo_path: null,
    color: "#1c2235",
    email: null,
    phone: null,
    website: null,
    footer: null,
  } as unknown as typeof invoice_settings.$inferSelect & { id: string | null };
}

export interface SettingsInput {
  businessName: string;
  ivaCondition: string;
  address?: string | null;
  activityStart?: string | null;
  iibb?: string | null;
  color?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  footer?: string | null;
  logoPath?: string | null;
}

export async function saveSettings(scope: IssuerScope, i: SettingsInput, actor: ArcaActor) {
  if (!["monotributo", "responsable_inscripto", "exento"].includes(i.ivaCondition)) throw new ArcaError("Condición frente al IVA inválida.");
  if (i.color && !/^#[0-9a-f]{6}$/i.test(i.color)) throw new ArcaError("El color tiene que ser un código como #1c2235.");
  const values = {
    studio_id: scope.studioId,
    organization_id: scope.organizationId,
    cuit: scope.cuit,
    business_name: i.businessName.slice(0, 160),
    iva_condition: i.ivaCondition,
    address: i.address || null,
    activity_start: i.activityStart || null,
    iibb: i.iibb || null,
    color: i.color || "#1c2235",
    email: i.email || null,
    phone: i.phone || null,
    website: i.website || null,
    footer: i.footer?.slice(0, 300) || null,
    ...(i.logoPath !== undefined ? { logo_path: i.logoPath } : {}),
  };
  await db()
    .insert(invoice_settings)
    .values(values)
    .onConflictDoUpdate({ target: [invoice_settings.organization_id, invoice_settings.cuit], set: values });
  await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "facturacion.datos", entityType: "emisor", entityId: scope.organizationId });
}

// ───────────── Situación (constancia de inscripción) ─────────────

export async function latestSituation(scope: IssuerScope) {
  const [r] = await db()
    .select()
    .from(arca_taxpayers)
    .where(and(eq(arca_taxpayers.studio_id, scope.studioId), eq(arca_taxpayers.organization_id, scope.organizationId), eq(arca_taxpayers.cuit, scope.cuit)))
    .orderBy(desc(arca_taxpayers.fetched_at))
    .limit(1);
  return r ?? null;
}

export async function situationHistory(scope: IssuerScope) {
  return db()
    .select({ id: arca_taxpayers.id, fetchedAt: arca_taxpayers.fetched_at, validation: arca_taxpayers.validation, error: arca_taxpayers.error, environment: arca_taxpayers.environment })
    .from(arca_taxpayers)
    .where(and(eq(arca_taxpayers.studio_id, scope.studioId), eq(arca_taxpayers.organization_id, scope.organizationId), eq(arca_taxpayers.cuit, scope.cuit)))
    .orderBy(desc(arca_taxpayers.fetched_at))
    .limit(10);
}

/** Consulta la constancia de inscripción y la guarda con su registro original */
export async function fetchSituation(scope: IssuerScope, actor: ArcaActor) {
  await requireArca(scope);
  if (!/^\d{11}$/.test(scope.cuit)) throw new ArcaError("Falta la CUIT del emisor.");
  const cred = await loadCredential();
  try {
    const r = await getPersona(cred, scope.cuit);
    const [row] = await db()
      .insert(arca_taxpayers)
      .values({ studio_id: scope.studioId, organization_id: scope.organizationId, cuit: scope.cuit, source: "ws_sr_constancia_inscripcion", environment: cred.env, external_id: scope.cuit, validation: r.errors.length ? "a_revisar" : "validado", data: r.data as unknown as Record<string, unknown>, raw: r.raw, error: r.errors.join(" · ") || null, fetched_by: actor.id })
      .returning();
    // Mantiene el perfil fiscal al día (régimen y categoría)
    if (r.data.regime === "monotributo" || r.data.regime === "responsable_inscripto")
      await db()
        .insert(tax_profiles)
        .values({ studio_id: scope.studioId, organization_id: scope.organizationId, cuit: scope.cuit, regime: r.data.regime, category: r.data.category })
        .onConflictDoUpdate({ target: tax_profiles.organization_id, set: { cuit: scope.cuit, regime: r.data.regime, category: r.data.category } });
    await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "arca.consulta_padron", entityType: "contribuyente", entityId: row.id, metadata: { cuit: scope.cuit, ambiente: cred.env } });
    return row;
  } catch (e) {
    const msg = e instanceof ArcaError ? e.message : "No se pudo consultar ARCA.";
    await db().insert(arca_taxpayers).values({ studio_id: scope.studioId, organization_id: scope.organizationId, cuit: scope.cuit, source: "ws_sr_constancia_inscripcion", environment: cred.env, validation: "error", data: {}, raw: e instanceof ArcaError ? (e.raw ?? null) : null, error: msg, fetched_by: actor.id });
    await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "arca.consulta_padron", result: "error", metadata: { cuit: scope.cuit, error: msg } });
    throw e instanceof ArcaError ? e : new ArcaError(msg);
  }
}

// ───────────── Puntos de venta, clientes y productos ─────────────

export async function listPoints(scope: IssuerScope) {
  return db()
    .select()
    .from(invoice_points)
    .where(and(eq(invoice_points.studio_id, scope.studioId), eq(invoice_points.organization_id, scope.organizationId), eq(invoice_points.cuit, scope.cuit)))
    .orderBy(asc(invoice_points.number));
}

/** Trae de ARCA los puntos de venta habilitados para web services (también prueba la delegación) */
export async function syncPoints(scope: IssuerScope, actor: ArcaActor) {
  await requireArca(scope);
  const cred = await loadCredential();
  const list = await salesPoints(cred, scope.cuit);
  for (const p of list)
    await db()
      .insert(invoice_points)
      .values({ studio_id: scope.studioId, organization_id: scope.organizationId, cuit: scope.cuit, number: p.number, kind: p.kind, blocked: p.blocked, synced_at: new Date() })
      .onConflictDoUpdate({ target: [invoice_points.organization_id, invoice_points.cuit, invoice_points.number], set: { kind: p.kind, blocked: p.blocked, synced_at: new Date() } });
  await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "arca.puntos_venta", metadata: { cuit: scope.cuit, cantidad: list.length } });
  return list;
}

export async function listCustomers(scope: IssuerScope) {
  return db().select().from(invoice_customers).where(and(eq(invoice_customers.studio_id, scope.studioId), eq(invoice_customers.organization_id, scope.organizationId))).orderBy(asc(invoice_customers.name)).limit(500);
}

export interface CustomerInput {
  docType: number;
  docNumber: string;
  name: string;
  ivaCondition: string;
  email?: string | null;
  address?: string | null;
}

function cleanCustomer(c: CustomerInput) {
  const docType = [80, 86, 96, 99].includes(Number(c.docType)) ? Number(c.docType) : 99;
  const docNumber = docType === 99 ? "0" : String(c.docNumber ?? "").replace(/\D/g, "");
  if (!c.name?.trim()) throw new ArcaError("Falta el nombre del cliente.");
  if ((docType === 80 || docType === 86) && !/^\d{11}$/.test(docNumber)) throw new ArcaError("La CUIT o CUIL del cliente tiene que tener 11 números.");
  if (docType === 96 && !/^\d{7,8}$/.test(docNumber)) throw new ArcaError("El DNI del cliente tiene que tener 7 u 8 números.");
  if (!IVA_CONDITION_CODE[c.ivaCondition]) throw new ArcaError("Condición frente al IVA del cliente inválida.");
  return { docType, docNumber, name: c.name.trim().slice(0, 160), ivaCondition: c.ivaCondition, email: c.email?.trim() || null, address: c.address?.trim() || null, cuitWarning: (docType === 80 || docType === 86) && !validCuit(docNumber) };
}

export async function saveCustomer(scope: IssuerScope, c: CustomerInput, id?: string | null) {
  const v = cleanCustomer(c);
  const values = { studio_id: scope.studioId, organization_id: scope.organizationId, doc_type: v.docType, doc_number: v.docNumber, name: v.name, iva_condition: v.ivaCondition, email: v.email, address: v.address };
  if (id) {
    if (!UUID.test(id)) throw new ArcaError("Cliente inválido.");
    const [r] = await db().update(invoice_customers).set(values).where(and(eq(invoice_customers.id, id), eq(invoice_customers.organization_id, scope.organizationId), eq(invoice_customers.studio_id, scope.studioId))).returning();
    if (!r) throw new ArcaError("No encontramos ese cliente.");
    return r;
  }
  const [r] = await db().insert(invoice_customers).values(values).returning();
  return r;
}

export async function deleteCustomer(scope: IssuerScope, id: string) {
  if (!UUID.test(id)) return;
  await db().delete(invoice_customers).where(and(eq(invoice_customers.id, id), eq(invoice_customers.organization_id, scope.organizationId), eq(invoice_customers.studio_id, scope.studioId)));
}

export async function listProducts(scope: IssuerScope) {
  return db().select().from(invoice_products).where(and(eq(invoice_products.studio_id, scope.studioId), eq(invoice_products.organization_id, scope.organizationId))).orderBy(asc(invoice_products.description)).limit(500);
}

export async function saveProduct(scope: IssuerScope, p: { description: string; unitPrice: number; ivaRate: number | null }) {
  if (!p.description.trim() || !(p.unitPrice >= 0)) throw new ArcaError("Revisá la descripción y el precio.");
  const [r] = await db()
    .insert(invoice_products)
    .values({ studio_id: scope.studioId, organization_id: scope.organizationId, description: p.description.trim().slice(0, 200), unit_price: String(p.unitPrice), iva_rate: p.ivaRate == null ? null : String(p.ivaRate) })
    .returning();
  return r;
}

export async function deleteProduct(scope: IssuerScope, id: string) {
  if (!UUID.test(id)) return;
  await db().delete(invoice_products).where(and(eq(invoice_products.id, id), eq(invoice_products.organization_id, scope.organizationId), eq(invoice_products.studio_id, scope.studioId)));
}

// ───────────── Comprobantes ─────────────

export interface DraftInput {
  cbteType?: number | null;
  pointOfSale: number;
  issueDate: string;
  concept: number;
  serviceFrom?: string | null;
  serviceTo?: string | null;
  paymentDue?: string | null;
  customerId?: string | null;
  customer?: CustomerInput | null;
  saveCustomer?: boolean;
  items: InvoiceItem[];
  currency?: "PES" | "DOL";
  exchangeRate?: number;
  associatedInvoiceId?: string | null;
  notes?: string | null;
}

const isDate = (d?: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
const today = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** Valida y arma un borrador (no llama a ARCA) */
export async function createDraft(scope: IssuerScope, i: DraftInput, actor: ArcaActor, origin: "manual" | "vigia" | "aprobacion" | "flujo" = "manual", existingId?: string | null) {
  await requireArca(scope);
  if (!/^\d{11}$/.test(scope.cuit)) throw new ArcaError("Falta la CUIT del emisor: cargala en los datos de facturación.");
  const settings = await getSettings(scope);
  // Los datos del emisor quedan guardados desde el primer borrador (los usa el PDF)
  if (!settings.id) await saveSettings(scope, { businessName: settings.business_name, ivaCondition: settings.iva_condition, address: settings.address }, actor);
  let customer: ReturnType<typeof cleanCustomer> & { id?: string | null };
  if (i.customerId) {
    if (!UUID.test(i.customerId)) throw new ArcaError("Cliente inválido.");
    const [c] = await db().select().from(invoice_customers).where(and(eq(invoice_customers.id, i.customerId), eq(invoice_customers.organization_id, scope.organizationId), eq(invoice_customers.studio_id, scope.studioId)));
    if (!c) throw new ArcaError("No encontramos ese cliente.");
    customer = { id: c.id, docType: c.doc_type, docNumber: c.doc_number, name: c.name, ivaCondition: c.iva_condition, email: c.email, address: c.address, cuitWarning: false };
  } else if (i.customer) {
    customer = cleanCustomer(i.customer);
    if (i.saveCustomer) customer.id = (await saveCustomer(scope, i.customer)).id;
  } else throw new ArcaError("Elegí o cargá el cliente.");

  const allowed = allowedTypes(settings.iva_condition, customer.ivaCondition);
  const cbteType = i.cbteType && allowed.includes(Number(i.cbteType)) ? Number(i.cbteType) : allowed[0];
  if (i.cbteType && !allowed.includes(Number(i.cbteType))) throw new ArcaError(`Con tu condición (${settings.iva_condition === "monotributo" ? "monotributo" : settings.iva_condition}) y la del cliente corresponde ${CBTE_TYPES[allowed[0]].label}.`);
  if ([1, 2, 3].includes(cbteType) && customer.docType !== 80) throw new ArcaError("Para comprobantes A el cliente tiene que tener CUIT.");
  const kind = CBTE_TYPES[cbteType].kind;
  let associated: typeof invoices.$inferSelect | null = null;
  if (kind !== "factura") {
    if (!i.associatedInvoiceId || !UUID.test(i.associatedInvoiceId)) throw new ArcaError("Las notas de crédito y débito tienen que indicar la factura que corrigen.");
    [associated] = await db().select().from(invoices).where(and(eq(invoices.id, i.associatedInvoiceId), eq(invoices.organization_id, scope.organizationId), eq(invoices.studio_id, scope.studioId), eq(invoices.status, "autorizada")));
    if (!associated) throw new ArcaError("La factura asociada no existe o no está autorizada.");
  }
  if (!Number.isInteger(i.pointOfSale) || i.pointOfSale < 1 || i.pointOfSale > 99998) throw new ArcaError("Elegí el punto de venta.");
  const issueDate = isDate(i.issueDate) ? i.issueDate : today();
  const concept = [1, 2, 3].includes(Number(i.concept)) ? Number(i.concept) : 2;
  const items = (i.items ?? [])
    .map((x) => ({ description: String(x.description ?? "").trim().slice(0, 200), quantity: Number(x.quantity), unitPrice: Number(x.unitPrice), ivaRate: CBTE_TYPES[cbteType].letter === "C" || CBTE_TYPES[cbteType].letter === "E" ? null : x.ivaRate == null ? 21 : Number(x.ivaRate) }))
    .filter((x) => x.description && x.quantity > 0 && x.unitPrice >= 0);
  if (!items.length) throw new ArcaError("Agregá al menos un ítem con descripción, cantidad y precio.");
  const totals = invoiceTotals(cbteType, items);
  if (totals.total <= 0) throw new ArcaError("El total tiene que ser mayor a cero.");
  const month0 = issueDate.slice(0, 8) + "01";
  const values = {
    studio_id: scope.studioId,
    organization_id: scope.organizationId,
    cuit: scope.cuit,
    environment: await activeEnv(),
    point_of_sale: i.pointOfSale,
    cbte_type: cbteType,
    issue_date: issueDate,
    concept,
    service_from: concept === 1 ? null : isDate(i.serviceFrom) ? i.serviceFrom! : month0,
    service_to: concept === 1 ? null : isDate(i.serviceTo) ? i.serviceTo! : issueDate,
    payment_due: concept === 1 ? null : isDate(i.paymentDue) ? i.paymentDue! : issueDate,
    customer_id: customer.id ?? null,
    customer_doc_type: customer.docType,
    customer_doc_number: customer.docNumber,
    customer_name: customer.name,
    customer_iva_condition: customer.ivaCondition,
    customer_email: customer.email,
    customer_address: customer.address,
    currency: i.currency === "DOL" ? "DOL" : "PES",
    exchange_rate: String(i.currency === "DOL" ? Math.max(Number(i.exchangeRate) || 1, 1) : 1),
    items,
    net: String(totals.net),
    iva: String(totals.iva),
    exempt: String(totals.exempt),
    total: String(totals.total),
    iva_breakdown: totals.ivaBreakdown,
    associated_invoice_id: associated?.id ?? null,
    notes: i.notes?.slice(0, 500) || null,
    origin,
    status: "borrador",
    error: null,
  };
  if (existingId) {
    if (!UUID.test(existingId)) throw new ArcaError(NOT_FOUND);
    const [r] = await db()
      .update(invoices)
      .set(values)
      .where(and(eq(invoices.id, existingId), eq(invoices.organization_id, scope.organizationId), eq(invoices.studio_id, scope.studioId), inArray(invoices.status, ["borrador", "rechazada"])))
      .returning();
    if (!r) throw new ArcaError("Ese comprobante ya no se puede editar.");
    return r;
  }
  const [r] = await db().insert(invoices).values({ ...values, created_by: actor.id }).returning();
  await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "factura.borrador", entityType: "factura", entityId: r.id, metadata: { tipo: CBTE_TYPES[cbteType].label, total: totals.total, origen: origin } });
  return r;
}

export async function getInvoice(scope: IssuerScope, id: string) {
  if (!UUID.test(id)) return null;
  const [r] = await db().select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.organization_id, scope.organizationId), eq(invoices.studio_id, scope.studioId)));
  return r ?? null;
}

export async function listInvoices(scope: IssuerScope, f: { status?: string | null; q?: string | null; limit?: number } = {}) {
  return db()
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.studio_id, scope.studioId),
        eq(invoices.organization_id, scope.organizationId),
        f.status ? eq(invoices.status, f.status) : undefined,
        f.q ? sql`${invoices.customer_name} ilike ${`%${f.q.slice(0, 60)}%`}` : undefined,
      ),
    )
    .orderBy(desc(invoices.issue_date), desc(invoices.created_at))
    .limit(f.limit ?? 200);
}

export async function deleteDraft(scope: IssuerScope, id: string, actor: ArcaActor) {
  if (!UUID.test(id)) return;
  const [r] = await db().delete(invoices).where(and(eq(invoices.id, id), eq(invoices.organization_id, scope.organizationId), eq(invoices.studio_id, scope.studioId), inArray(invoices.status, ["borrador", "rechazada"]))).returning({ id: invoices.id });
  if (r) await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "factura.borrar_borrador", entityType: "factura", entityId: id });
}

/** Comprobantes autorizados del tenant en el mes (límite del plan) */
export async function invoicesThisMonth(studioId: string) {
  const first = today().slice(0, 8) + "01";
  const [r] = await db().select({ n: count() }).from(invoices).where(and(eq(invoices.studio_id, studioId), eq(invoices.status, "autorizada"), gte(invoices.authorized_at, new Date(`${first}T03:00:00Z`))));
  return r?.n ?? 0;
}

/**
 * Emite: pide el próximo número a ARCA y el CAE. Idempotente: el comprobante
 * se marca "autorizando" antes de llamar (dos clics no emiten dos veces) y, si
 * la conexión se cortó, el próximo intento consulta ARCA y recupera el CAE en
 * vez de emitir de nuevo. Requiere confirmación explícita (la pantalla la
 * pide; desde el Vigía o un flujo, pasa por Aprobaciones).
 */
export async function emitInvoice(scope: IssuerScope, id: string, actor: ArcaActor, origin: "manual" | "aprobacion" | "flujo" = "manual") {
  if (!scope.canEmit) throw new ArcaError("Tu rol puede preparar borradores, pero no emitir.");
  await requireArca(scope);
  const inv = await getInvoice(scope, id);
  if (!inv) throw new ArcaError(NOT_FOUND);
  if (inv.status === "autorizada") return inv;
  if (!["borrador", "error", "rechazada"].includes(inv.status)) throw new ArcaError("Ese comprobante se está emitiendo. Esperá unos segundos.");
  const limitMsg = await checkLimit(scope.studioId, "invoicesPerMonth");
  if (limitMsg) throw new ArcaError(limitMsg);
  const [claimed] = await db()
    .update(invoices)
    .set({ status: "autorizando", error: null })
    .where(and(eq(invoices.id, inv.id), inArray(invoices.status, ["borrador", "error", "rechazada"])))
    .returning();
  if (!claimed) throw new ArcaError("Ese comprobante se está emitiendo. Esperá unos segundos.");
  const cred = await loadCredential(inv.environment as "homologacion" | "produccion");
  const finish = async (set: Partial<typeof invoices.$inferInsert>) => {
    const [r] = await db().update(invoices).set(set).where(eq(invoices.id, inv.id)).returning();
    return r;
  };
  try {
    // ¿Quedó autorizado en un intento anterior que se cortó?
    if (inv.number) {
      const prev = await consultarComprobante(cred, inv.cuit, inv.point_of_sale, inv.cbte_type, inv.number);
      if (prev?.cae && Math.abs(prev.total - Number(inv.total)) < 0.01 && prev.docNro === inv.customer_doc_number) {
        const r = await finish({ status: "autorizada", cae: prev.cae, cae_due: fromArcaDate(prev.caeDue), raw_response: { recuperado: true, raw: prev.raw }, authorized_by: actor.id, authorized_at: new Date(), public_token: inv.public_token ?? randomBytes(18).toString("base64url") });
        await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "factura.emitida", entityType: "factura", entityId: inv.id, metadata: { recuperada: true, numero: inv.number, cae: prev.cae } });
        return r;
      }
    }
    const lastNro = await lastAuthorized(cred, inv.cuit, inv.point_of_sale, inv.cbte_type);
    const number = lastNro + 1;
    await finish({ number });
    let asociados: { tipo: number; ptoVta: number; nro: number; cuit: string; cbteFch: string }[] | undefined;
    if (inv.associated_invoice_id) {
      const [a] = await db().select().from(invoices).where(and(eq(invoices.id, inv.associated_invoice_id), eq(invoices.studio_id, scope.studioId)));
      if (a?.number) asociados = [{ tipo: a.cbte_type, ptoVta: a.point_of_sale, nro: a.number, cuit: a.cuit, cbteFch: toArcaDate(a.issue_date) }];
    }
    const letter = CBTE_TYPES[inv.cbte_type].letter;
    const res = await solicitarCae(cred, inv.cuit, {
      ptoVta: inv.point_of_sale,
      cbteTipo: inv.cbte_type,
      concepto: inv.concept,
      docTipo: inv.customer_doc_type,
      docNro: inv.customer_doc_number,
      cbteNro: number,
      cbteFch: toArcaDate(inv.issue_date),
      impTotal: Number(inv.total),
      impTotConc: 0,
      impNeto: Number(inv.net),
      impOpEx: Number(inv.exempt),
      impIva: Number(inv.iva),
      impTrib: 0,
      fchServDesde: inv.service_from ? toArcaDate(inv.service_from) : undefined,
      fchServHasta: inv.service_to ? toArcaDate(inv.service_to) : undefined,
      fchVtoPago: inv.payment_due ? toArcaDate(inv.payment_due) : undefined,
      monId: inv.currency,
      monCotiz: Number(inv.exchange_rate),
      condicionIvaReceptorId: IVA_CONDITION_CODE[inv.customer_iva_condition] ?? 5,
      iva: letter === "A" || letter === "B" ? inv.iva_breakdown.map((x) => ({ id: ivaCode(x.rate), baseImp: x.base, importe: x.amount })) : [],
      asociados,
    });
    if (res.approved && res.cae) {
      const r = await finish({ status: "autorizada", cae: res.cae, cae_due: fromArcaDate(res.caeDue ?? ""), observations: res.observations, raw_request: { xml: res.request }, raw_response: { xml: res.raw }, authorized_by: actor.id, authorized_at: new Date(), public_token: randomBytes(18).toString("base64url"), error: null });
      await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "factura.emitida", entityType: "factura", entityId: inv.id, metadata: { tipo: CBTE_TYPES[inv.cbte_type].label, numero: number, cae: res.cae, total: Number(inv.total), origen: origin, ambiente: cred.env } });
      await emitEvent(scope.studioId, "factura.emitida", { factura_id: inv.id, organizacion_id: scope.organizationId, total: Number(inv.total), cliente: inv.customer_name, tipo: CBTE_TYPES[inv.cbte_type].label }, inv.id);
      // Una sola verdad con Tango: lo facturado en Faro se escribe allá (si el estudio lo habilitó)
      void syncToTango(scope.studioId, inv.id);
      return r;
    }
    const detail = [...res.errors, ...res.observations].map((o) => `${o.code}: ${o.msg}`).join(" · ") || "ARCA rechazó el comprobante.";
    const r = await finish({ status: "rechazada", number: null, observations: [...res.errors, ...res.observations], error: detail, raw_request: { xml: res.request }, raw_response: { xml: res.raw } });
    await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "factura.emitida", entityType: "factura", entityId: inv.id, result: "error", metadata: { rechazo: detail } });
    return r;
  } catch (e) {
    const msg = e instanceof ArcaError ? e.message : "Error inesperado al emitir.";
    // Si se cortó la red se conserva el número reservado para recuperar el CAE en el próximo intento
    await finish({ status: "error", error: msg, ...(e instanceof ArcaError && e.code === "red" ? {} : { number: null }) });
    await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "factura.emitida", entityType: "factura", entityId: inv.id, result: "error", metadata: { error: msg } });
    throw e instanceof ArcaError ? e : new ArcaError(msg);
  }
}

/** Link para compartir: se genera al autorizar; se puede revocar o regenerar */
export async function setShare(scope: IssuerScope, id: string, on: boolean, actor: ArcaActor) {
  const inv = await getInvoice(scope, id);
  if (!inv || inv.status !== "autorizada") throw new ArcaError(NOT_FOUND);
  const token = on ? randomBytes(18).toString("base64url") : null;
  await db().update(invoices).set({ public_token: token }).where(eq(invoices.id, inv.id));
  await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: on ? "factura.link" : "factura.link_revocado", entityType: "factura", entityId: inv.id });
  return token;
}

export async function invoiceByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const [r] = await db().select().from(invoices).where(and(eq(invoices.public_token, token), eq(invoices.status, "autorizada")));
  return r ?? null;
}

export async function settingsForInvoice(inv: typeof invoices.$inferSelect) {
  const [s] = await db().select().from(invoice_settings).where(and(eq(invoice_settings.organization_id, inv.organization_id), eq(invoice_settings.cuit, inv.cuit), eq(invoice_settings.studio_id, inv.studio_id)));
  return s ?? null;
}

// ───────────── Semáforo de monotributo ─────────────

export async function currentScale() {
  const [s] = await db().select().from(monotributo_scales).where(lte(monotributo_scales.valid_from, today())).orderBy(desc(monotributo_scales.valid_from)).limit(1);
  if (s) return s;
  // Sin escalas cargadas: se siembra la de referencia, marcada "a validar"
  const [seeded] = await db()
    .insert(monotributo_scales)
    .values({ valid_from: SEED_SCALE.validFrom, status: "a_validar", source: SEED_SCALE.source, categories: SEED_SCALE.categories })
    .onConflictDoNothing()
    .returning();
  return seeded ?? (await db().select().from(monotributo_scales).orderBy(desc(monotributo_scales.valid_from)).limit(1))[0];
}

/** Facturación por mes (autorizada en Faro, notas de crédito restando, más lo cargado a mano) */
export async function incomeByMonth(scope: IssuerScope, from: string) {
  const rows = await db()
    .select({ month: sql<string>`to_char(${invoices.issue_date}, 'YYYY-MM')`, type: invoices.cbte_type, total: sql<string>`sum(${invoices.total} * ${invoices.exchange_rate})` })
    .from(invoices)
    .where(and(eq(invoices.studio_id, scope.studioId), eq(invoices.organization_id, scope.organizationId), eq(invoices.cuit, scope.cuit), eq(invoices.status, "autorizada"), gte(invoices.issue_date, from)))
    .groupBy(sql`1`, invoices.cbte_type);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.month] = (out[r.month] ?? 0) + (CBTE_TYPES[r.type]?.kind === "nota_credito" ? -1 : 1) * Number(r.total);
  const adj = await db().select().from(income_adjustments).where(and(eq(income_adjustments.studio_id, scope.studioId), eq(income_adjustments.organization_id, scope.organizationId), gte(income_adjustments.month, from.slice(0, 7))));
  for (const a of adj) out[a.month] = (out[a.month] ?? 0) + Number(a.amount);
  return { byMonth: out, adjustments: adj };
}

export async function semaforoFor(scope: IssuerScope) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const fromIso = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-01`;
  const [scale, profile, inc] = await Promise.all([currentScale(), profileFor(scope), incomeByMonth(scope, fromIso)]);
  return { ...semaforo({ byMonth: inc.byMonth, category: profile?.category ?? null, scale: scale.categories as ScaleCategory[], today: now }), scale, adjustments: inc.adjustments, profile };
}

export async function saveAdjustment(scope: IssuerScope, month: string, amount: number, note: string | null, actor: ArcaActor) {
  if (!/^\d{4}-\d{2}$/.test(month) || !(amount >= 0)) throw new ArcaError("Revisá el mes y el monto.");
  if (amount === 0) {
    await db().delete(income_adjustments).where(and(eq(income_adjustments.organization_id, scope.organizationId), eq(income_adjustments.studio_id, scope.studioId), eq(income_adjustments.month, month)));
    return;
  }
  await db()
    .insert(income_adjustments)
    .values({ studio_id: scope.studioId, organization_id: scope.organizationId, month, amount: String(amount), note: note?.slice(0, 200) || null, created_by: actor.id })
    .onConflictDoUpdate({ target: [income_adjustments.organization_id, income_adjustments.month], set: { amount: String(amount), note: note?.slice(0, 200) || null } });
}

// ───────────── Perfil fiscal y calendario personal ─────────────

export async function profileFor(scope: IssuerScope) {
  const [p] = await db().select().from(tax_profiles).where(and(eq(tax_profiles.organization_id, scope.organizationId), eq(tax_profiles.studio_id, scope.studioId)));
  return p ?? null;
}

export async function saveProfile(scope: IssuerScope, p: { regime: string; category: string | null; iibb: string; jurisdiction: string | null; autonomos: boolean; alertsEmail: boolean; alertDays: number }, actor: ArcaActor) {
  const regime = p.regime === "responsable_inscripto" ? "responsable_inscripto" : "monotributo";
  const iibb = ["simplificado", "local", "convenio", "exento"].includes(p.iibb) ? p.iibb : "simplificado";
  const values = { studio_id: scope.studioId, organization_id: scope.organizationId, cuit: scope.cuit, regime, category: regime === "monotributo" && /^[A-K]$/.test(p.category ?? "") ? p.category : null, iibb, jurisdiction: p.jurisdiction?.slice(0, 60) || null, autonomos: p.autonomos, alerts_email: p.alertsEmail, alert_days: Math.min(15, Math.max(1, Math.round(p.alertDays || 3))) };
  await db().insert(tax_profiles).values(values).onConflictDoUpdate({ target: tax_profiles.organization_id, set: values });
  await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "facturacion.perfil_fiscal", metadata: { regimen: regime, iibb } });
  await regenerateCalendar(scope);
}

/** (Re)genera los vencimientos personales de los próximos 6 meses; respeta los ya marcados */
export async function regenerateCalendar(scope: IssuerScope) {
  const p = await profileFor(scope);
  if (!p || !/^\d{11}$/.test(scope.cuit)) return 0;
  const list = deadlines({ cuit: scope.cuit, regime: p.regime as TaxProfileInput["regime"], iibb: p.iibb as TaxProfileInput["iibb"], autonomos: p.autonomos });
  await db()
    .delete(obligations)
    .where(and(eq(obligations.studio_id, scope.studioId), eq(obligations.organization_id, scope.organizationId), eq(obligations.source, "calendario_personal"), eq(obligations.status, "pendiente"), gte(obligations.due_date, today())));
  const existing = await db().select({ tax: obligations.tax, period: obligations.period }).from(obligations).where(and(eq(obligations.studio_id, scope.studioId), eq(obligations.organization_id, scope.organizationId)));
  const seen = new Set(existing.map((e) => `${e.tax}|${e.period}`));
  const rows = list.filter((d) => !seen.has(`${d.tax}|${d.period}`)).map((d) => ({ studio_id: scope.studioId, organization_id: scope.organizationId, tax: d.tax, period: d.period, due_date: d.dueDate, notes: d.note, source: "calendario_personal" }));
  if (rows.length) await db().insert(obligations).values(rows);
  return rows.length;
}

export async function personalCalendar(scope: IssuerScope) {
  return db()
    .select()
    .from(obligations)
    .where(and(eq(obligations.studio_id, scope.studioId), eq(obligations.organization_id, scope.organizationId), gte(obligations.due_date, new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10))))
    .orderBy(asc(obligations.due_date))
    .limit(60);
}

// ───────────── Chequeos guiados ─────────────

export async function checksFor(scope: IssuerScope) {
  const rows = await db().select().from(guided_checks).where(and(eq(guided_checks.organization_id, scope.organizationId), eq(guided_checks.studio_id, scope.studioId)));
  const p = await profileFor(scope);
  const regime = (p?.regime ?? "monotributo") as "monotributo" | "responsable_inscripto";
  return GUIDED_CHECKS.filter((c) => c.regimes.includes(regime)).map((c) => ({ ...c, state: rows.find((r) => r.check_key === c.key) ?? null }));
}

export async function saveCheck(scope: IssuerScope, key: string, i: { status: string; finding: string | null; amount: number | null; everyDays: number }, actor: ArcaActor) {
  const c = checkByKey(key);
  if (!c) throw new ArcaError("Chequeo desconocido.");
  const status = ["ok", "con_novedades"].includes(i.status) ? i.status : "sin_revisar";
  const every = Math.min(365, Math.max(7, Math.round(i.everyDays || c.everyDays)));
  const values = { studio_id: scope.studioId, organization_id: scope.organizationId, check_key: key, status, finding: i.finding?.slice(0, 500) || null, amount: i.amount == null ? null : String(i.amount), checked_at: new Date(), checked_by: actor.id, every_days: every, next_reminder_at: new Date(Date.now() + every * 86400000) };
  await db().insert(guided_checks).values(values).onConflictDoUpdate({ target: [guided_checks.organization_id, guided_checks.check_key], set: values });
  await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "arca.chequeo_guiado", metadata: { chequeo: key, estado: status } });
}

// ───────────── Tareas periódicas (alertas del calendario y recordatorios de chequeos) ─────────────

export async function dueAlerts() {
  const horizon = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
  return db()
    .select({ o: obligations, p: tax_profiles })
    .from(obligations)
    .innerJoin(tax_profiles, eq(tax_profiles.organization_id, obligations.organization_id))
    .where(and(eq(obligations.source, "calendario_personal"), eq(obligations.status, "pendiente"), isNull(obligations.reminded_at), gte(obligations.due_date, today()), lte(obligations.due_date, horizon), eq(tax_profiles.alerts_email, true)));
}

export async function checksDue() {
  return db().select().from(guided_checks).where(or(lt(guided_checks.next_reminder_at, new Date()), and(isNull(guided_checks.next_reminder_at), lt(guided_checks.created_at, new Date(Date.now() - 30 * 86400000)))));
}

export { actorOf };

async function syncToTango(studioId: string, invoiceId: string) {
  try {
    const { enqueueInvoice, pushPending } = await import("@/modules/tango-sync/server");
    if (await enqueueInvoice(studioId, invoiceId)) await pushPending(studioId);
  } catch (e) {
    console.error("[tango] Sincronización de la factura", (e as Error).message);
  }
}
