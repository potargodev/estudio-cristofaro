"use server";

import { revalidatePath } from "next/cache";
import type { GuideView } from "@/modules/onboarding/catalog";
import { TOURS } from "@/modules/onboarding/catalog";
import { getGuide, setGuideDisabled, setTourSeen } from "@/modules/onboarding/server";

// Acciones del onboarding guiado. El usuario y el espacio salen de la sesión
// (onboardingContext): el navegador solo dice qué tour terminó o si apaga la guía.

export async function loadGuideAction(): Promise<GuideView | null> {
  return getGuide();
}

export async function markTourSeenAction(tourId: string) {
  if (typeof tourId !== "string" || !TOURS.some((t) => t.id === tourId)) return;
  await setTourSeen(tourId);
}

export async function setGuideDisabledAction(disabled: boolean) {
  await setGuideDisabled(disabled === true);
}

/** Formulario del perfil: prende o apaga la guía y, al prenderla, vuelve a mostrar los tours */
export async function guidePreferenceAction(fd: FormData) {
  const on = fd.get("guia") === "on";
  await setGuideDisabled(!on, on && fd.get("reiniciar") === "on");
  revalidatePath("/", "layout");
}
