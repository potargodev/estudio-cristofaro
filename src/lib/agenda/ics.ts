// Archivo .ics (iCalendar) de una llamada: se adjunta al mail y se puede bajar
// desde la confirmación. METHOD:CANCEL cuando se cancela.

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Líneas de más de 75 octetos se pliegan (RFC 5545) */
const fold = (line: string) => line.match(/.{1,73}/g)!.join("\r\n ");

export function buildIcs(e: {
  uid: string;
  sequence: number;
  start: Date;
  end: Date;
  summary: string;
  description: string;
  location?: string | null;
  organizer: { name: string; email: string };
  attendee: { name: string; email: string };
  cancelled?: boolean;
}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Estudio Cristofaro//Agenda//ES",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.cancelled ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}@estudiocristofaro.com`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${escapeText(e.summary)}`,
    `DESCRIPTION:${escapeText(e.description)}`,
    e.location ? `LOCATION:${escapeText(e.location)}` : null,
    e.location?.startsWith("http") ? `URL:${e.location}` : null,
    `ORGANIZER;CN=${escapeText(e.organizer.name)}:mailto:${e.organizer.email}`,
    `ATTENDEE;CN=${escapeText(e.attendee.name)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${e.attendee.email}`,
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Llamada con el Estudio Cristofaro",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => Boolean(l));
  return lines.map(fold).join("\r\n") + "\r\n";
}
