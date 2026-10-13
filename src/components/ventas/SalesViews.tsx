import { ShoppingBag, Store } from "lucide-react";
import Link from "next/link";
import { salesAction, salesRuleAction } from "@/app/ventas-actions";
import { Feedback } from "@/components/app/Feedback";
import { Button, EmptyState, Panel, SubmitButton, Table, ToneBadge, chipClass, fieldClass } from "@/components/ds";
import { formatAmount, formatDate } from "@/lib/format";
import { formatCuit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fullNumber } from "@/modules/arca/calc";
import { CBTE_TYPES } from "@/modules/arca/config";
import { BILLING_MODES, SALE_STATUS, buyerOf, orderTotal } from "@/modules/ventas/core";
import { salesOrders, salesStores, type SalesScope } from "@/modules/ventas/server";

// Ventas de tiendas para facturar (§2.p, B7): la regla de cada tienda (por
// venta, resumen diario o nada, con la CUIT y el punto de venta) y los
// pedidos con su estado. Facturar desde acá lo hace una persona: es la
// aprobación; sola, solo con el interruptor del Vigía.

type SP = Record<string, string | undefined>;
const FILTERS = [
  { key: "pendiente", label: "Para facturar" },
  { key: "borrador", label: "Borradores" },
  { key: "error", label: "Con error" },
  { key: "facturada", label: "Facturadas" },
  { key: "a_anular", label: "Devueltas" },
  { key: "todas", label: "Todas" },
];

export async function SalesHome({ scope, base, sp }: { scope: SalesScope; base: string; sp: SP }) {
  const filter = FILTERS.some((f) => f.key === sp.ver) ? sp.ver! : "pendiente";
  const [stores, orders] = await Promise.all([salesStores(scope), salesOrders(scope, { status: filter === "todas" ? null : filter === "a_anular" ? null : filter, storeId: sp.tienda ?? null })]);
  const list = filter === "a_anular" ? orders.filter((r) => ["a_anular", "nc_borrador", "anulada"].includes(r.o.billing_status ?? "")) : orders;
  const invoiceHref = (orgId: string, id: string) => (scope.organizationId ? `/facturacion/${id}` : `/admin/organizaciones/${orgId}/arca/${id}`);
  const selectable = (st: string | null) => ["pendiente", "error", "borrador", "nc_borrador"].includes(st ?? "");
  return (
    <div className="grid gap-5">
      <Feedback sp={sp} />
      <Panel title="Tiendas y cómo se facturan" icon={Store}>
        {stores.length === 0 ? (
          <EmptyState icon={Store} title="Todavía no hay tiendas conectadas" text={`Conectá Mercado Libre, Tiendanube, Empretienda, Shopify, WooCommerce, VTEX, Mercado Pago o la tienda física desde ${scope.organizationId ? "Stock" : "la pestaña Stock de cada organización"}.`} />
        ) : (
          <ul className="grid gap-3">
            {stores.map((st) => (
              <li key={st.id} className="grid gap-3 rounded-md border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-ui font-medium text-ink">{st.name}</span>
                    <span className="block text-meta text-muted">
                      {st.platform}
                      {scope.organizationId ? "" : ` · ${st.organization}`}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {Object.entries(st.counts)
                      .filter(([k]) => ["pendiente", "error", "borrador", "a_anular", "nc_borrador"].includes(k))
                      .map(([k, n]) => (
                        <ToneBadge key={k} tone={SALE_STATUS[k]?.tone ?? "neutral"}>
                          {n} · {SALE_STATUS[k]?.label ?? k}
                        </ToneBadge>
                      ))}
                  </span>
                </div>
                {scope.canEmit ? (
                  <form action={salesRuleAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="store" value={st.id} />
                    <label className="w-full text-meta text-muted sm:w-auto">
                      Facturar
                      <select name="mode" defaultValue={st.mode} className={cn(fieldClass, "mt-1 w-full sm:w-72")}>
                        {Object.entries(BILLING_MODES).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-meta text-muted">
                      Con la CUIT
                      <select name="cuit" defaultValue={st.cuit ?? st.cuits[0] ?? ""} className={cn(fieldClass, "mt-1 w-44")}>
                        {st.cuits.length === 0 && <option value="">Sin CUIT cargada</option>}
                        {st.cuits.map((c) => (
                          <option key={c} value={c}>
                            {formatCuit(c)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-meta text-muted">
                      Punto de venta
                      <input name="pos" type="number" min={1} max={99998} defaultValue={st.pos ?? ""} placeholder="El primero" className={cn(fieldClass, "mt-1 w-32")} />
                    </label>
                    <SubmitButton variant="secondary" pendingText="Guardando…">
                      Guardar
                    </SubmitButton>
                  </form>
                ) : (
                  <p className="text-meta text-muted">{BILLING_MODES[st.mode] ?? st.mode}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-meta text-muted">
          Las ventas quedan en borrador y las emitís desde acá. Para que se emitan solas, el titular o su contador activan «Facturar automáticamente las ventas de las tiendas» en Vigía → Automatizaciones (con pausa y resumen diario). Una devolución o cancelación de algo facturado arma la nota de crédito.
        </p>
      </Panel>

      <section aria-label="Pedidos" className="grid gap-3">
        <nav aria-label="Filtrar pedidos" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link key={f.key} href={`${base}?${new URLSearchParams({ ver: f.key, ...(sp.tienda ? { tienda: sp.tienda } : {}) })}`} className={chipClass(filter === f.key)} aria-current={filter === f.key ? "page" : undefined}>
              {f.label}
            </Link>
          ))}
        </nav>
        {list.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="No hay pedidos para mostrar" text="Las ventas pagadas llegan solas de cada tienda con una regla de facturación." />
        ) : (
          <form action={salesAction} className="grid gap-3">
            <input type="hidden" name="back" value={`${base}?ver=${filter}`} />
            <Table label="Pedidos de las tiendas" minWidth={860}>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Elegir</span>
                  </th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Pedido</th>
                  <th scope="col">Comprador</th>
                  <th scope="col" className="text-right">
                    Total
                  </th>
                  <th scope="col">Estado</th>
                  <th scope="col">Comprobante</th>
                </tr>
              </thead>
              <tbody>
                {list.map(({ o, store, org, invoice }) => {
                  const st = SALE_STATUS[o.billing_status ?? ""] ?? { label: o.billing_status ?? "—", tone: "neutral" as const };
                  return (
                    <tr key={o.id}>
                      <td>{scope.canEmit && selectable(o.billing_status) && <input type="checkbox" name="ids" value={o.id} aria-label={`Elegir el pedido ${o.external_id}`} className="size-4 accent-navy" />}</td>
                      <td className="num whitespace-nowrap">{formatDate(o.received_at.toISOString().slice(0, 10), "numeric")}</td>
                      <td>
                        <span className="num">{o.external_id}</span>
                        <span className="block text-caption text-muted">
                          {store}
                          {scope.organizationId ? "" : ` · ${org}`}
                        </span>
                      </td>
                      <td>{buyerOf(o.raw).name}</td>
                      <td className="num whitespace-nowrap text-right">{formatAmount(orderTotal(o.lines))}</td>
                      <td>
                        <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
                        {o.billing_error && <span className="block text-caption text-danger">{o.billing_error}</span>}
                      </td>
                      <td className="whitespace-nowrap">
                        {invoice?.id ? (
                          <Link href={invoiceHref(o.organization_id, invoice.id)} className="num underline underline-offset-4">
                            {CBTE_TYPES[invoice.cbte!]?.short ?? "Comp."} {fullNumber(invoice.pos!, invoice.number)}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {scope.canEmit && list.some((r) => selectable(r.o.billing_status)) && (
              <div className="flex flex-wrap gap-2">
                <Button type="submit" name="op" value="facturar">
                  Facturar y emitir los elegidos
                </Button>
                <Button type="submit" name="op" value="ignorar" variant="outline">
                  No facturar
                </Button>
              </div>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
