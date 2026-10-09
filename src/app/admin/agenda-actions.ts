"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { availability, bookings, type WeeklyHours } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth";
import { cancelBooking } from "@/lib/agenda/bookings";
import { disconnectCalendar } from "@/lib/agenda/google";
import { isUuid } from "@/lib/ids";

// Agenda del backoffice: cada persona del estudio edita SU disponibilidad y
// conecta SU Google Calendar. Cancelar llamadas: cualquiera del estudio, dentro
// de su estudio.

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function saveAvailability(fd: FormData) {
  const staff = await requireStaff();
  const weekly: WeeklyHours = {};
  for (const d of ["1", "2", "3", "4", "5", "6", "7"] as const) {
    const ranges = [1, 2]
      .map((n) => ({ start: s(fd, `d${d}-s${n}`), end: s(fd, `d${d}-e${n}`) }))
      .filter((r) => TIME.test(r.start) && TIME.test(r.end) && r.start < r.end);
    if (ranges.length) weekly[d] = ranges;
  }
  const duration = [15, 30, 45].includes(Number(s(fd, "duration"))) ? Number(s(fd, "duration")) : 30;
  const clamp = (v: string, min: number, max: number, def: number) =>
    Number.isFinite(Number(v)) && v !== "" ? Math.min(max, Math.max(min, Math.trunc(Number(v)))) : def;
  const url = s(fd, "manual_meeting_url");
  if (url && !/^https:\/\/\S+$/i.test(url)) redirect("/admin/agenda?tab=disponibilidad&error=link");
  const values = {
    studio_id: staff.studioId,
    active: fd.get("active") !== null,
    public: fd.get("public") !== null,
    weekly,
    duration_minutes: duration,
    buffer_minutes: clamp(s(fd, "buffer"), 0, 120, 10),
    min_notice_hours: clamp(s(fd, "notice"), 0, 24 * 14, 12),
    blocked_dates: [
      ...new Set(
        s(fd, "blocked")
          .split(/[\s,]+/)
          .filter((x) => DATE.test(x)),
      ),
    ].sort(),
    manual_meeting_url: url || null,
  };
  await getDb()
    .insert(availability)
    .values({ user_id: staff.id, ...values })
    .onConflictDoUpdate({ target: availability.user_id, set: values });
  await audit({
    studioId: staff.studioId,
    actor: staff,
    action: "agenda.disponibilidad",
    entityType: "usuario",
    entityId: staff.id,
    metadata: {
      activa: values.active,
      web: values.public,
      duracion: duration,
      dias: Object.keys(weekly).length,
      bloqueados: values.blocked_dates.length,
    },
  });
  revalidatePath("/admin/agenda");
  revalidatePath("/agendar");
  redirect("/admin/agenda?tab=disponibilidad&guardado=1");
}

export async function disconnectGoogleCalendar() {
  const staff = await requireStaff();
  await disconnectCalendar(staff.id);
  await audit({ studioId: staff.studioId, actor: staff, action: "agenda.google_desconectar", entityType: "usuario", entityId: staff.id });
  revalidatePath("/admin/agenda");
  redirect("/admin/agenda?tab=disponibilidad&google=desconectado");
}

export async function cancelBookingAsStaff(fd: FormData) {
  const staff = await requireStaff();
  const id = s(fd, "id");
  if (isUuid(id)) {
    const [b] = await getDb()
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, id), eq(bookings.studio_id, staff.studioId)));
    if (b) await cancelBooking(b, null, staff.email, staff);
  }
  revalidatePath("/admin/agenda");
  redirect(`/admin/agenda?${s(fd, "back") || ""}&cancelada=1`);
}
