"use client";

import { useActionState } from "react";
import { rescheduleCall, type BookingState } from "@/app/actions/agenda";
import { Button } from "@/components/ui/button";
import { SlotPicker, type PickerDay } from "./SlotPicker";

export function RescheduleForm({ token, days }: { token: string; days: PickerDay[] }) {
  const [state, action, pending] = useActionState<BookingState, FormData>(rescheduleCall, { ok: false });
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <SlotPicker days={days} />
      {state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <div>
        <Button type="submit" size="lg" disabled={pending || days.length === 0}>
          {pending ? "Reprogramando…" : "Reprogramar"}
        </Button>
      </div>
    </form>
  );
}
