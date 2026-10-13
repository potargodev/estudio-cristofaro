import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { Feedback } from "@/components/app/Feedback";
import { allowedTypes, CBTE_TYPES } from "@/modules/arca/config";
import { getSettings, listCustomers, listProducts, type IssuerScope } from "@/modules/arca/server";
import { QuickInvoice } from "./QuickInvoice";

// Factura rápida (§2.p, B10): los clientes y las descripciones que más se
// usan primero, para emitir en segundos desde el celular.

export async function QuickInvoiceView({ scope, sp }: { scope: IssuerScope; sp: Record<string, string | undefined> }) {
  const [settings, customers, products, recent] = await Promise.all([
    getSettings(scope),
    listCustomers(scope),
    listProducts(scope),
    getDb()
      .select({ customerId: invoices.customer_id, items: invoices.items })
      .from(invoices)
      .where(and(eq(invoices.studio_id, scope.studioId), eq(invoices.organization_id, scope.organizationId), eq(invoices.status, "autorizada"), isNotNull(invoices.cae)))
      .orderBy(desc(invoices.created_at))
      .limit(60),
  ]);
  const order = new Map<string, number>();
  recent.forEach((r, i) => r.customerId && !order.has(r.customerId) && order.set(r.customerId, i));
  const sorted = [...customers].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  const descriptions = [...new Set([...recent.flatMap((r) => r.items.map((x) => x.description)), ...products.map((p) => p.description)])].slice(0, 30);
  const letter = CBTE_TYPES[allowedTypes(settings.iva_condition, "consumidor_final")[0]]?.letter ?? "C";
  const hidden: Record<string, string> = scope.kind === "studio" ? { org: scope.organizationId, cuit: scope.cuit } : {};
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      {!/^\d{11}$/.test(scope.cuit) ? (
        <Feedback sp={{ error: "Falta la CUIT del emisor. Cargala en los datos de facturación antes de emitir." }} />
      ) : (
        <QuickInvoice hidden={hidden} customers={sorted.map((c) => ({ id: c.id, name: c.name, doc: c.doc_number }))} descriptions={descriptions} letter={letter} />
      )}
    </div>
  );
}
