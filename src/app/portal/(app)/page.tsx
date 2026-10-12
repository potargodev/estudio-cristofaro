import { FirstSteps } from "@/components/app/FirstSteps";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { ArrowRight, CalendarDays, Download, Star } from "lucide-react";
import { and, count, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, Empty, obligationTone, requestTone } from "@/components/portal/ui";
import { LeadContact } from "@/components/portal/LeadContact";
import { getDb } from "@/db";
import { payslips, requests } from "@/db/schema";
import { requireMember } from "@/lib/auth";
import { moduleHref } from "@/lib/modules/catalog";
import { getOrgStaff } from "@/lib/organizations";
import { can, canCreateRequests, canSeeRequests } from "@/lib/permissions";
import { Suspense } from "react";
import { MonthCard, Ring, SplitBar, TimelineSection } from "@/components/portal/Dashboard";
import { ListSkeleton } from "@/components/ui/skeleton-blocks";
import { getLatestStudioDocument, getMonthSummary, getRequests, getUpcomingObligations } from "@/lib/portal-data";
import { OBLIGATION_STATUS, REQUEST_STATUS, REQUEST_TYPES, categoryLabel, periodLabel } from "@/lib/portal-types";
import { formatAmountOrDash, formatDate, todayAR } from "@/lib/format";

export default async function PortalHome() {
  const me = await requireMember();
  // El empleado solo usa grupos de gastos y rendiciones
  if (!can(me.orgRole, "inicio.ver")) redirect(me.orgRole === "empleado" ? "/portal/empleado" : "/portal/rendiciones");
  const show = {
    obligations: can(me.orgRole, "vencimientos.ver"),
    documents: can(me.orgRole, "documentos.ver"),
    requests: canSeeRequests(me.orgRole),
  };
  // Sueldos (roles con sueldos.ver y el módulo activo): lo que espera respuesta
  const payroll = can(me.orgRole, "sueldos.ver") && me.modules.includes("sueldos");
  const [upcoming, lastDoc, openRequests, staff, month, slips] = await Promise.all([
    show.obligations ? getUpcomingObligations(me) : [],
    show.documents ? getLatestStudioDocument(me) : null,
    show.requests ? getRequests(me, true) : [],
    getOrgStaff(me.organizationId),
    getMonthSummary(me),
    payroll ? payrollSummary(me.studioId, me.organizationId) : null,
  ]);
  const monthName = formatDate(new Date(), "month");
  const lead = staff.find((t) => t.assignment === "responsable") ?? null;
  const today = todayAR();
  const canReview = me.orgRole === "administrador" || me.orgRole === "direccion";
  // Saluda por el nombre solo si el usuario tiene uno propio (no la razón social)
  const first = me.name && me.name !== me.organizationName ? me.name.split(" ")[0] : "";

  return (
    <>
      <PageHeader title={`Hola${first ? `, ${first}` : ""}`} description="Lo que viene, lo último que te mandamos y tus consultas abiertas." className="mb-0" />
      <FirstSteps className="mt-6" />

      {(month.obligations || month.documents || month.requests) && (
        <MonthCard month={monthName} className="mt-6">
          {month.obligations && (
            <Ring
              value={month.obligations.done}
              total={month.obligations.total}
              label="vencimientos del mes al día"
              empty="No hay vencimientos este mes"
            />
          )}
          {month.documents && (
            <SplitBar title="Documentos del mes" a={month.documents.fromStudio} b={month.documents.fromClient} labelA="del estudio" labelB="tuyos" />
          )}
          {month.requests && (
            <SplitBar title="Solicitudes del mes" a={month.requests.resolved} b={month.requests.open} labelA="resueltas" labelB="en curso" />
          )}
        </MonthCard>
      )}

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
          {slips && <PayrollCard s={slips} />}
          {show.obligations && (
            <Card>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Próximos vencimientos</h2>
                <Link href="/portal/vencimientos" className="link-underline text-ui text-rose-deep">
                  Ver todos
                </Link>
              </div>
              {upcoming.length === 0 ? (
                <div className="mt-3">
                  <Empty>No tenés vencimientos pendientes.</Empty>
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {upcoming.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{o.tax}</p>
                        <p className="text-ui text-muted">
                          {periodLabel(o.period)} · vence el {formatDate(o.due_date, "numeric")}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-medium tabular-nums">{formatAmountOrDash(o.amount)}</p>
                        <Badge tone={obligationTone(o.status, o.due_date, today)}>{OBLIGATION_STATUS[o.status]}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Suspense fallback={<ListSkeleton rows={4} />}>
            <TimelineSection me={me} />
          </Suspense>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
          {/* Tarjeta del estudio: agendar una llamada y reseñarlo (antes, ítems del menú) */}
          <LeadContact lead={lead} team={staff.filter((t) => t.assignment !== "responsable")}>
            {(can(me.orgRole, "agenda.reservar") || canReview) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {can(me.orgRole, "agenda.reservar") && (
                  <Link href="/portal/agendar" className="inline-flex h-(--control-h) items-center gap-2 rounded-md bg-navy px-4 text-body font-medium text-paper transition-colors hover:bg-navy-deep">
                    <CalendarDays className="size-4" aria-hidden />
                    Agendar una llamada
                  </Link>
                )}
                {canReview && (
                  <Link href="/portal/resena" className="inline-flex h-(--control-h) items-center gap-2 rounded-md border border-line bg-surface px-4 text-body font-medium text-ink transition-colors hover:border-muted">
                    <Star className="size-4" aria-hidden />
                    Reseñar al estudio
                  </Link>
                )}
              </div>
            )}
          </LeadContact>
          {show.documents && (
            <Card>
              <h2 className="font-semibold">Último documento del estudio</h2>
              {lastDoc ? (
                <a
                  href={`/api/archivos/${lastDoc.id}`}
                  className="mt-3 flex items-center justify-between gap-3 rounded-md border border-line px-3 py-3 transition-colors hover:border-navy/40 hover:bg-canvas"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{lastDoc.name}</span>
                    <span className="block text-ui text-muted">
                      {categoryLabel(lastDoc.category)} · {periodLabel(lastDoc.period)}
                    </span>
                  </span>
                  <Download className="size-5 shrink-0 text-rose-deep" aria-label="Descargar" />
                </a>
              ) : (
                <div className="mt-3">
                  <Empty>Todavía no hay documentos.</Empty>
                </div>
              )}
            </Card>
          )}

          {show.requests && (
            <Card>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Solicitudes abiertas</h2>
                {canCreateRequests(me.orgRole) && (
                  <Link href="/portal/solicitudes/nueva" className="link-underline text-ui text-rose-deep">
                    Nueva
                  </Link>
                )}
              </div>
              {openRequests.length === 0 ? (
                <div className="mt-3">
                  <Empty>No tenés solicitudes abiertas.</Empty>
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {openRequests.slice(0, 4).map((r) => (
                    <li key={r.id}>
                      <Link href={`/portal/solicitudes/${r.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-rose-deep">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.subject}</span>
                          <span className="block text-ui text-muted">{REQUEST_TYPES[r.type]}</span>
                        </span>
                        <Badge tone={requestTone(r.status)}>{REQUEST_STATUS[r.status]}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>

      {can(me.orgRole, "documentos.subir") && (
        <Link
          href="/portal/documentos"
          className="mt-4 flex items-center justify-between rounded-md border border-line bg-surface px-5 py-4 transition-colors hover:border-navy/40"
        >
          <span>
            <span className="block font-semibold">¿Tenés comprobantes para mandarnos?</span>
            <span className="block text-ui text-muted">Subilos en Documentos y nos llegan al momento.</span>
          </span>
          <ArrowRight className="size-5 text-rose-deep" aria-hidden />
        </Link>
      )}
    </>
  );
}

async function payrollSummary(studioId: string, organizationId: string) {
  const db = getDb();
  const [rows, [news]] = await Promise.all([
    db
      .select({ status: payslips.status, n: count() })
      .from(payslips)
      .where(and(eq(payslips.studio_id, studioId), eq(payslips.organization_id, organizationId), inArray(payslips.status, ["publicado", "no_conforme", "sin_asignar", "asignado"])))
      .groupBy(payslips.status),
    db.select({ n: count() }).from(requests).where(and(eq(requests.studio_id, studioId), eq(requests.organization_id, organizationId), eq(requests.type, "empleado"), inArray(requests.status, ["abierta", "en_curso"]))),
  ]);
  const n = (k: string) => rows.find((r) => r.status === k)?.n ?? 0;
  return { unsigned: n("publicado"), objected: n("no_conforme"), inReview: n("sin_asignar") + n("asignado"), news: news?.n ?? 0 };
}

/** Sueldos en el inicio: lo pendiente de las personas, con el acceso a cada cosa */
function PayrollCard({ s }: { s: { unsigned: number; objected: number; inReview: number; news: number } }) {
  const items = [
    { n: s.objected, label: s.objected === 1 ? "recibo firmado no conforme" : "recibos firmados no conformes", alert: true },
    { n: s.unsigned, label: s.unsigned === 1 ? "recibo sin firmar" : "recibos sin firmar", alert: false },
    { n: s.inReview, label: "recibos en revisión del estudio", alert: false },
    { n: s.news, label: s.news === 1 ? "novedad de personal abierta" : "novedades de personal abiertas", alert: false },
  ].filter((i) => i.n > 0);
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Sueldos</h2>
        <Link href={moduleHref("sueldos")} className="link-underline text-ui text-rose-deep">
          Ver sueldos
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="mt-3">
          <Empty>Todos los recibos están firmados y no hay novedades abiertas.</Empty>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {items.map((i) => (
            <li key={i.label} className="flex items-center gap-3 py-2.5">
              <span className={i.alert ? "num min-w-8 text-section text-rose-deep" : "num min-w-8 text-section"}>{i.n}</span>
              <span className="text-ui">{i.label}</span>
            </li>
          ))}
        </ul>
      )}
      {s.news > 0 && (
        <Link href="/portal/solicitudes" className="mt-2 inline-block text-ui text-muted underline underline-offset-4">
          Ver las novedades
        </Link>
      )}
    </Card>
  );
}
