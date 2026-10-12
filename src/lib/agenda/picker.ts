import "server-only";
import type { PickerDay } from "@/components/agenda/SlotPicker";
import type { Slot } from "./slots";
import { formatDate } from "@/lib/format";

/** Horarios agrupados por día → datos serializables para el SlotPicker */
export function toPickerDays(byDay: Map<string, Slot[]>): PickerDay[] {
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, slots]) => ({ date, label: formatDate(date, "weekday"), slots: slots.map((s) => ({ iso: s.start.toISOString(), label: formatDate(s.start, "time") })) }));
}
