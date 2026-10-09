import "server-only";
import type { PickerDay } from "@/components/agenda/SlotPicker";
import type { Slot } from "./slots";
import { fmtDay, fmtTime } from "./time";

/** Horarios agrupados por día → datos serializables para el SlotPicker */
export function toPickerDays(byDay: Map<string, Slot[]>): PickerDay[] {
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, slots]) => ({ date, label: fmtDay(date), slots: slots.map((s) => ({ iso: s.start.toISOString(), label: fmtTime(s.start) })) }));
}
