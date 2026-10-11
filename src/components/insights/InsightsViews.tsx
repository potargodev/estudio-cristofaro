import { ChartLine } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/admin/kit/Panel";
import { orgInsights, studioInsights } from "@/modules/insights/server";
import { BarChart, fmt, Kpi } from "./Charts";

/** Bloqueado por plan: explica dónde se habilita */
export function InsightsLocked() {
  return (
    <div className="rounded-md border border-line bg-surface">
      <EmptyState icon={ChartLine} title="Indicadores viene con el plan Avanzado" text="Tableros de facturación, cobranza, vencimientos y solicitudes del estudio y de cada organización." />
      <p className="pb-5 text-center text-ui">
        <Link href="/admin/configuracion/plan" className="underline underline-offset-4">
          Ver planes
        </Link>
      </p>
    </div>
  );
}

/** Tablero del estudio (Inicio → Indicadores) */
export async function StudioInsights({ studioId }: { studioId: string }) {
  const d = await studioInsights(studioId);
  const onTimeLast = [...d.onTime].reverse().find((p) => p.v > 0);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Organizaciones activas" value={fmt(d.orgs.activas, "n")} hint={`${d.orgs.onboarding} en alta · ${d.orgs.pausadas} pausadas`} />
        <Kpi label="Honorarios por cobrar" value={fmt(d.feesPending + d.feesOverdue, "ars")} hint={d.feesOverdue ? `${fmt(d.feesOverdue, "ars")} vencidos` : "Nada vencido"} tone={d.feesOverdue ? "danger" : undefined} />
        <Kpi label="Primera respuesta (90 días)" value={d.responseHours == null ? "—" : `${fmt(d.responseHours, "n")} h`} hint="Promedio en solicitudes" />
        <Kpi label="Tareas abiertas" value={fmt(d.tasks.abiertas, "n")} hint={d.tasks.vencidas ? `${d.tasks.vencidas} vencidas` : "Ninguna vencida"} tone={d.tasks.vencidas ? "danger" : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart title="Honorarios cobrados por mes" series={d.feesPaid} unit="ars" />
        <BarChart title="Facturado en ARCA por tus clientes" series={d.invoiced} unit="ars" />
        <BarChart title="Vencimientos cumplidos a término" series={d.onTime} unit="pct" />
        <BarChart title="Solicitudes por mes" series={d.requests} unit="n" />
      </div>
      <p className="text-meta text-muted">
        Vencimientos a término: presentados o pagados sobre el total que venció cada mes{onTimeLast ? ` (último dato: ${onTimeLast.v} %)` : ""}. Facturado: comprobantes autorizados, con las notas de crédito restando.
      </p>
    </div>
  );
}

/** Indicadores de una organización (ficha → Resumen → Indicadores) */
export async function OrgInsights({ studioId, orgId }: { studioId: string; orgId: string }) {
  const d = await orgInsights(studioId, orgId);
  if (!d) return null;
  const year = (s: { v: number }[]) => s.reduce((a, p) => a + p.v, 0);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Facturado (12 meses)" value={fmt(year(d.sales), "ars")} />
        <Kpi label="Gastos (12 meses)" value={fmt(year(d.expenses), "ars")} />
        <Kpi label="Vencen en 30 días" value={fmt(d.upcoming.n, "n")} hint={d.upcoming.amount ? fmt(d.upcoming.amount, "ars") : undefined} />
        <Kpi label="Honorarios pendientes" value={fmt(d.feesPending, "ars")} hint={`${d.requestsOpen} solicitudes abiertas · ${d.employees} empleados`} tone={d.feesPending ? "danger" : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart title="Ventas y gastos por mes" series={d.sales} second={d.expenses} legend={["Ventas", "Gastos"]} unit="ars" />
        <BarChart title="Resultado (ventas menos gastos)" series={d.result} unit="ars" />
        <BarChart title="Vencimientos cumplidos a término" series={d.onTime} unit="pct" />
      </div>
      <p className="text-meta text-muted">Ventas: comprobantes autorizados en ARCA desde Faro. Gastos: los confirmados en Lectura inteligente y los cargados en la organización.</p>
    </div>
  );
}
