import { CalendarDays, ClipboardCheck, HelpCircle, Mail, MessageCircle, PenLine, type LucideIcon } from "lucide-react";

/** Ícono de cada origen de consulta */
export const LEAD_SOURCE_ICONS: Record<string, LucideIcon> = {
  diagnostico: ClipboardCheck,
  contacto: Mail,
  whatsapp: MessageCircle,
  manual: PenLine,
  agenda: CalendarDays,
  otro: HelpCircle,
};

export const leadSourceIcon = (source: string): LucideIcon => LEAD_SOURCE_ICONS[source] ?? HelpCircle;

export function daysLabel(days: number) {
  return days <= 0 ? "Hoy" : days === 1 ? "1 día" : `${days} días`;
}
