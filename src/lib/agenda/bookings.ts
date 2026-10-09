import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { availability, bookings, leads, users } from "@/db/schema";
import { audit } from "../audit";
import { esc, sendMail } from "../email";
import { mailLayout } from "../notify";
import { getSiteUrl } from "../runtime-config";
import { site } from "../site";
import { cancelEvent, createMeetEvent, moveEvent } from "./google";
import { buildIcs } from "./ics";
import { fmtDateTime, fmtTime } from "./time";

// Reservas de llamadas: alta (web, portal o estudio), reprogramación y
// cancelación por link seguro, mails con .ics y recordatorios 24 h y 1 h antes.
// Sin Google Calendar todo funciona igual: no hay chequeo de ocupación externa
// y el link de la llamada es el fijo de la disponibilidad (o lo manda el estudio).

export type Booking = typeof bookings.$inferSelect;

const skip24h = (start: Date) => (start.getTime() - Date.now() < 24 * 3600_000 ? new Date() : null);

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const newToken = () => randomBytes(24).toString("base64url");
export const manageUrl = (token: string) => `${getSiteUrl()}/agenda/gestionar/${token}`;
export const icsUrl = (token: string) => `${getSiteUrl()}/api/agenda/ics/${token}`;

async function host(userId: string) {
  const [h] = await getDb()
    .select({ id: users.id, name: users.name, email: users.email, manualUrl: availability.manual_meeting_url })
    .from(users)
    .leftJoin(availability, eq(availability.user_id, users.id))
    .where(eq(users.id, userId));
  return h!;
}

function ics(b: Booking, h: { name: string; email: string }, token: string | null, cancelled = false) {
  return buildIcs({
    uid: b.id,
    sequence: b.sequence,
    start: b.starts_at,
    end: b.ends_at,
    summary: `Llamada con ${h.name} · Estudio Cristofaro`,
    description: [
      b.reason && `Motivo: ${b.reason}`,
      b.meet_url && `Link de la llamada: ${b.meet_url}`,
      token && `Reprogramar o cancelar: ${manageUrl(token)}`,
    ]
      .filter(Boolean)
      .join("\n"),
    location: b.meet_url,
    organizer: { name: site.name, email: h.email },
    attendee: { name: b.name, email: b.email },
    cancelled,
  });
}

function details(b: Booking, h: { name: string }) {
  return `<p style="margin:0"><strong>${esc(fmtDateTime(b.starts_at))}</strong> a ${esc(fmtTime(b.ends_at))} (hora de Buenos Aires)<br>Con ${esc(h.name)}${b.reason ? `<br>Motivo: ${esc(b.reason)}` : ""}</p>`;
}

function meetBlock(b: Booking) {
  return b.meet_url
    ? `<p>Link de la videollamada: <a href="${esc(b.meet_url)}">${esc(b.meet_url)}</a></p>`
    : `<p>Te mandamos el link de la videollamada antes de la reunión.</p>`;
}

async function mailClient(kind: "confirmada" | "reprogramada" | "cancelada" | "24h" | "1h", b: Booking, token: string | null) {
  const h = await host(b.host_user_id);
  const manage = token ? `<p style="color:#5a6176;font-size:13px">¿No podés? <a href="${manageUrl(token)}">Reprogramá o cancelá acá</a>.</p>` : "";
  const subjects = {
    confirmada: "Confirmamos tu llamada con el Estudio Cristofaro",
    reprogramada: "Reprogramamos tu llamada con el Estudio Cristofaro",
    cancelada: "Cancelamos tu llamada con el Estudio Cristofaro",
    "24h": "Mañana tenés una llamada con el Estudio Cristofaro",
    "1h": "En una hora: tu llamada con el Estudio Cristofaro",
  };
  const titles = {
    confirmada: "Llamada confirmada",
    reprogramada: "Llamada reprogramada",
    cancelada: "Llamada cancelada",
    "24h": "Te recordamos tu llamada",
    "1h": "Tu llamada es en una hora",
  };
  const body =
    kind === "cancelada"
      ? `${details(b, h)}<p>La llamada quedó cancelada. Si querés, agendá otra cuando te quede cómodo.</p>`
      : `${details(b, h)}${meetBlock(b)}${manage}`;
  const cta =
    kind === "cancelada"
      ? { href: `${getSiteUrl()}/agendar`, label: "Agendar otra llamada" }
      : b.meet_url
        ? { href: b.meet_url, label: "Entrar a la llamada" }
        : undefined;
  return sendMail({
    to: b.email,
    replyTo: h.email,
    subject: subjects[kind],
    html: mailLayout(titles[kind], body, cta),
    attachments:
      kind === "1h"
        ? undefined
        : [
            {
              filename: "llamada.ics",
              content: ics(b, h, token, kind === "cancelada"),
              contentType: `text/calendar; charset=utf-8; method=${kind === "cancelada" ? "CANCEL" : "REQUEST"}`,
            },
          ],
  });
}

async function mailHost(kind: "nueva" | "reprogramada" | "cancelada", b: Booking) {
  const h = await host(b.host_user_id);
  const subject = { nueva: `Nueva llamada: ${b.name}`, reprogramada: `Reprogramada: ${b.name}`, cancelada: `Cancelada: ${b.name}` }[kind];
  return sendMail({
    to: h.email,
    replyTo: b.email,
    subject,
    html: mailLayout(
      subject,
      `${details(b, h)}<p>${esc(b.name)} · ${esc(b.email)}${b.phone ? ` · ${esc(b.phone)}` : ""}</p>${b.meet_url ? meetBlock(b) : "<p>No hay link de videollamada: mandáselo al cliente.</p>"}`,
      { href: `${getSiteUrl()}/admin/agenda`, label: "Ver la agenda" },
    ),
  });
}

/** Crea o actualiza la consulta (lead) de quien agenda desde la web, con origen "agenda" */
async function upsertLead(
  studioId: string,
  input: { name: string; email: string; phone?: string | null; company?: string | null; reason?: string | null },
  hostId: string,
) {
  const db = getDb();
  const [existing] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.studio_id, studioId), sql`lower(${leads.email}) = ${input.email.toLowerCase()}`))
    .orderBy(sql`${leads.created_at} desc`)
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(leads)
    .values({
      studio_id: studioId,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      company: input.company ?? null,
      message: input.reason ?? null,
      source: "agenda",
      assigned_to: hostId,
    })
    .returning({ id: leads.id });
  return row.id;
}

export interface NewBooking {
  studioId: string;
  hostId: string;
  start: Date;
  end: Date;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  reason?: string | null;
  origin: "web" | "portal" | "estudio";
  organizationId?: string | null;
  createdBy?: { id: string; email: string } | null;
}

export async function createBooking(input: NewBooking) {
  const db = getDb();
  const token = newToken();
  const leadId = input.origin === "web" ? await upsertLead(input.studioId, input, input.hostId) : null;
  const h = await host(input.hostId);
  const [b] = await db
    .insert(bookings)
    .values({
      studio_id: input.studioId,
      host_user_id: input.hostId,
      organization_id: input.organizationId ?? null,
      lead_id: leadId,
      created_by: input.createdBy?.id ?? null,
      origin: input.origin,
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone ?? null,
      reason: input.reason ?? null,
      starts_at: input.start,
      ends_at: input.end,
      meet_url: h.manualUrl ?? null,
      manage_token_hash: hashToken(token),
      // Si falta menos de un día, el recordatorio de 24 h ya no corresponde
      reminder_24h_at: skip24h(input.start),
    })
    .returning();
  let booking = b;
  // Google Calendar: evento con Meet e invitación al cliente (si la persona lo conectó)
  try {
    const ev = await createMeetEvent(input.hostId, {
      summary: `Llamada Estudio Cristofaro · ${input.name}`,
      description: [
        input.reason && `Motivo: ${input.reason}`,
        input.company && `Empresa: ${input.company}`,
        input.phone && `Teléfono: ${input.phone}`,
        `Reprogramar o cancelar: ${manageUrl(token)}`,
      ]
        .filter(Boolean)
        .join("\n"),
      start: input.start,
      end: input.end,
      attendee: { email: input.email, name: input.name },
    });
    if (ev) {
      [booking] = await db
        .update(bookings)
        .set({ google_event_id: ev.id, meet_url: ev.meetUrl ?? booking.meet_url })
        .where(eq(bookings.id, booking.id))
        .returning();
    }
  } catch (error) {
    console.error("[agenda] No se pudo crear el evento en Google Calendar", error);
  }
  await audit({
    studioId: input.studioId,
    organizationId: input.organizationId ?? null,
    actor: input.createdBy ?? null,
    actorLabel: input.createdBy ? undefined : input.email,
    action: "agenda.reservar",
    entityType: "llamada",
    entityId: booking.id,
    metadata: { origen: input.origin, inicio: booking.starts_at.toISOString(), con: h.email, google: Boolean(booking.google_event_id) },
  });
  await Promise.all([mailClient("confirmada", booking, token), mailHost("nueva", booking)]);
  return { booking, token };
}

export async function bookingByToken(token: string) {
  if (!token || token.length > 80) return null;
  const [b] = await getDb()
    .select()
    .from(bookings)
    .where(eq(bookings.manage_token_hash, hashToken(token)));
  return b ?? null;
}

export async function rescheduleBooking(b: Booking, token: string, start: Date, end: Date, actorLabel: string) {
  const db = getDb();
  const [updated] = await db
    .update(bookings)
    .set({ starts_at: start, ends_at: end, sequence: b.sequence + 1, reminder_24h_at: skip24h(start), reminder_1h_at: null })
    .where(and(eq(bookings.id, b.id), eq(bookings.status, "confirmada")))
    .returning();
  if (!updated) return null;
  if (updated.google_event_id)
    await moveEvent(updated.host_user_id, updated.google_event_id, start, end).catch((e) => console.error("[agenda] mover evento", e));
  await audit({
    studioId: b.studio_id,
    organizationId: b.organization_id,
    actorLabel,
    action: "agenda.reprogramar",
    entityType: "llamada",
    entityId: b.id,
    metadata: { antes: b.starts_at.toISOString(), ahora: start.toISOString() },
  });
  await Promise.all([mailClient("reprogramada", updated, token), mailHost("reprogramada", updated)]);
  return updated;
}

export async function cancelBooking(b: Booking, token: string | null, actorLabel: string, actor?: { id: string; email: string }) {
  const [updated] = await getDb()
    .update(bookings)
    .set({ status: "cancelada", cancelled_at: new Date(), sequence: b.sequence + 1 })
    .where(and(eq(bookings.id, b.id), eq(bookings.status, "confirmada")))
    .returning();
  if (!updated) return null;
  if (updated.google_event_id)
    await cancelEvent(updated.host_user_id, updated.google_event_id).catch((e) => console.error("[agenda] cancelar evento", e));
  await audit({
    studioId: b.studio_id,
    organizationId: b.organization_id,
    actor: actor ?? null,
    actorLabel,
    action: "agenda.cancelar",
    entityType: "llamada",
    entityId: b.id,
  });
  await Promise.all([mailClient("cancelada", updated, token), mailHost("cancelada", updated)]);
  return updated;
}

/** .ics de una reserva por su link seguro */
export async function icsForToken(token: string) {
  const b = await bookingByToken(token);
  if (!b) return null;
  return ics(b, await host(b.host_user_id), token, b.status === "cancelada");
}

/**
 * Recordatorios: 24 h y 1 h antes. Cada uno se "reclama" con un UPDATE
 * condicional antes de mandar el mail, así nunca sale dos veces aunque corran
 * dos procesos a la vez. Lo llama el intervalo de instrumentation.ts y
 * POST /api/agenda/recordatorios (cron externo).
 */
export async function sendReminders(now = new Date()) {
  const db = getDb();
  const in24 = new Date(now.getTime() + 24 * 3600_000);
  const in1 = new Date(now.getTime() + 3600_000);
  const day = await db
    .update(bookings)
    .set({ reminder_24h_at: now })
    .where(and(eq(bookings.status, "confirmada"), isNull(bookings.reminder_24h_at), lte(bookings.starts_at, in24), gt(bookings.starts_at, in1)))
    .returning();
  const hour = await db
    .update(bookings)
    .set({ reminder_1h_at: now })
    .where(and(eq(bookings.status, "confirmada"), isNull(bookings.reminder_1h_at), lte(bookings.starts_at, in1), gt(bookings.starts_at, now)))
    .returning();
  for (const b of day) await mailClient("24h", b, null);
  for (const b of hour) await mailClient("1h", b, null);
  return { day: day.length, hour: hour.length };
}
