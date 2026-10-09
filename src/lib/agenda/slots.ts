import "server-only";
import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { availability, bookings, users } from "@/db/schema";
import { busyIntervals } from "./google";
import { addDays, isoWeekday, localDate, zonedTime } from "./time";

// Horarios libres para agendar. Un horario está libre si cae dentro de las
// franjas semanales de la persona, no es un día bloqueado, respeta la
// anticipación mínima y, con el margen antes y después, no se superpone con
// otra reserva ni con un evento ocupado de su Google Calendar (freebusy).
// Se recalcula en el servidor al confirmar: nunca se confía en el horario que
// manda el navegador.

export const BOOKING_WINDOW_DAYS = 21;

export interface Slot {
  start: Date;
  end: Date;
  hostId: string;
}

export async function getHosts(studioId: string, filter: { publicOnly?: boolean; userIds?: string[] } = {}) {
  return getDb()
    .select({ av: availability, name: users.name, email: users.email })
    .from(availability)
    .innerJoin(users, eq(users.id, availability.user_id))
    .where(
      and(
        eq(availability.studio_id, studioId),
        eq(availability.active, true),
        eq(users.active, true),
        filter.publicOnly ? eq(availability.public, true) : undefined,
        filter.userIds ? inArray(availability.user_id, filter.userIds.length ? filter.userIds : ["00000000-0000-0000-0000-000000000000"]) : undefined,
      ),
    )
    .orderBy(users.name);
}

type Host = Awaited<ReturnType<typeof getHosts>>[number];

const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) => a.start < b.end && b.start < a.end;

async function hostSlots(host: Host, from: string, days: number, excludeBookingId?: string): Promise<Slot[]> {
  const av = host.av;
  const tz = av.timezone;
  const rangeStart = zonedTime(from, "00:00", tz);
  const rangeEnd = zonedTime(addDays(from, days + 1), "00:00", tz);
  const [taken, busy] = await Promise.all([
    getDb()
      .select({ start: bookings.starts_at, end: bookings.ends_at })
      .from(bookings)
      .where(
        and(
          eq(bookings.host_user_id, av.user_id),
          eq(bookings.status, "confirmada"),
          lt(bookings.starts_at, rangeEnd),
          gt(bookings.ends_at, rangeStart),
          excludeBookingId ? ne(bookings.id, excludeBookingId) : undefined,
        ),
      ),
    busyIntervals(av.user_id, rangeStart, rangeEnd),
  ]);
  const blocked = [...taken, ...(busy ?? [])];
  const earliest = new Date(Date.now() + av.min_notice_hours * 3600_000);
  const buffer = av.buffer_minutes * 60_000;
  const duration = av.duration_minutes * 60_000;
  const out: Slot[] = [];
  for (let i = 0; i <= days; i++) {
    const date = addDays(from, i);
    if (av.blocked_dates.includes(date)) continue;
    for (const range of av.weekly[String(isoWeekday(date)) as keyof typeof av.weekly] ?? []) {
      const end = zonedTime(date, range.end, tz);
      for (let t = zonedTime(date, range.start, tz); t.getTime() + duration <= end.getTime(); t = new Date(t.getTime() + duration)) {
        const slot = { start: t, end: new Date(t.getTime() + duration) };
        if (slot.start < earliest) continue;
        const padded = { start: new Date(slot.start.getTime() - buffer), end: new Date(slot.end.getTime() + buffer) };
        if (blocked.some((b) => overlaps(padded, b))) continue;
        out.push({ ...slot, hostId: av.user_id });
      }
    }
  }
  return out;
}

/**
 * Horarios libres de una o varias personas, agrupados por día local. Con
 * varias, cada horario se asigna a la primera que esté libre.
 */
export async function availableSlots(hosts: Host[], opts: { days?: number; excludeBookingId?: string } = {}) {
  const from = localDate(new Date());
  const days = opts.days ?? BOOKING_WINDOW_DAYS;
  const all = (await Promise.all(hosts.map((h) => hostSlots(h, from, days, opts.excludeBookingId)))).flat();
  const byStart = new Map<number, Slot>();
  for (const s of all.sort((a, b) => a.start.getTime() - b.start.getTime())) if (!byStart.has(s.start.getTime())) byStart.set(s.start.getTime(), s);
  const byDay = new Map<string, Slot[]>();
  for (const s of byStart.values()) {
    const d = localDate(s.start);
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  return byDay;
}

/** Valida en el servidor que el horario siga libre para esa persona (o alguna de la lista) */
export async function findSlot(hosts: Host[], start: Date, excludeBookingId?: string): Promise<Slot | null> {
  if (Number.isNaN(start.getTime())) return null;
  const byDay = await availableSlots(hosts, { excludeBookingId });
  for (const list of byDay.values()) {
    const found = list.find((s) => s.start.getTime() === start.getTime());
    if (found) return found;
  }
  return null;
}
