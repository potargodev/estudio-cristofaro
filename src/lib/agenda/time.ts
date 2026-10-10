// Fechas y horas en la zona del estudio (America/Argentina/Buenos_Aires) sin
// librerías: se calcula el desfasaje con Intl, así funciona aunque cambie.

export const STUDIO_TZ = "America/Argentina/Buenos_Aires";

/** Minutos de desfasaje de `tz` respecto de UTC en el instante `at` */
function offsetMinutes(at: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return (asUtc - at.getTime()) / 60000;
}

/** "2026-10-14" + "09:30" en la zona `tz` → instante UTC */
export function zonedTime(date: string, time: string, tz = STUDIO_TZ): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let at = new Date(guess - offsetMinutes(new Date(guess), tz) * 60000);
  at = new Date(guess - offsetMinutes(at, tz) * 60000);
  return at;
}

/** Fecha local (YYYY-MM-DD) de un instante en la zona `tz` */
export function localDate(at: Date, tz = STUDIO_TZ) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Día de la semana ISO (1 = lunes … 7 = domingo) de una fecha YYYY-MM-DD */
export function isoWeekday(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const fmtDateTime = (at: Date, tz = STUDIO_TZ) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
export const fmtTime = (at: Date, tz = STUDIO_TZ) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
export const fmtDay = (date: string) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00Z`));
