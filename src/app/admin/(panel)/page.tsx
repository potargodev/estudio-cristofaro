import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, notInArray, sql } from "drizzle-orm";
import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileQuestion,
  Inbox,
  MessageSquareWarning,
  Moon,
  UserRound,
  Video,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BarChart, DonutChart } from "@/components/admin/kit/Charts";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { EmptyState, Panel, PanelLink } from "@/components/admin/kit/Panel";
import { ChartSkeleton, PanelSkeleton, StatRowSkeleton } from "@/components/admin/kit/Skeletons";
import { StatCard } from "@/components/admin/kit/StatCard";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { getDb } from "@/db";
import { audit_log, bookings, documents, leads, obligations, organizations, request_messages, requests, users } from "@/db/schema";
import { auditLabel } from "@/lib/audit";
import { requireStaff } from "@/lib/auth";
import { LEAD_SOURCES } from "@/lib/types";

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const shortDate = (d: Date) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "numeric" }).format(d);
const time = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" });
const when = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" });
const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : a ? 100 : 0);

function mondayOf(d: Date) {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

// ───────────── Indicadores ─────────────

async function Stats({ studioId, commercial }: { studioId: string; commercial: boolean }) {
  const db = getDb();
  const now = new Date();
  const monday = mondayOf(now);
  const sunday = iso(new Date(monday.getTime() + 6 * DAY));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const in2 = iso(new Date(now.getTime() + 2 * DAY));
  const since30 = new Date(now.getTime() - 30 * DAY);

  const [orgs, weekDue, openReq, leadRows, replies] = await Promise.all([
    db.select({ status: organizations.status, created: organizations.created_at }).from(organizations).where(eq(organizations.studio_id, studioId)),
    db
      .select({ due: obligations.due_date })
      .from(obligations)
      .where(
        and(
          eq(obligations.studio_id, studioId),
          gte(obligations.due_date, iso(monday)),
          lte(obligations.due_date, sunday),
          notInArray(obligations.status, ["presentado", "pagado"]),
        ),
      ),
    db
      .select({ n: count() })
      .from(requests)
      .where(and(eq(requests.studio_id, studioId), inArray(requests.status, ["abierta", "en_curso"]))),
    db
      .select({ created: leads.created_at, status: leads.status })
      .from(leads)
      .where(and(eq(leads.studio_id, studioId), gte(leads.created_at, new Date(Math.min(now.getTime() - 56 * DAY, prevMonthStart.getTime()))))),
    // Tiempo hasta la primera respuesta del estudio, solicitudes de los últimos 30 días
    db
      .select({
        hours: sql<number>`extract(epoch from (min(${request_messages.created_at}) filter (where ${request_messages.from_client} = false)) - ${requests.created_at}) / 3600`,
      })
      .from(requests)
      .innerJoin(request_messages, eq(request_messages.request_id, requests.id))
      .where(and(eq(requests.studio_id, studioId), gte(requests.created_at, since30)))
      .groupBy(requests.id, requests.created_at),
  ]);

  const active = orgs.filter((o) => o.status === "activa" || o.status === "onboarding");
  const activePrev = active.filter((o) => o.created < since30).length;
  const orgSpark = Array.from({ length: 6 }, (_, i) => {
    const edge = new Date(now.getFullYear(), now.getMonth() - 5 + i + 1, 1);
    return active.filter((o) => o.created < edge).length;
  });
  const risk = weekDue.filter((o) => o.due <= in2).length;
  const answered = replies.map((r) => Number(r.hours)).filter((h) => Number.isFinite(h) && h >= 0);
  const avgHours = answered.length ? Math.round((answered.reduce((a, b) => a + b, 0) / answered.length) * 10) / 10 : null;
  const thisMonth = leadRows.filter((l) => l.created >= monthStart);
  const prevMonth = leadRows.filter((l) => l.created >= prevMonthStart && l.created < monthStart);
  const won = thisMonth.filter((l) => l.status === "ganado").length;
  const leadSpark = Array.from({ length: 8 }, (_, i) => {
    const from = new Date(monday.getTime() - (7 - i) * 7 * DAY);
    const to = new Date(from.getTime() + 7 * DAY);
    return leadRows.filter((l) => l.created >= from && l.created < to).length;
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={Building2}
        label="Organizaciones activas"
        value={active.length}
        delta={{ value: pct(active.length, activePrev), goodWhen: "up", label: "vs. hace 30 días" }}
        spark={orgSpark}
        href="/admin/organizaciones"
      />
      <StatCard
        icon={CalendarClock}
        label="Vencimientos de esta semana"
        value={weekDue.length}
        tone={risk > 0 ? "alert" : "default"}
        hint={risk > 0 ? <span className="font-medium text-[#8f2a1c]">{risk} en riesgo (vencen en 48 h)</span> : "Ninguno en riesgo"}
        href="/admin/vencimientos"
      />
      <StatCard
        icon={Inbox}
        label="Solicitudes abiertas"
        value={openReq[0]?.n ?? 0}
        hint={
          avgHours === null ? (
            "Sin respuestas en 30 días"
          ) : (
            <span className={avgHours <= 24 ? "text-[#1f7a43]" : "text-[#b42318]"}>
              1.ª respuesta: {avgHours}{"\u00a0"}h promedio · objetivo 24{"\u00a0"}h
            </span>
          )
        }
        href="/admin/solicitudes"
      />
      {commercial && <StatCard
        icon={UserRound}
        label="Consultas nuevas del mes"
        value={thisMonth.length}
        delta={{ value: pct(thisMonth.length, prevMonth.length), goodWhen: "up", label: "vs. mes anterior" }}
        hint={`Conversión ${thisMonth.length ? Math.round((won / thisMonth.length) * 100) : 0}%`}
        spark={leadSpark}
        href="/admin/consultas"
      />}
    </div>
  );
}

// ───────────── Requiere atención ─────────────

interface AttentionItem {
  key: string;
  priority: number; // 0 = más urgente
  icon: typeof AlertTriangle;
  title: string;
  detail: string;
  status: React.ReactNode;
  action: { href: string; label: string };
}

async function Attention({ studioId }: { studioId: string }) {
  const db = getDb();
  const now = new Date();
  const today = iso(now);
  const in2 = iso(new Date(now.getTime() + 2 * DAY));
  const h20 = new Date(now.getTime() - 20 * 3600000);
  const d30 = new Date(now.getTime() - 30 * DAY);

  const [dueRisk, waiting, unreviewed, orgActivity] = await Promise.all([
    db
      .select({ id: obligations.id, tax: obligations.tax, period: obligations.period, due: obligations.due_date, org: organizations.name, orgId: organizations.id })
      .from(obligations)
      .innerJoin(organizations, eq(organizations.id, obligations.organization_id))
      .where(and(eq(obligations.studio_id, studioId), lte(obligations.due_date, in2), notInArray(obligations.status, ["presentado", "pagado"])))
      .orderBy(asc(obligations.due_date))
      .limit(10),
    // Solicitudes abiertas cuyo último mensaje es del cliente y tiene más de 20 h
    db
      .select({
        id: requests.id,
        subject: requests.subject,
        org: organizations.name,
        last: sql<Date>`max(${request_messages.created_at})`,
        lastFromClient: sql<boolean>`(array_agg(${request_messages.from_client} order by ${request_messages.created_at} desc))[1]`,
      })
      .from(requests)
      .innerJoin(organizations, eq(organizations.id, requests.organization_id))
      .innerJoin(request_messages, eq(request_messages.request_id, requests.id))
      .where(and(eq(requests.studio_id, studioId), inArray(requests.status, ["abierta", "en_curso"])))
      .groupBy(requests.id, requests.subject, organizations.name)
      .limit(50),
    db
      .select({ orgId: documents.organization_id, org: organizations.name, n: count() })
      .from(documents)
      .innerJoin(organizations, eq(organizations.id, documents.organization_id))
      .where(and(eq(documents.studio_id, studioId), eq(documents.source, "cliente"), isNull(documents.reviewed_at)))
      .groupBy(documents.organization_id, organizations.name)
      .limit(10),
    db
      .select({
        id: organizations.id,
        name: organizations.name,
        last: sql<Date | null>`greatest(
          (select max(r.updated_at) from requests r where r.organization_id = ${organizations.id}),
          (select max(d.created_at) from documents d where d.organization_id = ${organizations.id}),
          (select max(o.updated_at) from obligations o where o.organization_id = ${organizations.id})
        )`,
      })
      .from(organizations)
      .where(and(eq(organizations.studio_id, studioId), eq(organizations.status, "activa"))),
  ]);

  const items: AttentionItem[] = [
    ...dueRisk.map((o) => ({
      key: `o-${o.id}`,
      priority: o.due < today ? 0 : 1,
      icon: CalendarClock,
      title: `${o.tax} ${o.period} · ${o.org}`,
      detail: o.due < today ? `Venció el ${shortDate(new Date(`${o.due}T12:00:00`))}` : `Vence el ${shortDate(new Date(`${o.due}T12:00:00`))}`,
      status: <StatusBadge status={o.due < today ? "vencido" : "pendiente"} label={o.due < today ? "Vencido" : "En riesgo"} />,
      action: { href: `/admin/vencimientos?org=${o.orgId}`, label: "Ver vencimiento" },
    })),
    ...waiting
      .filter((r) => r.lastFromClient && new Date(r.last) < h20)
      .map((r) => {
        const hours = Math.round((now.getTime() - new Date(r.last).getTime()) / 3600000);
        return {
          key: `r-${r.id}`,
          priority: hours >= 24 ? 0 : 2,
          icon: MessageSquareWarning,
          title: `${r.subject} · ${r.org}`,
          detail: `Sin respuesta hace ${hours} h`,
          status: <StatusBadge status={hours >= 24 ? "vencido" : "en_curso"} label={hours >= 24 ? "Fuera de SLA" : "SLA por vencer"} />,
          action: { href: `/admin/solicitudes?id=${r.id}`, label: "Responder" },
        };
      }),
    ...unreviewed.map((d) => ({
      key: `d-${d.orgId}`,
      priority: 3,
      icon: FileQuestion,
      title: `${d.n} ${d.n === 1 ? "documento" : "documentos"} sin clasificar · ${d.org}`,
      detail: "Subidos por el cliente desde el portal",
      status: <StatusBadge status="pendiente" label="Sin revisar" />,
      action: { href: `/admin/organizaciones/${d.orgId}?tab=documentos`, label: "Revisar" },
    })),
    ...orgActivity
      .filter((o) => !o.last || new Date(o.last) < d30)
      .slice(0, 5)
      .map((o) => ({
        key: `a-${o.id}`,
        priority: 4,
        icon: Moon,
        title: o.name,
        detail: o.last ? `Sin actividad desde el ${shortDate(new Date(o.last))}` : "Sin actividad registrada",
        status: <StatusBadge status="pausada" label="Sin actividad" />,
        action: { href: `/admin/organizaciones/${o.id}`, label: "Ver ficha" },
      })),
  ].sort((a, b) => a.priority - b.priority);

  return (
    <Panel title="Requiere atención" icon={AlertTriangle} action={<span className="tabular text-muted">{items.length} pendientes</span>} bodyClassName="p-0">
      {items.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Todo al día" text="No hay vencimientos en riesgo, solicitudes sin respuesta ni documentos sin clasificar." />
      ) : (
        <ul className="divide-y divide-line">
          {items.slice(0, 10).map((it) => (
            <li key={it.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
              <it.icon className="size-[18px] shrink-0 text-rose-deep" strokeWidth={1.5} aria-hidden />
              <div className="min-w-0 basis-[calc(100%-2.25rem)] sm:basis-0 sm:flex-1">
                <p className="truncate text-[14px] font-medium text-ink">{it.title}</p>
                <p className="text-[13px] text-muted">{it.detail}</p>
              </div>
              <span className="ml-[2.125rem] sm:ml-0">{it.status}</span>
              <Link
                href={it.action.href}
                className="ml-auto inline-flex h-8 items-center rounded-md border border-line px-3 text-[13px] font-medium text-ink transition-colors hover:border-navy sm:ml-0"
              >
                {it.action.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ───────────── Gráficos ─────────────

async function Charts({ studioId, commercial }: { studioId: string; commercial: boolean }) {
  const db = getDb();
  const now = new Date();
  const monday = mondayOf(now);
  const from = new Date(monday.getTime() - 3 * 7 * DAY);
  const to = new Date(monday.getTime() + 5 * 7 * DAY);
  const since90 = new Date(now.getTime() - 90 * DAY);
  const [dues, reqs, leadRows] = await Promise.all([
    db
      .select({ due: obligations.due_date, status: obligations.status })
      .from(obligations)
      .where(and(eq(obligations.studio_id, studioId), gte(obligations.due_date, iso(from)), lt(obligations.due_date, iso(to)))),
    db
      .select({ status: requests.status, n: count() })
      .from(requests)
      .where(and(eq(requests.studio_id, studioId), gte(requests.created_at, since90)))
      .groupBy(requests.status),
    db
      .select({ source: leads.source, n: count() })
      .from(leads)
      .where(and(eq(leads.studio_id, studioId), gte(leads.created_at, since90)))
      .groupBy(leads.source),
  ]);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const a = iso(new Date(from.getTime() + i * 7 * DAY));
    const b = iso(new Date(from.getTime() + (i + 1) * 7 * DAY));
    const inWeek = dues.filter((d) => d.due >= a && d.due < b);
    return {
      label: shortDate(new Date(from.getTime() + i * 7 * DAY)),
      hechos: inWeek.filter((d) => d.status === "presentado" || d.status === "pagado").length,
      pendientes: inWeek.filter((d) => d.status !== "presentado" && d.status !== "pagado").length,
    };
  });
  const reqBy = (s: string) => reqs.find((r) => r.status === s)?.n ?? 0;
  const sources = leadRows
    .sort((a, b) => b.n - a.n)
    .map((l) => ({ label: LEAD_SOURCES[l.source] ?? l.source, consultas: l.n }));

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Panel title="Vencimientos por semana" icon={CalendarClock} className="xl:col-span-2" action={<PanelLink href="/admin/vencimientos">Ver vencimientos</PanelLink>}>
        <BarChart
          caption="Vencimientos por semana: presentados o pagados y pendientes"
          data={weeks}
          stacked
          series={[
            { key: "hechos", label: "Presentados o pagados", color: "#3f7f57" },
            { key: "pendientes", label: "Pendientes", color: "#1c2235" },
          ]}
        />
      </Panel>
      <Panel title="Solicitudes por estado" icon={Inbox} action={<span className="text-muted">Últimos 90 días</span>}>
        <DonutChart
          caption="Solicitudes por estado en los últimos 90 días"
          centerLabel="solicitudes"
          data={[
            { key: "abierta", label: "Abiertas", value: reqBy("abierta"), color: "#1c2235" },
            { key: "en_curso", label: "En curso", value: reqBy("en_curso"), color: "#a57c6d" },
            { key: "resuelta", label: "Resueltas", value: reqBy("resuelta"), color: "#3f7f57" },
          ]}
        />
      </Panel>
      {commercial && <Panel title="Consultas por origen" icon={UserRound} className="xl:col-span-3" action={<span className="text-muted">Últimos 90 días</span>}>
        {sources.length === 0 ? (
          <EmptyState icon={UserRound} title="Todavía no hay consultas" text="Cuando lleguen desde la web, WhatsApp o la agenda, las vas a ver acá." />
        ) : (
          <BarChart caption="Consultas por origen en los últimos 90 días" data={sources} series={[{ key: "consultas", label: "Consultas", color: "#1c2235" }]} height={180} />
        )}
      </Panel>}
    </div>
  );
}

// ───────────── Agenda del día y actividad ─────────────

async function Today({ studioId }: { studioId: string }) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + DAY);
  const rows = await getDb()
    .select({ b: bookings, host: users.name })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.host_user_id))
    .where(and(eq(bookings.studio_id, studioId), eq(bookings.status, "confirmada"), gte(bookings.ends_at, new Date()), lt(bookings.starts_at, new Date(end.getTime() + DAY))))
    .orderBy(asc(bookings.starts_at))
    .limit(6);
  return (
    <Panel title="Agenda" icon={CalendarDays} action={<PanelLink href="/admin/agenda">Ver semana</PanelLink>} bodyClassName="p-0">
      {rows.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Sin llamadas hoy ni mañana" text="Compartí el link de la agenda para que te reserven 20 minutos." action={{ href: "/agendar", label: "Ver la agenda pública" }} />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map(({ b, host }) => (
            <li key={b.id} className="flex items-center gap-4 px-5 py-3">
              <span className="tabular w-14 shrink-0 text-[15px] font-medium text-ink">{time.format(b.starts_at)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-ink">{b.name}</span>
                <span className="block truncate text-[13px] text-muted">
                  {b.starts_at >= end ? "Mañana · " : ""}con {host}
                  {b.reason ? ` · ${b.reason}` : ""}
                </span>
              </span>
              {b.meet_url && (
                <a href={b.meet_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-navy px-3 text-[13px] text-paper hover:bg-navy-deep">
                  <Video className="size-4" aria-hidden /> Meet
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

async function RecentActivity({ studioId }: { studioId: string }) {
  const rows = await getDb()
    .select({ id: audit_log.id, action: audit_log.action, actor: audit_log.actor_label, at: audit_log.created_at, result: audit_log.result, orgId: audit_log.organization_id, org: organizations.name })
    .from(audit_log)
    .leftJoin(organizations, eq(organizations.id, audit_log.organization_id))
    .where(and(eq(audit_log.studio_id, studioId), notInArray(audit_log.action, ["sesion.iniciar", "sesion.rechazada"])))
    .orderBy(desc(audit_log.created_at))
    .limit(8);
  return (
    <Panel title="Actividad reciente" icon={Activity} bodyClassName="p-0">
      {rows.length === 0 ? (
        <EmptyState icon={Activity} title="Sin actividad todavía" />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex gap-3 px-5 py-3 text-[14px]">
              <Clock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-ink">
                  {auditLabel(r.action)}
                  {r.org && r.orgId && (
                    <>
                      {" · "}
                      <Link href={`/admin/organizaciones/${r.orgId}`} className="underline-offset-4 hover:underline">
                        {r.org}
                      </Link>
                    </>
                  )}
                </span>
                <span className="block truncate text-[13px] text-muted">
                  {r.actor ?? "Sistema"} · {when.format(r.at)}
                </span>
              </span>
              {r.result !== "ok" && <StatusBadge status="vencido" label={r.result === "denegado" ? "Denegado" : "Error"} />}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default async function AdminHome() {
  const user = await requireStaff();
  const first = user.name ? user.name.split(" ")[0] : "";
  return (
    <>
      <PageHeader title={`Hola${first ? `, ${first}` : ""}`} description="Lo que pasa hoy en el estudio y lo que necesita tu atención." />
      <div className="grid gap-6">
        <Suspense fallback={<StatRowSkeleton />}>
          <Stats studioId={user.studioId} commercial={user.role !== "colaborador"} />
        </Suspense>
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Suspense fallback={<PanelSkeleton rows={6} />}>
            <Attention studioId={user.studioId} />
          </Suspense>
          <div className="grid content-start gap-6">
            <Suspense fallback={<PanelSkeleton rows={3} />}>
              <Today studioId={user.studioId} />
            </Suspense>
            <Suspense fallback={<PanelSkeleton rows={4} />}>
              <RecentActivity studioId={user.studioId} />
            </Suspense>
          </div>
        </div>
        <Suspense fallback={<ChartSkeleton className="h-80" />}>
          <Charts studioId={user.studioId} commercial={user.role !== "colaborador"} />
        </Suspense>
      </div>
    </>
  );
}
