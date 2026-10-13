import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, like } from "drizzle-orm";
import { getDb } from "@/db";
import { invoice_settings, invoices, legal_entities, obligations, organizations, whatsapp_contacts } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hasModule } from "@/lib/faro/entitlements";
import { formatDate, formatMoney, todayAR } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { OrgRole } from "@/lib/permissions";
import { automationAllows } from "@/modules/agent/automations";
import { CBTE_TYPES } from "@/modules/arca/config";
import { parseIntent } from "./intent";

// Vigía por WhatsApp (§2.p, B6). Lo que escribe (o dice en un audio) un
// cliente con su número verificado: facturar, rendir un gasto, consultar y
// darse de baja o de alta de los avisos. La factura queda en borrador y se
// emite cuando la misma persona responde «SÍ» (o sola, con el interruptor
// «Facturar automáticamente lo pedido por WhatsApp» activado por el titular o
// su contador). Todo queda en la auditoría. Lo que no se entiende sigue como
// mensaje al estudio (devuelve null).

const db = () => getDb();
const PENDING_HOURS = 24;

interface Sender {
  contactId: string;
  userId: string;
  email: string;
  name: string;
  studioId: string;
  organizationId: string;
  organizationName: string;
  role: OrgRole;
  pending: (typeof whatsapp_contacts.$inferSelect)["pending"];
}
interface Outcome {
  reply: string;
  link: { type: string; id: string } | null;
  intent: string;
}

const setPending = (s: Sender, p: Sender["pending"]) => db().update(whatsapp_contacts).set({ pending: p }).where(eq(whatsapp_contacts.id, s.contactId));
const fresh = (p: Sender["pending"]) => !!p && Date.now() - new Date(p.at).getTime() < PENDING_HOURS * 3600_000;
const actorOf = (s: Sender) => ({ id: s.userId, email: s.email, name: s.name, role: "cliente" });

/** CUIT con la que factura la organización: la que tiene datos de facturación (o la primera razón social con CUIT) */
async function issuerCuit(s: Sender) {
  const [st] = await db().select({ cuit: invoice_settings.cuit }).from(invoice_settings).where(and(eq(invoice_settings.organization_id, s.organizationId), eq(invoice_settings.studio_id, s.studioId))).orderBy(asc(invoice_settings.created_at)).limit(1);
  if (st) return st.cuit;
  const [le] = await db().select({ cuit: legal_entities.cuit }).from(legal_entities).where(and(eq(legal_entities.organization_id, s.organizationId), eq(legal_entities.studio_id, s.studioId), isNotNull(legal_entities.cuit))).limit(1);
  return le?.cuit ?? null;
}

const label = (inv: typeof invoices.$inferSelect) => `${CBTE_TYPES[inv.cbte_type]?.label ?? "Factura"} ${String(inv.point_of_sale).padStart(5, "0")}-${String(inv.number ?? 0).padStart(8, "0")}`;

async function emitPending(s: Sender, invoiceId: string): Promise<string> {
  const { emitInvoice } = await import("@/modules/arca/server");
  const { scopeOf } = await import("@/modules/arca/queue");
  const [d] = await db().select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.organization_id, s.organizationId), eq(invoices.studio_id, s.studioId)));
  if (!d) return "No encontré la factura para emitir. Armala de nuevo.";
  const scope = await scopeOf(d);
  let inv = d;
  try {
    if (d.status === "borrador") inv = await emitInvoice(scope, d.id, actorOf(s), "whatsapp");
  } catch (e) {
    return `No pude emitirla: ${(e as Error).message}. Quedó en borrador para que el estudio la revise.`;
  }
  if (inv.status === "autorizada") return `Listo: emitimos la ${label(inv)} a ${inv.customer_name} por ${formatMoney(Math.round(Number(inv.total) * 100))}. CAE ${inv.cae}. La ves en tu portal.`;
  if (inv.status === "en_cola") return `ARCA no está respondiendo: la factura quedó en cola con el número ${inv.reserved_number ?? "previsto"} y sale sola apenas vuelva: la ves en tu portal.`;
  return `ARCA no la autorizó: ${inv.error ?? "revisá los datos"}. Quedó en borrador para que el estudio la revise.`;
}

async function invoiceFrom(s: Sender, i: Extract<ReturnType<typeof parseIntent>, { kind: "factura" }>, messageId: string): Promise<Outcome> {
  if (!can(s.role, "finanzas.gestionar")) return { reply: "Tu rol en la organización no puede facturar. Pedíselo a quien gestiona las finanzas.", link: null, intent: "factura" };
  if (!(await hasModule(s.studioId, "arca"))) return { reply: "Tu estudio todavía no factura con Faro. Le pasamos el pedido.", link: null, intent: "factura" };
  const cuit = await issuerCuit(s);
  if (!cuit) return { reply: "Todavía no hay una CUIT para facturar en Faro. Le pasamos el pedido al estudio.", link: null, intent: "factura" };
  const { createDraft, getSettings, listPoints, lookupTaxpayer, ArcaError } = await import("@/modules/arca/server");
  const { scopeOf } = await import("@/modules/arca/queue");
  const scope = await scopeOf({ studio_id: s.studioId, organization_id: s.organizationId, cuit });
  const actor = actorOf(s);
  // Cliente: con CUIT, nombre y condición del padrón; con DNI o sin documento, consumidor final
  let customer = { docType: 99, docNumber: "0", name: i.customer ?? "Consumidor final", ivaCondition: "consumidor_final" };
  if (i.doc?.length === 11) {
    customer = { docType: 80, docNumber: i.doc, name: i.customer ?? i.doc, ivaCondition: "consumidor_final" };
    try {
      const p = await lookupTaxpayer(s.studioId, i.doc, actor);
      customer = { ...customer, name: p.name || customer.name, ivaCondition: p.regime === "otro" ? "consumidor_final" : p.regime };
    } catch {
      /* sin padrón: queda como consumidor final con CUIT, a revisar */
    }
  } else if (i.doc) customer = { docType: 96, docNumber: i.doc, name: i.customer ?? "Consumidor final", ivaCondition: "consumidor_final" };
  const settings = await getSettings(scope);
  const discriminates = settings.iva_condition === "responsable_inscripto";
  const total = i.amount / 100;
  const pos = (await listPoints(scope)).find((p) => !p.blocked)?.number ?? 1;
  try {
    const draft = await createDraft(scope, { pointOfSale: pos, issueDate: todayAR(), concept: 2, customer, items: [{ description: i.description, quantity: 1, unitPrice: discriminates ? Math.round((total / 1.21) * 100) / 100 : total, ivaRate: 21 }], idempotencyKey: `whatsapp:${messageId}` }, actor, "whatsapp");
    const auto = await automationAllows(s.studioId, s.organizationId, "facturacion.whatsapp");
    await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "whatsapp.factura", entityType: "factura", entityId: draft.id, metadata: { importe: i.amount, automatica: auto } });
    if (auto) return { reply: await emitPending(s, draft.id), link: { type: "factura", id: draft.id }, intent: "factura" };
    await setPending(s, { type: "factura", id: draft.id, at: new Date().toISOString() });
    return { reply: `Armé la ${CBTE_TYPES[draft.cbte_type]?.label ?? "factura"} a ${draft.customer_name} por ${formatMoney(Math.round(Number(draft.total) * 100))} (${i.description}). Respondé SÍ para emitirla o NO para descartarla.`, link: { type: "factura", id: draft.id }, intent: "factura" };
  } catch (e) {
    if (e instanceof ArcaError) return { reply: `No pude armar la factura: ${e.message}`, link: null, intent: "factura" };
    throw e;
  }
}

async function answer(s: Sender, topic: "facturado" | "vencimientos" | "monotributo"): Promise<string> {
  const today = todayAR();
  if (topic === "facturado") {
    const rows = await db()
      .select({ type: invoices.cbte_type, total: invoices.total })
      .from(invoices)
      .where(and(eq(invoices.studio_id, s.studioId), eq(invoices.organization_id, s.organizationId), eq(invoices.status, "autorizada"), gte(invoices.issue_date, `${today.slice(0, 7)}-01`)));
    const sum = rows.reduce((t, r) => t + (CBTE_TYPES[r.type]?.kind === "nota_credito" ? -1 : 1) * Math.round(Number(r.total) * 100), 0);
    return `Este mes ${s.organizationName} facturó ${formatMoney(sum)} en ${rows.length} comprobante${rows.length === 1 ? "" : "s"} emitidos con Faro.`;
  }
  if (topic === "vencimientos") {
    const rows = await db()
      .select({ tax: obligations.tax, due: obligations.due_date, period: obligations.period })
      .from(obligations)
      .where(and(eq(obligations.studio_id, s.studioId), eq(obligations.organization_id, s.organizationId), inArray(obligations.status, ["pendiente"]), gte(obligations.due_date, today)))
      .orderBy(asc(obligations.due_date))
      .limit(5);
    if (!rows.length) return "No tenés vencimientos pendientes cargados. Cualquier duda, escribile al estudio.";
    return `Tus próximos vencimientos:\n${rows.map((r) => `• ${r.tax} ${r.period}: ${formatDate(r.due, "numeric")}`).join("\n")}`;
  }
  const cuit = await issuerCuit(s);
  if (!cuit || !(await hasModule(s.studioId, "arca"))) return "Todavía no tenemos tu facturación en Faro para calcular el semáforo. Le pasamos la consulta al estudio.";
  const { semaforoFor } = await import("@/modules/arca/server");
  const { scopeOf } = await import("@/modules/arca/queue");
  const sm = await semaforoFor(await scopeOf({ studio_id: s.studioId, organization_id: s.organizationId, cuit }));
  return `${sm.message} (según lo facturado en Faro; no es una revisión profesional).`;
}

/** Procesa un texto (o la transcripción de un audio). null: no es un pedido para el Vigía, sigue como mensaje al estudio */
export async function vigiaReply(s: Sender, text: string, messageId: string): Promise<Outcome | null> {
  const i = parseIntent(text);
  const actor = actorOf(s);
  switch (i.kind) {
    case "baja":
    case "alta": {
      await db().update(whatsapp_contacts).set({ opt_in_avisos: i.kind === "alta" }).where(eq(whatsapp_contacts.id, s.contactId));
      await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "whatsapp.avisos", entityType: "whatsapp_contacto", entityId: s.userId, metadata: { avisos: i.kind === "alta", canal: "whatsapp" } });
      return { reply: i.kind === "baja" ? "Listo, no te mandamos más avisos por WhatsApp. Si cambiás de idea, escribí ALTA." : "Listo, vas a volver a recibir los avisos por WhatsApp. Para dejar de recibirlos, escribí BAJA.", link: null, intent: i.kind };
    }
    case "si":
    case "no": {
      if (!fresh(s.pending) || s.pending?.type !== "factura" || !s.pending.id) return s.pending?.type === "gasto" ? { reply: "Para cargar el gasto mandame la foto del ticket.", link: null, intent: i.kind } : null;
      const id = s.pending.id;
      await setPending(s, null);
      if (i.kind === "no") {
        await db().delete(invoices).where(and(eq(invoices.id, id), eq(invoices.status, "borrador"), eq(invoices.organization_id, s.organizationId), eq(invoices.studio_id, s.studioId)));
        await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "whatsapp.factura_descartada", entityType: "factura", entityId: id });
        return { reply: "Listo, la descarté.", link: null, intent: "no" };
      }
      await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "whatsapp.factura_confirmada", entityType: "factura", entityId: id });
      return { reply: await emitPending(s, id), link: { type: "factura", id }, intent: "si" };
    }
    case "factura":
      return invoiceFrom(s, i, messageId);
    case "gasto": {
      if (!can(s.role, "gastos.rendir")) return null;
      await setPending(s, { type: "gasto", amount: i.amount, description: i.description, at: new Date().toISOString() });
      return { reply: `Anotado: ${i.description} por ${formatMoney(i.amount)}. Mandame la foto del ticket y lo cargo para rendir.`, link: null, intent: "gasto" };
    }
    case "consulta":
      return { reply: await answer(s, i.topic), link: null, intent: `consulta.${i.topic}` };
    default:
      return null;
  }
}

/** Una foto o PDF que llega con un gasto esperando el ticket: se carga la rendición */
export async function receiptForPending(s: Sender, file: File): Promise<Outcome | null> {
  if (!fresh(s.pending) || s.pending?.type !== "gasto" || !s.pending.amount) return null;
  const { createReimbursement } = await import("@/modules/gastos/server/reimbursements");
  const me = { id: s.userId, email: s.email, name: s.name, studioId: s.studioId, organizationId: s.organizationId, organizationName: s.organizationName, orgRole: s.role } as Parameters<typeof createReimbursement>[0];
  const r = await createReimbursement(me, { description: s.pending.description ?? "Gasto", amount: s.pending.amount, currency: "ARS", date: todayAR(), category: "otros", receipt: file });
  await setPending(s, null);
  return { reply: `Listo: cargué la rendición de ${r.description} por ${formatMoney(r.amount)}. La aprueba quien gestiona las finanzas.`, link: { type: "rendicion", id: r.id }, intent: "gasto.ticket" };
}

/** Facturas pedidas por WhatsApp en los últimos 30 días (para el Vigía del estudio) */
export async function whatsappInvoices(studioId: string) {
  return db()
    .select({ organizationId: invoices.organization_id, organization: organizations.name, customer: invoices.customer_name, total: invoices.total, status: invoices.status, createdAt: invoices.created_at })
    .from(invoices)
    .innerJoin(organizations, eq(organizations.id, invoices.organization_id))
    .where(and(eq(invoices.studio_id, studioId), like(invoices.idempotency_key, "whatsapp:%"), gte(invoices.created_at, new Date(Date.now() - 30 * 86400_000))))
    .orderBy(desc(invoices.created_at))
    .limit(50);
}
