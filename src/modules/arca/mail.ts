import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { audit } from "@/lib/audit";
import { esc, sendMail } from "@/lib/email";
import { mailLayout } from "@/lib/notify";
import { getSiteUrl } from "@/lib/runtime-config";
import { CBTE_TYPES } from "./config";
import { fullNumber, money } from "./calc";
import { invoicePdf } from "./pdf";
import { ArcaError, getInvoice, settingsForInvoice, type ArcaActor, type IssuerScope } from "./server";

/** Manda el comprobante autorizado por mail (PDF adjunto y link) */
export async function emailInvoice(scope: IssuerScope, id: string, to: string, actor: ArcaActor) {
  const inv = await getInvoice(scope, id);
  if (!inv || inv.status !== "autorizada") throw new ArcaError("Solo se envían comprobantes autorizados.");
  const email = to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ArcaError("Revisá el mail.");
  const s = await settingsForInvoice(inv);
  const pdf = await invoicePdf(inv, s);
  const label = `${CBTE_TYPES[inv.cbte_type].label} ${fullNumber(inv.point_of_sale, inv.number)}`;
  const link = inv.public_token ? `${getSiteUrl()}/f/${inv.public_token}` : null;
  const body = `<p>Hola, ${esc(inv.customer_name)}:</p><p>Te enviamos la ${esc(label)} de <strong>${esc(s?.business_name ?? "")}</strong> por <strong>${esc(money(Number(inv.total), inv.currency))}</strong>. Va adjunta en PDF.</p>${inv.payment_url ? `<p><a href="${esc(inv.payment_url)}">Pagar en línea</a></p>` : ""}`;
  const sent = await sendMail({
    to: email,
    subject: `${label} · ${s?.business_name ?? ""}`,
    html: mailLayout(label, body, link ? { href: link, label: "Ver el comprobante" } : undefined, s?.business_name ?? "Faro"),
    replyTo: s?.email ?? undefined,
    attachments: [{ filename: `${label.replace(/\s+/g, "_")}.pdf`, content: Buffer.from(pdf).toString("base64"), encoding: "base64", contentType: "application/pdf" }],
  });
  if (sent) await getDb().update(invoices).set({ emailed_at: new Date(), customer_email: email }).where(eq(invoices.id, inv.id));
  await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "factura.enviada", entityType: "factura", entityId: inv.id, result: sent ? "ok" : "error", metadata: { para: email, enviado: sent } });
  return sent;
}
