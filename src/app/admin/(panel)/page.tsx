import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, notInArray } from "drizzle-orm";
import Link from "next/link";
import { Counter } from "@/components/web/Counter";
import { AdminPageHeader } from "@/components/admin/AdminField";
import { getDb } from "@/db";
import { documents, leads, obligations, organizations, requests } from "@/db/schema";
import { Suspense } from "react";
import { CallsList } from "@/components/admin/CallsList";
import { ListSkeleton } from "@/components/ui/skeleton-blocks";
import { WeeklyBars } from "@/components/admin/WeeklyBars";
import { REQUEST_STATUS, REQUEST_TYPES } from "@/lib/portal-types";
import { requireStaff } from "@/lib/auth";
import { LEAD_SOURCES, LEAD_STATUSES, type Lead } from "@/lib/types";
import { adminButton } from "@/components/admin/styles";

function fmtDate(d: string | Date) {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(d));
}

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export default async function AdminHome() {
  const user = await requireStaff();
  const db = getDb();

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const inAWeek = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  // Semanas (lunes) para los gráficos: 8 hacia atrás para consultas, 8 hacia adelante para vencimientos
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = (offset: number) => new Date(monday.getTime() + offset * 7 * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const short = (d: Date) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "numeric" }).format(d);

  const [all, upcomingRows, clientRows, openRequests, newDocs, dueRows] = await Promise.all([
    db
      .select({ id: leads.id, name: leads.name, status: leads.status, source: leads.source, created_at: leads.created_at })
      .from(leads)
      .where(eq(leads.studio_id, user.studioId))
      .orderBy(desc(leads.created_at))
      .limit(500),
    db
      .select({
        id: leads.id,
        name: leads.name,
        next_action: leads.next_action,
        next_action_at: leads.next_action_at,
        status: leads.status,
      })
      .from(leads)
      .where(
        and(
          eq(leads.studio_id, user.studioId),
          isNotNull(leads.next_action_at),
          lte(leads.next_action_at, inAWeek),
          notInArray(leads.status, ["ganado", "perdido"]),
        ),
      )
      .orderBy(asc(leads.next_action_at)),
    db
      .select({ id: organizations.id, monthly_fee: organizations.monthly_fee, status: organizations.status })
      .from(organizations)
      .where(eq(organizations.studio_id, user.studioId)),
    // Portal: solicitudes abiertas y documentos de clientes que nadie vio
    db
      .select({
        id: requests.id,
        subject: requests.subject,
        type: requests.type,
        status: requests.status,
        client_id: requests.organization_id,
        client: organizations.name,
      })
      .from(requests)
      .innerJoin(organizations, eq(organizations.id, requests.organization_id))
      .where(and(eq(requests.studio_id, user.studioId), inArray(requests.status, ["abierta", "en_curso"])))
      .orderBy(desc(requests.updated_at))
      .limit(50),
    db
      .select({
        id: documents.id,
        name: documents.name,
        client_id: documents.organization_id,
        client: organizations.name,
        created_at: documents.created_at,
      })
      .from(documents)
      .innerJoin(organizations, eq(organizations.id, documents.organization_id))
      .where(and(eq(documents.studio_id, user.studioId), eq(documents.source, "cliente"), isNull(documents.reviewed_at)))
      .orderBy(desc(documents.created_at))
      .limit(50),
    db
      .select({ due: obligations.due_date })
      .from(obligations)
      .where(
        and(
          eq(obligations.studio_id, user.studioId),
          gte(obligations.due_date, iso(week(0))),
          lt(obligations.due_date, iso(week(8))),
          notInArray(obligations.status, ["presentado", "pagado"]),
        ),
      ),
  ]);
  const leadsByWeek = Array.from({ length: 8 }, (_, i) => {
    const from = week(i - 7),
      to = week(i - 6);
    return { label: short(from), value: all.filter((l) => l.created_at >= from && l.created_at < to).length };
  });
  const dueByWeek = Array.from({ length: 8 }, (_, i) => {
    const from = iso(week(i)),
      to = iso(week(i + 1));
    return { label: short(week(i)), value: dueRows.filter((o) => o.due >= from && o.due < to).length };
  });

  const thisMonth = all.filter((l) => l.created_at >= monthStart);
  const won = thisMonth.filter((l) => l.status === "ganado").length;
  const closed = thisMonth.filter((l) => l.status === "ganado" || l.status === "perdido").length;
  const activeClients = clientRows.filter((c) => c.status === "activa" || c.status === "onboarding");
  const mrr = activeClients.reduce((sum, c) => sum + (Number(c.monthly_fee) || 0), 0);
  const bySource = Object.entries(thisMonth.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.source]: (acc[l.source] ?? 0) + 1 }), {})).sort(
    (a, b) => b[1] - a[1],
  );
  const todayStr = today.toISOString().slice(0, 10);

  return (
    <>
      <AdminPageHeader title={`Hola${user.name ? `, ${user.name.split(" ")[0]}` : ""}`}>
        <Link href="/admin/consultas/nueva" className={adminButton.primary}>
          Cargar consulta
        </Link>
      </AdminPageHeader>

      <dl className="grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Consultas este mes", value: thisMonth.length },
          { label: "Sin contactar", value: all.filter((l) => l.status === "nuevo").length },
          { label: "Conversión del mes", value: closed ? Math.round((won / closed) * 100) : null, suffix: "%" },
          { label: "Organizaciones activas", value: activeClients.length, sub: mrr ? `${money.format(mrr)} / mes` : undefined },
        ].map((k) => (
          <div key={k.label} className="bg-surface p-6">
            <dt className="text-sm text-muted">{k.label}</dt>
            <dd className="tabular mt-3 font-display text-5xl leading-none text-navy">
              {k.value === null ? "—" : <Counter value={k.value} suffix={k.suffix} duration={900} />}
            </dd>
            {k.sub && <dd className="mt-1.5 text-sm text-muted">{k.sub}</dd>}
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <WeeklyBars title="Consultas por semana (últimas 8)" data={leadsByWeek} highlight={7} />
        <WeeklyBars title="Vencimientos pendientes por semana (próximas 8)" data={dueByWeek} tone="rose" highlight={0} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Solicitudes abiertas <span className="text-muted">({openRequests.length})</span>
            </h2>
            <Link href="/admin/solicitudes" className="text-sm text-rose-deep hover:underline">
              Ver todas
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
            {openRequests.length === 0 && <li className="px-4 py-5 text-muted">No hay solicitudes abiertas.</li>}
            {openRequests.slice(0, 6).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/organizaciones/${r.client_id}?tab=solicitudes#${r.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-paper"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.subject}</span>
                    <span className="block text-sm text-muted">
                      {r.client} · {REQUEST_TYPES[r.type]}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-muted">{REQUEST_STATUS[r.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold">
            Documentos nuevos de organizaciones <span className="text-muted">({newDocs.length})</span>
          </h2>
          <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
            {newDocs.length === 0 && <li className="px-4 py-5 text-muted">No hay documentos sin revisar.</li>}
            {newDocs.slice(0, 6).map((d) => (
              <li key={d.id}>
                <Link
                  href={`/admin/organizaciones/${d.client_id}?tab=documentos`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-paper"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{d.name}</span>
                    <span className="block text-sm text-muted">{d.client}</span>
                  </span>
                  <span className="shrink-0 text-sm text-muted">{fmtDate(d.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="text-lg font-semibold">Próximas acciones (7 días)</h2>
          {upcomingRows.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-line p-5 text-muted">
              No hay acciones agendadas. Asigná una próxima acción desde cada consulta para verla acá.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
              {upcomingRows.map((l) => (
                <li key={l.id}>
                  <Link href={`/admin/consultas/${l.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-paper">
                    <span>
                      <span className="block font-medium">{l.name}</span>
                      <span className="block text-sm text-muted">{l.next_action ?? "Seguimiento"}</span>
                    </span>
                    <span className={`shrink-0 text-sm ${l.next_action_at! < todayStr ? "font-medium text-danger" : "text-muted"}`}>
                      {l.next_action_at! < todayStr ? "Vencida · " : ""}
                      {fmtDate(`${l.next_action_at}T12:00:00`)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Próximas llamadas</h2>
            <Link href="/admin/agenda" className="text-sm text-rose-deep hover:underline">
              Ver agenda
            </Link>
          </div>
          <div className="mt-3">
            <Suspense fallback={<ListSkeleton rows={2} />}>
              <CallsList studioId={user.studioId} upcoming empty="No hay llamadas agendadas." />
            </Suspense>
          </div>

          <h2 className="mt-8 text-lg font-semibold">Últimas consultas</h2>
          <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
            {all.slice(0, 8).map((l) => (
              <li key={l.id}>
                <Link href={`/admin/consultas/${l.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-paper">
                  <span className="font-medium">{l.name}</span>
                  <span className="text-sm text-muted">
                    {LEAD_STATUSES.find((s) => s.value === l.status)?.label} · {fmtDate(l.created_at)}
                  </span>
                </Link>
              </li>
            ))}
            {all.length === 0 && <li className="px-4 py-5 text-muted">Todavía no entraron consultas.</li>}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Origen de las consultas del mes</h2>
          <ul className="mt-3 space-y-3 rounded-md border border-line bg-surface p-5">
            {bySource.length === 0 && <li className="text-muted">Sin datos este mes.</li>}
            {bySource.map(([source, count]) => (
              <li key={source}>
                <div className="flex justify-between text-[15px]">
                  <span>{LEAD_SOURCES[source as Lead["source"]] ?? source}</span>
                  <span className="font-medium">{count}</span>
                </div>
                <div className="mt-1.5 h-2 bg-navy-soft">
                  <div className="h-2 bg-navy" style={{ width: `${(count / thisMonth.length) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>

          <h2 className="mt-8 text-lg font-semibold">Embudo actual</h2>
          <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
            {LEAD_STATUSES.map((s) => (
              <li key={s.value} className="flex justify-between px-4 py-2.5 text-[15px]">
                <span>{s.label}</span>
                <span className="font-medium">{all.filter((l) => l.status === s.value).length}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
