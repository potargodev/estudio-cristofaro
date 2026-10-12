import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { requireFaro } from "@/lib/auth";
import { subscriptionsOverview } from "@/modules/billing/subscriptions";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Suscripciones" };

const STATUS: Record<string, string> = { prueba: "En prueba", activa: "Activa", morosa: "Morosa", suspendida: "Suspendida", cancelada: "Cancelada" };

/** Altas, bajas, ingresos y morosos de las suscripciones de Faro */
export default async function Page({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const sp = await searchParams;
  await requireFaro();
  const o = await subscriptionsOverview();
  const rows = sp.estado ? o.rows.filter((r) => r.status === sp.estado) : o.rows;
  const cards: [string, string | number, string?][] = [
    ["Ingresos del mes", formatMoney(o.income, "ARS", { decimals: "none" }), `${o.payments} pagos`],
    ["Ingreso mensual recurrente", formatMoney(o.mrr, "ARS", { decimals: "none" })],
    ["Altas del mes", o.altas],
    ["Bajas del mes", o.bajas],
    ["Activas", o.counts.activa],
    ["En prueba", o.counts.prueba],
    ["Morosas", o.counts.morosa],
    ["Suspendidas", o.counts.suspendida],
  ];
  return (
    <div className="grid gap-5">
      <PageHeader level={2} title="Suscripciones" description="Cómo vienen los cobros de los planes de Faro (Mercado Pago)." className="mb-0" />
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map(([k, v, hint]) => (
          <div key={k} className="rounded-md border border-line bg-surface p-3">
            <dt className="text-caption text-muted">{k}</dt>
            <dd className="num text-section">{v}</dd>
            {hint && <dd className="text-micro text-muted">{hint}</dd>}
          </div>
        ))}
      </dl>
      <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5 text-meta">
        {["", "activa", "prueba", "morosa", "suspendida", "cancelada"].map((st) => (
          <Link key={st} href={st ? `?estado=${st}` : "?"} aria-current={(sp.estado ?? "") === st ? "page" : undefined} className={`rounded-full px-3 py-1 ${(sp.estado ?? "") === st ? "bg-navy text-paper" : "border border-line"}`}>
            {st ? STATUS[st] : "Todas"}
          </Link>
        ))}
      </nav>
      <ul className="divide-y divide-line rounded-md border border-line bg-surface">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/faro-manager/${r.studioId}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-canvas">
              <span className="min-w-0">
                <span className="block truncate text-ui">{r.name}</span>
                <span className="text-caption text-muted">
                  {r.plan} · {r.interval} · {STATUS[r.status] ?? r.status}
                  {r.status === "prueba" && r.trialEnds && ` hasta el ${formatDate(r.trialEnds, "numeric")}`}
                  {r.status === "activa" && r.periodEnd && ` hasta el ${formatDate(r.periodEnd, "numeric")}`}
                  {r.pastDue && ` · sin pagar desde el ${formatDate(r.pastDue, "numeric")}`}
                </span>
              </span>
              <span className="num text-ui">{r.amount ? formatMoney(r.amount, "ARS", { decimals: "none" }) : "—"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
