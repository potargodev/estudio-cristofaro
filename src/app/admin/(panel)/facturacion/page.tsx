import { AlertTriangle, Clock, FilePen, ReceiptText } from "lucide-react";
import Link from "next/link";
import { Feedback } from "@/components/app/Feedback";
import { MetricCard, PageHeader, Table, ToneBadge, chipClass, fieldInlineClass } from "@/components/ds";
import { ArcaStatus } from "@/components/lotes/ArcaStatus";
import { requireStaff } from "@/lib/auth";
import { formatAmount, todayAR } from "@/lib/format";
import { formatCuit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { activeEnv } from "@/modules/arca/credentials";
import { billingPanel } from "@/modules/facturacion-plus/panel";
import { BILLING_TABS } from "./tabs";

export const metadata = { title: "Facturación" };

// Panel de facturación del estudio (§2.p, B1): todas las CUIT en una pantalla
// con lo del mes, borradores, rechazos, cola, semáforo y emitir directo.

const LIGHT: Record<string, { label: string; tone: "ok" | "progress" | "danger" | "neutral" }> = { verde: { label: "Verde", tone: "ok" }, amarillo: { label: "Amarillo", tone: "progress" }, rojo: { label: "Rojo", tone: "danger" }, excluido: { label: "Excluido", tone: "danger" } };
const REGIME: Record<string, string> = { monotributo: "Monotributo", responsable_inscripto: "Responsable inscripto", exento: "Exento", otro: "Otro" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireStaff();
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : todayAR().slice(0, 7);
  const [rows, env] = await Promise.all([billingPanel(me.studioId, month), activeEnv()]);
  const q = (sp.q ?? "").trim().toLowerCase();
  const filter = sp.ver ?? "todas";
  const list = rows.filter((r) => (!q || r.businessName.toLowerCase().includes(q) || r.organizationName.toLowerCase().includes(q) || r.cuit.includes(q.replace(/\D/g, "") || "x")) && (filter === "todas" || (filter === "pendientes" && (r.drafts || r.problems || r.queued)) || (filter === "monotributo" && r.regime === "monotributo")));
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + f(r), 0);
  const queued = sum((r) => r.queued);
  return (
    <>
      <PageHeader title="Facturación" description="Todas las CUIT de la cartera: emitir, lotes y el estado de ARCA." tabs={BILLING_TABS} />
      <div className="grid gap-5">
        <Feedback sp={sp} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard icon={ReceiptText} label="Emitidos en el mes" value={sum((r) => r.month.count)} hint={formatAmount(sum((r) => r.month.total))} />
          <MetricCard icon={FilePen} label="Borradores" value={sum((r) => r.drafts)} href="/admin/facturacion?ver=pendientes" />
          <MetricCard icon={AlertTriangle} label="Rechazados o con error" value={sum((r) => r.problems)} tone={sum((r) => r.problems) ? "alert" : "default"} href="/admin/facturacion?ver=pendientes" />
          <MetricCard icon={Clock} label="En cola (ARCA)" value={queued} href="/admin/facturacion/estado" />
        </div>
        <ArcaStatus env={env} queued={queued} />
        <form method="get" className="flex flex-wrap items-end gap-2" role="search">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por nombre o CUIT" aria-label="Buscar" className={cn(fieldInlineClass, "w-56")} />
          <input type="month" name="mes" defaultValue={month} aria-label="Mes" className={cn(fieldInlineClass, "w-40")} />
          <select name="ver" defaultValue={filter} aria-label="Mostrar" className={cn(fieldInlineClass, "w-44")}>
            <option value="todas">Todas las CUIT</option>
            <option value="pendientes">Con pendientes</option>
            <option value="monotributo">Monotributo</option>
          </select>
          <button className={chipClass(false)}>Ver</button>
          <Link href="/admin/facturacion/lotes" className={cn(chipClass(false), "ml-auto")}>
            Facturar en lote
          </Link>
        </form>
        <Table label="CUIT de la cartera" minWidth={900}>
          <thead>
            <tr className="border-b border-line text-meta text-muted">
              <th className="px-3 py-2 font-medium">CUIT</th>
              <th className="px-3 py-2 text-right font-medium">Emitido en el mes</th>
              <th className="px-3 py-2 font-medium">Pendientes</th>
              <th className="px-3 py-2 font-medium">Monotributo</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.entityId} className="border-b border-line align-top last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/admin/organizaciones/${r.organizationId}?tab=arca`} className="font-medium text-ink hover:underline">
                    {r.businessName}
                  </Link>
                  <p className="text-meta text-muted">
                    {formatCuit(r.cuit)} · {REGIME[r.regime] ?? r.regime}
                    {r.organizationName !== r.businessName ? ` · ${r.organizationName}` : ""}
                  </p>
                </td>
                <td className="num px-3 py-2 text-right">
                  {formatAmount(r.month.total)}
                  <p className="text-meta text-muted">{r.month.count} {r.month.count === 1 ? "comprobante" : "comprobantes"}</p>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {r.drafts > 0 && <ToneBadge tone="neutral">{r.drafts} {r.drafts === 1 ? "borrador" : "borradores"}</ToneBadge>}
                    {r.problems > 0 && <ToneBadge tone="danger">{r.problems} con error</ToneBadge>}
                    {r.queued > 0 && <ToneBadge tone="progress">{r.queued} en cola</ToneBadge>}
                    {!r.drafts && !r.problems && !r.queued && <span className="text-meta text-muted">—</span>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {r.light ? (
                    <>
                      <ToneBadge tone={LIGHT[r.light].tone}>{LIGHT[r.light].label}</ToneBadge>
                      <p className="text-meta text-muted">
                        {r.category ? `Categoría ${r.category}` : ""}
                        {r.used != null ? ` · ${Math.round(r.used * 100)} % del tope` : ""}
                      </p>
                    </>
                  ) : (
                    <span className="text-meta text-muted">{r.regime === "monotributo" ? "Sin categoría" : "—"}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Link href={`/admin/organizaciones/${r.organizationId}/arca/nueva?cuit=${r.cuit}`} className={chipClass(false)}>
                      Emitir
                    </Link>
                    <Link href={`/admin/organizaciones/${r.organizationId}?tab=iva`} className={chipClass(false)}>
                      Libro IVA
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        {list.length === 0 && <p className="text-ui text-muted">No hay CUIT para mostrar. Cargá las razones sociales con su CUIT en cada organización.</p>}
      </div>
    </>
  );
}
