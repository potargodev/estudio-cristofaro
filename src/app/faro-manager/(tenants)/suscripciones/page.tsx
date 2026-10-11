import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { requireFaro } from "@/lib/auth";
import { subscriptionsOverview } from "@/modules/billing/subscriptions";

export const metadata: Metadata = { title: "Suscripciones" };

const STATUS: Record<string, string> = { prueba: "En prueba", activa: "Activa", morosa: "Morosa", suspendida: "Suspendida", cancelada: "Cancelada" };
const ars = (c: number) => `$ ${Math.round(c / 100).toLocaleString("es-AR")}`;

/** Altas, bajas, ingresos y morosos de las suscripciones de Faro */
export default async function Page({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const sp = await searchParams;
  await requireFaro();
  const o = await subscriptionsOverview();
  const rows = sp.estado ? o.rows.filter((r) => r.status === sp.estado) : o.rows;
  const cards: [string, string | number, string?][] = [
    ["Ingresos del mes", ars(o.income), `${o.payments} pagos`],
    ["Ingreso mensual recurrente", ars(o.mrr)],
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
            <dt className="text-[12px] text-muted">{k}</dt>
            <dd className="num text-[20px]">{v}</dd>
            {hint && <dd className="text-[11px] text-muted">{hint}</dd>}
          </div>
        ))}
      </dl>
      <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5 text-[13px]">
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
                <span className="block truncate text-[14px]">{r.name}</span>
                <span className="text-[12px] text-muted">
                  {r.plan} · {r.interval} · {STATUS[r.status] ?? r.status}
                  {r.status === "prueba" && r.trialEnds && ` hasta el ${r.trialEnds.toLocaleDateString("es-AR")}`}
                  {r.status === "activa" && r.periodEnd && ` hasta el ${r.periodEnd.toLocaleDateString("es-AR")}`}
                  {r.pastDue && ` · sin pagar desde el ${r.pastDue.toLocaleDateString("es-AR")}`}
                </span>
              </span>
              <span className="num text-[14px]">{r.amount ? ars(r.amount) : "—"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
