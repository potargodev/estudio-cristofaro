import { and, asc, eq, gte, lt } from "drizzle-orm";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, ExternalLink, Mail, Phone, Settings2, UserRound, Video, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cancelBookingAsStaff, disconnectGoogleCalendar, saveAvailability } from "@/app/admin/agenda-actions";
import { AdminField, Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { EmptyState } from "@/components/admin/kit/Panel";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { adminButton } from "@/components/admin/styles";
import { FormCheckbox, FormSelect, SubmitButton } from "@/components/admin/ui";
import { Badge } from "@/components/portal/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getDb } from "@/db";
import { availability, bookings, organizations, users } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { calendarAvailable, getConnection } from "@/lib/agenda/google";
import { STUDIO_TZ, addDays, isoWeekday, localDate, zonedTime } from "@/lib/agenda/time";
import { encryptionEnabled } from "@/lib/crypto";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Agenda" };

const timeFmt = new Intl.DateTimeFormat("es-AR", { timeZone: STUDIO_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fmtTime = (d: Date) => timeFmt.format(d);

// Colores por tipo de llamada (todos con texto AA sobre su fondo)
const CALL_TYPES = {
  web: { label: "Primera reunión (web)", card: "border-[#1c2235] bg-[#eceef3] text-ink hover:bg-[#e2e5ed]", dot: "bg-[#1c2235]" },
  portal: { label: "Cliente (portal)", card: "border-[#3f7f57] bg-[#ecf6ef] text-[#1d4a2f] hover:bg-[#e1f0e6]", dot: "bg-[#3f7f57]" },
  estudio: { label: "Cargada por el estudio", card: "border-[#a57c6d] bg-[#f6efeb] text-[#6d4a3c] hover:bg-[#efe3dd]", dot: "bg-[#a57c6d]" },
} as const;

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const dayFmt = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const GOOGLE_MSG: Record<string, [string, "ok" | "error"]> = {
  conectado: ["Google Calendar conectado.", "ok"],
  desconectado: ["Google Calendar desconectado.", "ok"],
  cancelado: ["Cancelaste la conexión con Google.", "error"],
  error: ["No se pudo conectar Google Calendar. Probá de nuevo.", "error"],
  "no-configurado": ["Falta configurar GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y ENCRYPTION_KEY en el servidor.", "error"],
};

export default async function AgendaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const staff = await requireStaff();
  const tab = sp.tab === "disponibilidad" ? "disponibilidad" : "semana";
  const db = getDb();

  const notices = [
    sp.guardado && <Notice key="g">Disponibilidad guardada.</Notice>,
    sp.cancelada && <Notice key="c">Llamada cancelada. Le avisamos al cliente.</Notice>,
    sp.google && GOOGLE_MSG[sp.google] && (
      <div key="go" className="mb-4">
        <Notice tone={GOOGLE_MSG[sp.google][1]}>{GOOGLE_MSG[sp.google][0]}</Notice>
      </div>
    ),
    sp.error === "link" && (
      <div key="e" className="mb-4">
        <Notice tone="error">El link fijo tiene que empezar con https://</Notice>
      </div>
    ),
  ];

  const header = (
    <PageHeader
      title="Agenda"
      description={tab === "semana" ? "Llamadas de la semana. Elegí una para ver el detalle." : "Tus horarios para que los clientes agenden llamadas."}
      tabs={[
        { href: "/admin/agenda?tab=semana", label: "Semana", icon: CalendarDays, active: tab === "semana" },
        { href: "/admin/agenda?tab=disponibilidad", label: "Mi disponibilidad", icon: Settings2, active: tab === "disponibilidad" },
      ]}
    />
  );

  if (tab === "disponibilidad") {
    const [[av], conn] = await Promise.all([db.select().from(availability).where(eq(availability.user_id, staff.id)), getConnection(staff.id)]);
    const weekly = av?.weekly ?? {
      "1": [
        { start: "09:00", end: "13:00" },
        { start: "14:00", end: "18:00" },
      ],
      "2": [{ start: "09:00", end: "13:00" }],
      "3": [{ start: "09:00", end: "13:00" }],
      "4": [{ start: "09:00", end: "13:00" }],
      "5": [{ start: "09:00", end: "13:00" }],
    };
    return (
      <div className="max-w-5xl">
        {header}
        {notices}
        <div className="tab-in grid gap-6 lg:grid-cols-[1fr_320px]">
          <form action={saveAvailability} className="space-y-6 border border-line bg-surface p-6">
            <div className="flex flex-wrap gap-6">
              <FormCheckbox id="active" name="active" label="Acepto llamadas" defaultChecked={av?.active ?? false} />
              <FormCheckbox id="public" name="public" label="Aparezco en la agenda de la web (/agendar)" defaultChecked={av?.public ?? false} />
            </div>
            <fieldset>
              <legend className="text-[16px] font-medium">Horario semanal (hora de Buenos Aires)</legend>
              <p className="mt-1 text-sm text-muted">Hasta dos franjas por día. Dejá vacío el día que no atendés.</p>
              <div className="mt-3 space-y-2">
                {DAYS.map((name, i) => {
                  const ranges = weekly[String(i + 1) as keyof typeof weekly] ?? [];
                  return (
                    <div key={name} className="grid grid-cols-[90px_1fr] items-center gap-3 sm:grid-cols-[110px_1fr_1fr]">
                      <span className="text-[15px]">{name}</span>
                      {[1, 2].map((n) => (
                        <div key={n} className={cn("flex items-center gap-2", n === 2 && "col-start-2 sm:col-start-auto")}>
                          <Input
                            aria-label={`${name}, franja ${n}, desde`}
                            type="time"
                            name={`d${i + 1}-s${n}`}
                            defaultValue={ranges[n - 1]?.start ?? ""}
                            className="w-28"
                          />
                          <span className="text-muted">a</span>
                          <Input
                            aria-label={`${name}, franja ${n}, hasta`}
                            type="time"
                            name={`d${i + 1}-e${n}`}
                            defaultValue={ranges[n - 1]?.end ?? ""}
                            className="w-28"
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <AdminField label="Duración de cada llamada" htmlFor="duration">
                <FormSelect
                  id="duration"
                  name="duration"
                  defaultValue={String(av?.duration_minutes ?? 30)}
                  options={["15", "30", "45"].map((v) => ({ value: v, label: `${v} minutos` }))}
                />
              </AdminField>
              <AdminField label="Margen entre llamadas (min)" htmlFor="buffer">
                <Input id="buffer" name="buffer" type="number" min={0} max={120} defaultValue={av?.buffer_minutes ?? 10} />
              </AdminField>
              <AdminField label="Anticipación mínima (horas)" htmlFor="notice">
                <Input id="notice" name="notice" type="number" min={0} max={336} defaultValue={av?.min_notice_hours ?? 12} />
              </AdminField>
            </div>
            <AdminField label="Días bloqueados" htmlFor="blocked" hint="Feriados, vacaciones: una fecha por línea (AAAA-MM-DD).">
              <Textarea id="blocked" name="blocked" rows={3} defaultValue={(av?.blocked_dates ?? []).join("\n")} placeholder="2026-12-24" />
            </AdminField>
            <AdminField
              label="Link fijo de videollamada (si no conectás Google)"
              htmlFor="manual_meeting_url"
              hint="Se manda en la confirmación cuando no hay Google Meet."
            >
              <Input
                id="manual_meeting_url"
                name="manual_meeting_url"
                type="url"
                defaultValue={av?.manual_meeting_url ?? ""}
                placeholder="https://meet.google.com/abc-defg-hij"
              />
            </AdminField>
            <SubmitButton>Guardar disponibilidad</SubmitButton>
          </form>
          <aside className="space-y-4">
            <section className="border border-line bg-surface p-5">
              <h2 className="text-[16px] font-medium">Google Calendar</h2>
              {conn ? (
                <>
                  <p className="mt-2 text-sm">
                    <Badge tone="ok">Conectado</Badge> {conn.google_email}
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    Se leen tus horarios ocupados y cada llamada se crea con Google Meet e invitación al cliente.
                  </p>
                  <form action={disconnectGoogleCalendar} className="mt-3">
                    <SubmitButton
                      variant="danger"
                      pendingText="…"
                      confirm="¿Desconectar Google Calendar? Las llamadas siguen agendadas, pero sin Meet automático."
                      confirmLabel="Desconectar"
                    >
                      Desconectar
                    </SubmitButton>
                  </form>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm text-muted">
                    Conectalo para no ofrecer horarios en los que ya tenés algo y para crear cada llamada con Google Meet. Es independiente del login.
                  </p>
                  {calendarAvailable() ? (
                    <a href="/api/agenda/google/connect" className={cn(adminButton.primary, "mt-3")}>
                      Conectar Google Calendar
                    </a>
                  ) : (
                    <p className="mt-3 text-sm text-danger">
                      {encryptionEnabled()
                        ? "Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET."
                        : "Falta configurar ENCRYPTION_KEY en el servidor."}
                    </p>
                  )}
                </>
              )}
            </section>
            <p className="px-1 text-sm text-muted">
              Sin Google, la agenda funciona igual: confirmación por mail, archivo .ics y el link fijo de videollamada.
            </p>
          </aside>
        </div>
      </div>
    );
  }

  // Semana: lunes de la semana pedida (?semana=AAAA-MM-DD) o de la actual
  const today = localDate(new Date());
  const base = sp.semana && /^\d{4}-\d{2}-\d{2}$/.test(sp.semana) ? sp.semana : today;
  const monday = addDays(base, 1 - isoWeekday(base));
  const from = zonedTime(monday, "00:00", STUDIO_TZ);
  const to = zonedTime(addDays(monday, 7), "00:00", STUDIO_TZ);
  const mine = sp.quien !== "todos";
  const rows = await db
    .select({ b: bookings, host: users.name, org: organizations.name })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.host_user_id))
    .leftJoin(organizations, eq(organizations.id, bookings.organization_id))
    .where(
      and(
        eq(bookings.studio_id, staff.studioId),
        gte(bookings.starts_at, from),
        lt(bookings.starts_at, to),
        mine ? eq(bookings.host_user_id, staff.id) : undefined,
      ),
    )
    .orderBy(asc(bookings.starts_at));
  const qs = (extra: Record<string, string>) =>
    new URLSearchParams({ tab: "semana", semana: monday, ...(mine ? {} : { quien: "todos" }), ...extra }).toString();

  const selected = rows.find((r) => r.b.id === sp.llamada) ?? null;
  const counts = { web: 0, portal: 0, estudio: 0 } as Record<keyof typeof CALL_TYPES, number>;
  for (const r of rows) if (r.b.status === "confirmada") counts[r.b.origin as keyof typeof CALL_TYPES]++;

  return (
    <div>
      {header}
      {notices}
      <div className="tab-in">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={`/admin/agenda?${qs({ semana: addDays(monday, -7) })}`} className="grid size-9 place-items-center border border-line bg-surface" aria-label="Semana anterior">
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
            <h2 className="min-w-52 text-center font-display text-[20px]">Semana del {dayFmt.format(new Date(`${monday}T12:00:00Z`))}</h2>
            <Link href={`/admin/agenda?${qs({ semana: addDays(monday, 7) })}`} className="grid size-9 place-items-center border border-line bg-surface" aria-label="Semana siguiente">
              <ChevronRight className="size-4" aria-hidden />
            </Link>
            <Link href={`/admin/agenda?${qs({ semana: today })}`} className="ml-2 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">
              Hoy
            </Link>
          </div>
          <div className="flex gap-1 text-[13px]">
            <Link
              href={`/admin/agenda?${new URLSearchParams({ tab: "semana", semana: monday }).toString()}`}
              aria-current={mine ? "true" : undefined}
              className={cn("inline-flex h-7 items-center rounded-[2px] border px-2.5", mine ? "border-navy bg-navy text-paper" : "border-line bg-surface text-ink")}
            >
              Mis llamadas
            </Link>
            <Link
              href={`/admin/agenda?${new URLSearchParams({ tab: "semana", semana: monday, quien: "todos" }).toString()}`}
              aria-current={!mine ? "true" : undefined}
              className={cn("inline-flex h-7 items-center rounded-[2px] border px-2.5", !mine ? "border-navy bg-navy text-paper" : "border-line bg-surface text-ink")}
            >
              Todo el estudio
            </Link>
          </div>
        </div>
        <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted" aria-label="Tipos de llamada">
          {(Object.keys(CALL_TYPES) as (keyof typeof CALL_TYPES)[]).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={cn("size-2.5", CALL_TYPES[k].dot)} aria-hidden />
              {CALL_TYPES[k].label} <span className="tabular text-ink">{counts[k]}</span>
            </li>
          ))}
        </ul>
        <div className={cn("grid items-start gap-4", selected && "xl:grid-cols-[1fr_340px]")}>
          <div className="grid border-l border-t border-line bg-surface md:grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => {
              const date = addDays(monday, i);
              const list = rows.filter((r) => localDate(r.b.starts_at) === date);
              return (
                <section key={date} aria-label={dayFmt.format(new Date(`${date}T12:00:00Z`))} className={cn("min-h-40 border-b border-r border-line p-2", date === today && "bg-navy-soft/40")}>
                  <h3 className={cn("mb-2 px-1 text-[13px] capitalize", date === today ? "font-medium text-rose-deep" : "text-muted")}>
                    {dayFmt.format(new Date(`${date}T12:00:00Z`))}
                    {date === today && " · hoy"}
                  </h3>
                  <ul className="space-y-1.5">
                    {list.length === 0 && <li className="px-1 text-[12px] text-muted">Sin llamadas</li>}
                    {list.map(({ b, host, org }) => {
                      const t = CALL_TYPES[b.origin as keyof typeof CALL_TYPES] ?? CALL_TYPES.web;
                      const on = selected?.b.id === b.id;
                      return (
                        <li key={b.id}>
                          <Link
                            href={`/admin/agenda?${qs({ llamada: b.id })}`}
                            aria-current={on ? "true" : undefined}
                            className={cn(
                              "block border-l-2 px-2 py-1.5 text-[13px] transition-colors",
                              b.status === "cancelada" ? "border-line bg-paper text-muted line-through" : t.card,
                              on && "outline outline-1 outline-navy",
                            )}
                          >
                            <span className="tabular block font-medium">
                              {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
                            </span>
                            <span className="block truncate">{b.name}</span>
                            <span className="block truncate text-[12px] opacity-80">
                              {org ?? t.label}
                              {!mine ? ` · ${host}` : ""}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
          {selected && (
            <aside aria-label="Detalle de la llamada" className="border border-line bg-surface xl:sticky xl:top-20">
              <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[12px] text-muted">{(CALL_TYPES[selected.b.origin as keyof typeof CALL_TYPES] ?? CALL_TYPES.web).label}</p>
                  <h2 className="truncate text-[16px] font-medium text-ink">{selected.b.name}</h2>
                </div>
                <Link href={`/admin/agenda?${qs({})}`} aria-label="Cerrar detalle" className="grid size-8 place-items-center text-muted hover:text-ink">
                  <X className="size-4" aria-hidden />
                </Link>
              </div>
              <dl className="space-y-3 px-5 py-4 text-[14px]">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-muted" strokeWidth={1.5} aria-hidden />
                  <dt className="sr-only">Horario</dt>
                  <dd className="tabular capitalize">
                    {dayFmt.format(new Date(`${localDate(selected.b.starts_at)}T12:00:00Z`))} · {fmtTime(selected.b.starts_at)}–{fmtTime(selected.b.ends_at)}
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="sr-only">Estado</dt>
                  <dd>
                    <StatusBadge status={selected.b.status} />
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-muted" strokeWidth={1.5} aria-hidden />
                  <dt className="sr-only">Email</dt>
                  <dd className="min-w-0 truncate">
                    <a href={`mailto:${selected.b.email}`} className="underline-offset-4 hover:underline">
                      {selected.b.email}
                    </a>
                  </dd>
                </div>
                {selected.b.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="size-4 text-muted" strokeWidth={1.5} aria-hidden />
                    <dt className="sr-only">Teléfono</dt>
                    <dd className="tabular">{selected.b.phone}</dd>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <UserRound className="size-4 text-muted" strokeWidth={1.5} aria-hidden />
                  <dt className="sr-only">Con</dt>
                  <dd>Con {selected.host}</dd>
                </div>
                {selected.b.reason && (
                  <div>
                    <dt className="text-[12px] text-muted">Motivo</dt>
                    <dd className="mt-0.5 whitespace-pre-line">{selected.b.reason}</dd>
                  </div>
                )}
              </dl>
              <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
                {selected.b.status === "confirmada" && selected.b.meet_url && (
                  <a href={selected.b.meet_url} target="_blank" rel="noopener" className={adminButton.primary}>
                    <Video className="size-4" aria-hidden /> Entrar a Meet
                  </a>
                )}
                {selected.b.organization_id && (
                  <Link href={`/admin/organizaciones/${selected.b.organization_id}`} className="inline-flex items-center gap-1 text-[14px] text-ink underline underline-offset-4 hover:text-rose-deep">
                    {selected.org ?? "Organización"} <ExternalLink className="size-3.5" aria-hidden />
                  </Link>
                )}
                {selected.b.lead_id && (
                  <Link href={`/admin/consultas/${selected.b.lead_id}`} className="inline-flex items-center gap-1 text-[14px] text-ink underline underline-offset-4 hover:text-rose-deep">
                    Ver consulta <ExternalLink className="size-3.5" aria-hidden />
                  </Link>
                )}
                {selected.b.status === "confirmada" && (
                  <form action={cancelBookingAsStaff} className="ml-auto">
                    <input type="hidden" name="id" value={selected.b.id} />
                    <input type="hidden" name="back" value={qs({})} />
                    <SubmitButton variant="danger" pendingText="…" confirm={`¿Cancelar la llamada con ${selected.b.name}? Le avisamos por mail.`} confirmLabel="Cancelar llamada">
                      Cancelar
                    </SubmitButton>
                  </form>
                )}
              </div>
            </aside>
          )}
        </div>
        {rows.length === 0 && (
          <div className="mt-4 border border-line bg-surface">
            <EmptyState icon={CalendarDays} title="No hay llamadas esta semana" text="Revisá tu disponibilidad para que los clientes puedan agendar." action={{ href: "/admin/agenda?tab=disponibilidad", label: "Mi disponibilidad" }} />
          </div>
        )}
      </div>
    </div>
  );
}
