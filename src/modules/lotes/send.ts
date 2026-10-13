import "server-only";
import { randomUUID } from "node:crypto";
import { zipSync } from "fflate";
import type { StaffUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { Report } from "@/lib/export-table";
import { fullNumber } from "@/modules/arca/calc";
import { CBTE_TYPES } from "@/modules/arca/config";
import { progressOf, rowsOf, type BatchScope } from "./server";
import type { BatchRow } from "./core";

// Salidas de un lote (§2.p, B2): informe en Excel o PDF, ZIP con los PDF de
// los comprobantes emitidos, envío por mail a cada cliente y por WhatsApp a
// los teléfonos de la planilla (con los links de A4).

const STATUS: Record<string, string> = { invalida: "Con errores", pendiente: "Pendiente", procesando: "Procesando", borrador: "Borrador", emitida: "Emitida", en_cola: "En cola (ARCA)", fallida: "Con error", omitida: "Omitida" };

export async function batchReport(s: BatchScope, id: string): Promise<Report> {
  const p = await progressOf(s, id);
  const rows = await rowsOf(s, id);
  return {
    title: `Lote «${p.batch.name}»`,
    subtitle: `${p.batch.rows_total} filas · ${p.by.emitida ?? 0} emitidas · ${p.by.borrador ?? 0} borradores · ${p.by.en_cola ?? 0} en cola · ${(p.by.fallida ?? 0) + (p.by.invalida ?? 0)} con errores`,
    sections: [
      {
        title: "Filas",
        header: ["Fila", "Cliente", "Total", "Estado", "Comprobante", "CAE", "Detalle"],
        rows: rows.map(({ r, inv }) => {
          const d = r.data as unknown as Partial<BatchRow>;
          return [r.row_number, inv?.customer_name ?? d.customerName ?? "", inv ? Number(inv.total) : null, STATUS[r.status] ?? r.status, inv?.number ? `${CBTE_TYPES[inv.cbte_type]?.short ?? ""} ${fullNumber(inv.point_of_sale, inv.number)}` : inv?.reserved_number ? `Previsto ${inv.reserved_number}` : "", inv?.cae ?? "", (r.errors.length ? r.errors.join(" · ") : r.last_error) ?? ""];
        }),
        widths: [0.5, 2.5, 1, 1.2, 1.6, 1.4, 3],
      },
    ],
  };
}

/** ZIP con el PDF de cada comprobante emitido del lote */
export async function batchZip(s: BatchScope, id: string) {
  const rows = (await rowsOf(s, id, { status: "emitida" })).slice(0, 2000);
  const { invoicePdf } = await import("@/modules/arca/pdf");
  const { settingsForInvoice } = await import("@/modules/arca/server");
  const { getDb } = await import("@/db");
  const { invoices } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const files: Record<string, Uint8Array> = {};
  for (const { inv } of rows) {
    if (!inv?.id) continue;
    const [full] = await getDb().select().from(invoices).where(eq(invoices.id, inv.id));
    if (!full || full.status !== "autorizada") continue;
    const name = `${CBTE_TYPES[full.cbte_type]?.short ?? "CBTE"}-${fullNumber(full.point_of_sale, full.number)}.pdf`.replace(/[^\w.-]+/g, "-");
    files[name] = await invoicePdf(full, await settingsForInvoice(full));
  }
  return zipSync(files, { level: 0 });
}

/** Mail a cada cliente con su comprobante (los que tienen mail) */
export async function sendBatchMails(s: BatchScope, actor: { id: string; email: string; name?: string; role: string }, id: string) {
  const rows = await rowsOf(s, id, { status: "emitida" });
  const { emailInvoice } = await import("@/modules/arca/mail");
  const { scopeOf } = await import("@/modules/arca/queue");
  let sent = 0;
  let skipped = 0;
  for (const { r, inv } of rows) {
    if (!inv?.id || !inv.customer_email) {
      skipped++;
      continue;
    }
    const scope = await scopeOf({ studio_id: s.studioId, organization_id: r.organization_id!, cuit: (r.data as { issuerCuit?: string }).issuerCuit ?? s.cuit ?? "" });
    if (await emailInvoice(scope, inv.id, inv.customer_email, { id: actor.id, email: actor.email, name: actor.name ?? "", role: actor.role })) sent++;
  }
  await audit({ studioId: s.studioId, actor, action: "lote.mail", entityType: "lote", entityId: id, metadata: { enviados: sent, sin_mail: skipped } });
  return { sent, skipped };
}

/** WhatsApp a los teléfonos de la planilla: un envío por número con sus comprobantes, todos en un mismo lote */
export async function sendBatchWhatsApp(s: BatchScope, me: StaffUser, id: string) {
  const rows = await rowsOf(s, id, { status: "emitida" });
  const byPhone = new Map<string, string[]>();
  for (const { r, inv } of rows) {
    const phone = (r.data as { phone?: string | null }).phone;
    if (!inv?.id || !phone) continue;
    byPhone.set(phone, [...(byPhone.get(phone) ?? []), inv.id]);
  }
  const { sendByWhatsApp } = await import("@/modules/share/server");
  const batchId = randomUUID();
  let n = 0;
  for (const [phone, ids] of byPhone) {
    try {
      n += (await sendByWhatsApp(me, { type: "factura", ids, phone, batchId })).items.length;
    } catch {
      // Un teléfono inválido no frena al resto
    }
  }
  return { batchId, sent: n, phones: byPhone.size };
}
