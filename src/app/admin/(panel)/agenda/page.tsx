import { and, asc, eq, gte, lt } from "drizzle-orm";
import { Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cancelBookingAsStaff, disconnectGoogleCalendar, saveAvailability } from "@/app/admin/agenda-actions";
import { AdminField, AdminPageHeader, Notice } from "@/components/admin/AdminField";
import { adminButton } from "@/components/admin/styles";
import { FormCheckbox, FormSelect, SubmitButton } from "@/components/admin/ui";
import { Badge } from "@/components/portal/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getDb } from "@/db";
import { availability, bookings, organizations, users } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { calendarAvailable, getConnection } from "@/lib/agenda/google";
import { STUDIO_TZ, addDays, fmtTime, isoWeekday, localDate, zonedTime } from "@/lib/agenda/time";
import { encryptionEnabled } from "@/lib/crypto";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Agenda" };

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

  const tabs = (
    <nav aria-label="Agenda" className="mb-6 flex gap-1 border-b border-line">
      {[
        ["semana", "Semana"],
        ["disponibilidad", "Mi disponibilidad"],
      ].map(([k, l]) => (
        <Link
          key={k}
          href={`/admin/agenda?tab=${k}`}
          aria-current={tab === k ? "page" : undefined}
          className={cn(
            "relative px-3 py-2.5 text-[15px]",
            tab === k
              ? "font-medium text-navy after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-rose"
              : "text-muted hover:text-ink",
          )}
        >
          {l}
        </Link>
      ))}
    </nav>
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
        <AdminPageHeader title="Agenda" />
        {notices}
        {tabs}
        <div className="tab-in grid gap-6 lg:grid-cols-[1fr_320px]">
          <form action={saveAvailability} className="space-y-6 rounded-md border border-line bg-surface p-6">
            <div className="flex flex-wrap gap-6">
              <FormCheckbox id="active" name="active" label="Acepto llamadas" defaultChecked={av?.active ?? false} />
              <FormCheckbox id="public" name="public" label="Aparezco en la agenda de la web (/agendar)" defaultChecked={av?.public ?? false} />
            </div>
            <fieldset>
              <legend className="font-semibold">Horario semanal (hora de Buenos Aires)</legend>
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
            <section className="rounded-md border border-line bg-surface p-5">
              <h2 className="font-semibold">Google Calendar</h2>
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

  return (
    <div className="max-w-6xl">
      <AdminPageHeader title="Agenda" />
      {notices}
      {tabs}
      <div className="tab-in">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={`/admin/agenda?${qs({ semana: addDays(monday, -7) })}`} className={adminButton.secondary} aria-label="Semana anterior">
              ←
            </Link>
            <p className="min-w-48 text-center font-medium">Semana del {dayFmt.format(new Date(`${monday}T12:00:00Z`))}</p>
            <Link href={`/admin/agenda?${qs({ semana: addDays(monday, 7) })}`} className={adminButton.secondary} aria-label="Semana siguiente">
              →
            </Link>
            <Link href={`/admin/agenda?${qs({ semana: today })}`} className="ml-2 text-sm text-rose-deep hover:underline">
              Hoy
            </Link>
          </div>
          <div className="flex gap-1 text-sm">
            <Link
              href={`/admin/agenda?${new URLSearchParams({ tab: "semana", semana: monday }).toString()}`}
              className={cn("rounded-[2px] border px-3 py-1", mine ? "border-navy bg-navy text-paper" : "border-line")}
            >
              Mis llamadas
            </Link>
            <Link
              href={`/admin/agenda?${new URLSearchParams({ tab: "semana", semana: monday, quien: "todos" }).toString()}`}
              className={cn("rounded-[2px] border px-3 py-1", !mine ? "border-navy bg-navy text-paper" : "border-line")}
            >
              Todo el estudio
            </Link>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => {
            const date = addDays(monday, i);
            const list = rows.filter((r) => localDate(r.b.starts_at) === date);
            return (
              <section key={date} className={cn("rounded-md border bg-surface p-3", date === today ? "border-rose/60" : "border-line")}>
                <h2 className={cn("text-sm capitalize", date === today ? "font-semibold text-rose-deep" : "text-muted")}>
                  {dayFmt.format(new Date(`${date}T12:00:00Z`))}
                </h2>
                <ul className="mt-2 space-y-2">
                  {list.length === 0 && <li className="text-xs text-muted/70">Sin llamadas</li>}
                  {list.map(({ b, host, org }) => (
                    <li
                      key={b.id}
                      className={cn(
                        "rounded-[4px] border-l-2 bg-paper p-2 text-sm",
                        b.status === "cancelada" ? "border-line text-muted line-through" : "border-rose",
                      )}
                    >
                      <p className="font-medium tabular-nums">
                        {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
                      </p>
                      <p className="truncate">{b.name}</p>
                      <p className="truncate text-xs text-muted">
                        {org ?? (b.origin === "web" ? "Web" : b.origin)}
                        {!mine ? ` · ${host}` : ""}
                      </p>
                      {b.status === "confirmada" && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 no-underline">
                          {b.meet_url && (
                            <a
                              href={b.meet_url}
                              target="_blank"
                              rel="noopener"
                              className="inline-flex items-center gap-1 text-xs text-rose-deep hover:underline"
                            >
                              <Video className="size-3.5" aria-hidden /> Meet
                            </a>
                          )}
                          <form action={cancelBookingAsStaff}>
                            <input type="hidden" name="id" value={b.id} />
                            <input type="hidden" name="back" value={qs({})} />
                            <SubmitButton
                              variant="danger"
                              pendingText="…"
                              confirm={`¿Cancelar la llamada con ${b.name}? Le avisamos por mail.`}
                              confirmLabel="Cancelar llamada"
                            >
                              Cancelar
                            </SubmitButton>
                          </form>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
