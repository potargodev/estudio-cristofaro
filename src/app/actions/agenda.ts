"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { bookingByToken, cancelBooking, createBooking, rescheduleBooking } from "@/lib/agenda/bookings";
import { findSlot, getHosts } from "@/lib/agenda/slots";
import { getStudioId } from "@/lib/data";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Agenda pública (/agendar y el link para reprogramar o cancelar). El horario
// se vuelve a validar en el servidor contra la disponibilidad real.

export interface BookingState {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
}

function s(fd: FormData, k: string) {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function bookCall(_prev: BookingState, fd: FormData): Promise<BookingState> {
  if (s(fd, "website")) return { ok: false, message: "No se pudo agendar." }; // honeypot
  const name = s(fd, "name");
  const email = s(fd, "email")?.toLowerCase() ?? null;
  const errors: Record<string, string> = {};
  if (!name) errors.name = "Contanos tu nombre.";
  if (!email || !EMAIL_RE.test(email)) errors.email = "Revisá el email: ahí te llega la confirmación.";
  const start = new Date(s(fd, "start") ?? "");
  if (Number.isNaN(start.getTime())) errors.start = "Elegí un día y un horario.";
  if (Object.keys(errors).length) return { ok: false, message: "Revisá los campos marcados.", errors };
  if (!rateLimit(`agenda:${clientIp(await headers())}`, 5, 10 * 60_000)) {
    return { ok: false, message: "Agendaste varias veces seguidas. Probá en unos minutos o escribinos por WhatsApp." };
  }
  const studioId = await getStudioId();
  if (!studioId) return { ok: false, message: "La agenda no está disponible en este momento." };
  const slot = await findSlot(await getHosts(studioId, { publicOnly: true }), start);
  if (!slot)
    return { ok: false, message: "Ese horario se acaba de ocupar. Elegí otro, por favor.", errors: { start: "Ese horario ya no está libre." } };
  const { token } = await createBooking({
    studioId,
    hostId: slot.hostId,
    start: slot.start,
    end: slot.end,
    name: name!,
    email: email!,
    phone: s(fd, "phone"),
    company: s(fd, "company"),
    reason: s(fd, "reason"),
    origin: "web",
  });
  redirect(`/agendar/confirmada?t=${token}`);
}

export async function rescheduleCall(_prev: BookingState, fd: FormData): Promise<BookingState> {
  const token = s(fd, "token") ?? "";
  const b = await bookingByToken(token);
  if (!b || b.status !== "confirmada") return { ok: false, message: "Esta llamada ya no se puede reprogramar." };
  const start = new Date(s(fd, "start") ?? "");
  // Mismo anfitrión: se recalculan sus horarios sin contar la reserva actual
  const slot = await findSlot(await getHosts(b.studio_id, { userIds: [b.host_user_id] }), start, b.id);
  if (!slot) return { ok: false, message: "Ese horario ya no está libre. Elegí otro." };
  await rescheduleBooking(b, token, slot.start, slot.end, b.email);
  redirect(`/agenda/gestionar/${token}?reprogramada=1`);
}

export async function cancelCall(fd: FormData) {
  const token = s(fd, "token") ?? "";
  const b = await bookingByToken(token);
  if (b && b.status === "confirmada") await cancelBooking(b, token, b.email);
  redirect(`/agenda/gestionar/${token}?cancelada=1`);
}
