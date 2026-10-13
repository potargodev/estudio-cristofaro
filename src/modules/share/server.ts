import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, invoices, memberships, organizations, payroll_items, share_links, whatsapp_messages } from "@/db/schema";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { isStudioRole } from "@/lib/roles";
import { readStored } from "@/lib/uploads";
import { normalizePhone } from "@/modules/whatsapp/core";

// Compartir documentos (A4): link público, revocable y con vencimiento para
// comprobantes, recibos de sueldo y documentos del portal, y envío por
// WhatsApp: con la API de Meta si el estudio la tiene activa (plantilla
// «faro_documento», con acuses) y si no, con el enlace wa.me que abre el
// WhatsApp de quien envía. Todo queda registrado y en la auditoría.

export const SHARE_TYPES = { factura: "Comprobante", recibo: "Recibo de sueldo", documento: "Documento" } as const;
export type ShareType = keyof typeof SHARE_TYPES;
export const isShareType = (t: string): t is ShareType => t in SHARE_TYPES;
const EXPIRY_DAYS = [1, 7, 30] as const;
export class ShareError extends Error {}

const db = () => getDb();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const base = () => (process.env.SITE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
const shareUrl = (token: string) => `${base()}/d/${token}`;

interface Target {
  studioId: string;
  organizationId: string | null;
  title: string;
}

/** El documento, si quien comparte lo puede ver (estudio, titular o miembro con permiso). Si no, null. */
async function targetOf(user: StaffUser, type: ShareType, id: string): Promise<Target | null> {
  if (!UUID.test(id)) return null;
  const staff = isStudioRole(user.role) && (!user.tenantSuspended || Boolean(user.assisted));
  const member = async (orgId: string, perm: Parameters<typeof can>[1]) => {
    const [m] = await db()
      .select({ role: memberships.role })
      .from(memberships)
      .innerJoin(organizations, and(eq(organizations.id, memberships.organization_id), eq(organizations.studio_id, user.studioId)))
      .where(and(eq(memberships.user_id, user.id), eq(memberships.organization_id, orgId), eq(memberships.status, "activa")));
    return !!m && can(m.role, perm);
  };
  if (type === "factura") {
    const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.studio_id, user.studioId), eq(invoices.status, "autorizada")));
    if (!inv) return null;
    const { CBTE_TYPES } = await import("@/modules/arca/config");
    const { fullNumber } = await import("@/modules/arca/calc");
    // El estudio, el titular de la cuenta personal o quien factura en la organización
    if (!(staff || user.role === "titular" || (await member(inv.organization_id, "documentos.ver")))) return null;
    return { studioId: inv.studio_id, organizationId: inv.organization_id, title: `${CBTE_TYPES[inv.cbte_type]?.label ?? "Comprobante"} ${fullNumber(inv.point_of_sale, inv.number)}` };
  }
  if (type === "recibo") {
    const [it] = await db().select().from(payroll_items).where(and(eq(payroll_items.id, id), eq(payroll_items.studio_id, user.studioId)));
    if (!it) return null;
    if (!(staff || (await member(it.organization_id, "sueldos.gestionar")))) return null;
    const sn = it.snapshot as Record<string, unknown>;
    return { studioId: it.studio_id, organizationId: it.organization_id, title: `Recibo de sueldo de ${String(sn.name ?? "")}`.trim() };
  }
  const [doc] = await db().select().from(documents).where(and(eq(documents.id, id), eq(documents.studio_id, user.studioId)));
  if (!doc) return null;
  if (!(staff || (await member(doc.organization_id, "documentos.ver")))) return null;
  return { studioId: doc.studio_id, organizationId: doc.organization_id, title: doc.name };
}

/** Link nuevo para un documento (vence en 1, 7 o 30 días) */
export async function createLink(user: StaffUser, type: ShareType, id: string, days = 7) {
  const t = await targetOf(user, type, id);
  if (!t) {
    await audit({ studioId: user.studioId, actor: user, action: "compartir.link", entityType: type, entityId: id, result: "denegado" });
    throw new ShareError("No encontramos ese documento.");
  }
  const d = (EXPIRY_DAYS as readonly number[]).includes(days) ? days : 7;
  const [row] = await db()
    .insert(share_links)
    .values({ studio_id: t.studioId, organization_id: t.organizationId, entity_type: type, entity_id: id, token: randomBytes(18).toString("base64url"), title: t.title, expires_at: new Date(Date.now() + d * 86_400_000), created_by: user.id })
    .returning();
  await audit({ studioId: t.studioId, organizationId: t.organizationId, actor: user, action: "compartir.link", entityType: type, entityId: id, metadata: { vence: row.expires_at.toISOString(), dias: d } });
  return row;
}

export async function revokeLink(user: StaffUser, linkId: string) {
  if (!UUID.test(linkId)) throw new ShareError("Link inválido.");
  const [l] = await db().select().from(share_links).where(and(eq(share_links.id, linkId), eq(share_links.studio_id, user.studioId)));
  if (!l || !(await targetOf(user, l.entity_type as ShareType, l.entity_id))) throw new ShareError("No encontramos ese link.");
  await db().update(share_links).set({ revoked_at: new Date() }).where(eq(share_links.id, l.id));
  await audit({ studioId: l.studio_id, organizationId: l.organization_id, actor: user, action: "compartir.revocar", entityType: l.entity_type, entityId: l.entity_id, metadata: { link: l.id } });
}

/** Links vigentes y vencidos de un documento, con sus envíos por WhatsApp */
export async function linksOf(user: StaffUser, type: ShareType, id: string) {
  if (!(await targetOf(user, type, id))) return [];
  const rows = await db()
    .select()
    .from(share_links)
    .where(and(eq(share_links.studio_id, user.studioId), eq(share_links.entity_type, type), eq(share_links.entity_id, id)))
    .orderBy(desc(share_links.created_at))
    .limit(10);
  const sends = rows.length
    ? await db()
        .select()
        .from(whatsapp_messages)
        .where(and(eq(whatsapp_messages.entity_type, "share_link"), inArray(whatsapp_messages.entity_id, rows.map((r) => r.id))))
    : [];
  return rows.map((r) => ({ ...r, url: shareUrl(r.token), active: !r.revoked_at && r.expires_at > new Date(), sends: sends.filter((m) => m.entity_id === r.id) }));
}

/** El archivo de un link vigente (cuenta la vista). null si no existe, venció o se revocó. */
export async function fileForToken(token: string): Promise<{ data: Uint8Array; name: string; mime: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const [l] = await db()
    .select()
    .from(share_links)
    .where(and(eq(share_links.token, token), isNull(share_links.revoked_at), gt(share_links.expires_at, new Date())));
  if (!l) return null;
  let out: { data: Uint8Array; name: string; mime: string } | null = null;
  if (l.entity_type === "factura") {
    const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, l.entity_id), eq(invoices.studio_id, l.studio_id), eq(invoices.status, "autorizada")));
    if (inv) {
      const { invoicePdf } = await import("@/modules/arca/pdf");
      const { settingsForInvoice } = await import("@/modules/arca/server");
      out = { data: await invoicePdf(inv, await settingsForInvoice(inv)), name: `${l.title}.pdf`, mime: "application/pdf" };
    }
  } else if (l.entity_type === "recibo") {
    const [it] = await db().select({ org: payroll_items.organization_id }).from(payroll_items).where(and(eq(payroll_items.id, l.entity_id), eq(payroll_items.studio_id, l.studio_id)));
    if (it) {
      const { receiptOf } = await import("@/modules/liquidacion/server");
      const r = await receiptOf({ studioId: l.studio_id, organizationId: it.org, canManage: false, fromStudio: true }, l.entity_id);
      if (r) out = { data: new Uint8Array(r.pdf), name: r.name, mime: "application/pdf" };
    }
  } else if (l.entity_type === "documento") {
    const [doc] = await db().select().from(documents).where(and(eq(documents.id, l.entity_id), eq(documents.studio_id, l.studio_id)));
    if (doc) out = { data: new Uint8Array((await readStored(doc.storage_path)).data), name: doc.name, mime: doc.mime_type ?? "application/octet-stream" };
  }
  if (!out) return null;
  await db().update(share_links).set({ views: sql`${share_links.views} + 1`, last_viewed_at: new Date() }).where(eq(share_links.id, l.id));
  await audit({ studioId: l.studio_id, organizationId: l.organization_id, actorLabel: "Link público", action: "compartir.abrir", entityType: l.entity_type, entityId: l.entity_id, metadata: { link: l.id } });
  return out;
}

interface SendResult {
  mode: "api" | "wa.me";
  batchId: string;
  items: { id: string; title: string; url: string; waUrl: string | null; status: string; error: string | null }[];
}

/** Texto del mensaje con el link (lo que se manda por wa.me) */
const messageFor = (intro: string, title: string, url: string, expires: Date) => `${intro.trim() || "Hola, te compartimos"} ${title}: ${url} (el link vence el ${formatDate(expires.toISOString().slice(0, 10), "numeric")}).`;

/**
 * Envía uno o varios documentos del mismo tipo a un número: crea un link por
 * documento y lo manda por la API de WhatsApp si el estudio la tiene activa
 * (con acuses de entrega y lectura); si no, o si la API falla, deja el
 * enlace wa.me listo para abrir. Cada envío queda registrado (con el lote).
 */
export async function sendByWhatsApp(user: StaffUser, i: { type: ShareType; ids: string[]; phone: string; intro?: string; days?: number }): Promise<SendResult> {
  const phone = normalizePhone(i.phone);
  if (!phone) throw new ShareError("Revisá el número: con código de área, por ejemplo 11 2345 6789.");
  const ids = [...new Set(i.ids)].slice(0, 200);
  if (!ids.length) throw new ShareError("Elegí al menos un documento.");
  const batchId = randomUUID();
  const { sendDocument } = await import("@/modules/whatsapp/server");
  const items: SendResult["items"] = [];
  let api = false;
  for (const id of ids) {
    const link = await createLink(user, i.type, id, i.days ?? 7);
    const url = shareUrl(link.token);
    const expires = formatDate(link.expires_at.toISOString().slice(0, 10), "numeric");
    const sent = await sendDocument(link.studio_id, { phone, title: link.title, url, expires, organizationId: link.organization_id, linkId: link.id, batchId });
    if (sent && sent.status === "enviado") {
      api = true;
      items.push({ id, title: link.title, url, waUrl: null, status: "enviado", error: null });
      continue;
    }
    // Sin API (o si falló): wa.me con el mismo texto, registrado como «preparado»
    const text = messageFor(i.intro ?? "", link.title, url, link.expires_at);
    await db().insert(whatsapp_messages).values({ studio_id: link.studio_id, organization_id: link.organization_id, direction: "saliente", phone, kind: "documento", body: text, status: "preparado", error: sent?.error ?? null, entity_type: "share_link", entity_id: link.id, batch_id: batchId, source: "wa.me", validation: "sin_validar" });
    items.push({ id, title: link.title, url, waUrl: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`, status: "preparado", error: sent?.error ?? null });
  }
  await audit({ studioId: user.studioId, actor: user, action: "compartir.whatsapp", entityType: i.type, entityId: ids[0], metadata: { cantidad: ids.length, lote: batchId, modo: api ? "api" : "wa.me", telefono: `…${phone.slice(-4)}` } });
  return { mode: api ? "api" : "wa.me", batchId, items };
}

/** Envíos de un lote (para mostrar los enlaces wa.me listos para abrir) */
export async function batchOf(user: StaffUser, batchId: string) {
  if (!UUID.test(batchId)) return [];
  const rows = await db()
    .select({ m: whatsapp_messages, link: share_links })
    .from(whatsapp_messages)
    .innerJoin(share_links, eq(share_links.id, whatsapp_messages.entity_id))
    .where(and(eq(whatsapp_messages.studio_id, user.studioId), eq(whatsapp_messages.batch_id, batchId), eq(whatsapp_messages.entity_type, "share_link")))
    .orderBy(whatsapp_messages.created_at);
  return rows.map(({ m, link }) => ({ id: m.id, title: link.title, status: m.status, error: m.error, waUrl: m.status === "preparado" && m.body ? `https://wa.me/${m.phone}?text=${encodeURIComponent(m.body)}` : null }));
}
