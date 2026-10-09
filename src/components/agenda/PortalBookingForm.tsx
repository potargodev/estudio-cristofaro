"use client";

import { useActionState } from "react";
import { portalBookCall, type PortalLoginState } from "@/app/portal/actions";
import { Button } from "@/components/ui/button";
import { SlotPicker, type PickerDay } from "./SlotPicker";

export function PortalBookingForm({ days }: { days: PickerDay[] }) {
  const [state, action, pending] = useActionState<PortalLoginState, FormData>(portalBookCall, { ok: false });
  return (
    <form action={action} className="grid gap-6">
      <SlotPicker days={days} />
      <div>
        <label htmlFor="reason" className="block text-sm font-medium">
          Motivo
        </label>
        <textarea
          id="reason"
          name="reason"
          required
          rows={3}
          maxLength={500}
          className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-[15px]"
        />
      </div>
      {state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <div>
        <Button type="submit" size="lg" disabled={pending || days.length === 0}>
          {pending ? "Agendando…" : "Confirmar llamada"}
        </Button>
      </div>
    </form>
  );
}
