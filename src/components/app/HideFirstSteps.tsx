"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setHideFirstStepsPref } from "@/app/actions/prefs";

/** Cerrar el widget de primeros pasos (queda en «Guía» → «Primeros pasos») */
export function HideFirstSteps() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => {
        await setHideFirstStepsPref(true);
        router.refresh();
      })}
      aria-label="Cerrar (los pasos quedan en Guía → Primeros pasos)"
      title="Cerrar"
      className="grid size-9 place-items-center rounded-md text-muted hover:bg-canvas hover:text-ink"
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}
