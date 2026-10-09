import { ArrowRight, Download } from "lucide-react";
import Link from "next/link";
import { Badge, Card, Empty, obligationTone, requestTone } from "@/components/portal/ui";
import { requireMember } from "@/lib/auth";
import { can, canCreateRequests, canSeeRequests } from "@/lib/permissions";
import { getLatestStudioDocument, getRequests, getUpcomingObligations } from "@/lib/portal-data";
import { OBLIGATION_STATUS, REQUEST_STATUS, REQUEST_TYPES, categoryLabel, dateLabel, moneyLabel, periodLabel, todayISO } from "@/lib/portal-types";

export default async function PortalHome() {
  const me = await requireMember();
  const show = {
    obligations: can(me.orgRole, "vencimientos.ver"),
    documents: can(me.orgRole, "documentos.ver"),
    requests: canSeeRequests(me.orgRole),
  };
  const [upcoming, lastDoc, openRequests] = await Promise.all([
    show.obligations ? getUpcomingObligations(me) : [],
    show.documents ? getLatestStudioDocument(me) : null,
    show.requests ? getRequests(me, true) : [],
  ]);
  const today = todayISO();
  // Saluda por el nombre solo si el usuario tiene uno propio (no la razón social)
  const first = me.name && me.name !== me.organizationName ? me.name.split(" ")[0] : "";

  return (
    <>
      <h1 className="font-display text-3xl sm:text-4xl">Hola{first ? `, ${first}` : ""}</h1>
      <p className="mt-2 text-muted">Lo que viene, lo último que te mandamos y tus consultas abiertas.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-[1.4fr_1fr]">
        {show.obligations && (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Próximos vencimientos</h2>
              <Link href="/portal/vencimientos" className="link-underline text-sm text-rose-deep">
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
                      <p className="text-sm text-muted">
                        {periodLabel(o.period)} · vence el {dateLabel(o.due_date)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-medium tabular-nums">{moneyLabel(o.amount)}</p>
                      <Badge tone={obligationTone(o.status, o.due_date, today)}>{OBLIGATION_STATUS[o.status]}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <div className="grid content-start gap-4">
          {show.documents && (
            <Card>
              <h2 className="font-semibold">Último documento del estudio</h2>
              {lastDoc ? (
                <a
                  href={`/api/archivos/${lastDoc.id}`}
                  className="mt-3 flex items-center justify-between gap-3 rounded-md border border-line px-3 py-3 transition-colors hover:border-navy/40 hover:bg-paper"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{lastDoc.name}</span>
                    <span className="block text-sm text-muted">
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
                  <Link href="/portal/solicitudes/nueva" className="link-underline text-sm text-rose-deep">
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
                          <span className="block text-sm text-muted">{REQUEST_TYPES[r.type]}</span>
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
            <span className="block text-sm text-muted">Subilos en Documentos y nos llegan al momento.</span>
          </span>
          <ArrowRight className="size-5 text-rose-deep" aria-hidden />
        </Link>
      )}
    </>
  );
}
