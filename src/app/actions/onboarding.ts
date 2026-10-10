"use server";

import { revalidatePath } from "next/cache";
import type { GuideView } from "@/modules/onboarding/catalog";
import { TOURS } from "@/modules/onboarding/catalog";
import { getGuide, setGuideDisabled, setTourSeen } from "@/modules/onboarding/server";

// Acciones del onboarding guiado. El usuario y el espacio salen de la sesión
// (onboardingContext): el navegador solo dice qué tour terminó o si apaga la guía.

// La ruta solo elige entre los espacios del propio usuario (una Flota de la que es integrante); se valida en onboardingContext
const safePath = (p: unknown) => (typeof p === "string" && /^\/[a-z0-9/_-]{0,120}$/i.test(p) ? p : null);

export async function loadGuideAction(path?: string): Promise<GuideView | null> {
  return getGuide(undefined, safePath(path));
}

export async function markTourSeenAction(tourId: string, path?: string) {
  if (typeof tourId !== "string" || !TOURS.some((t) => t.id === tourId)) return;
  await setTourSeen(tourId, safePath(path));
}

export async function setGuideDisabledAction(disabled: boolean, path?: string) {
  await setGuideDisabled(disabled === true, false, safePath(path));
}

/** Formulario del perfil: prende o apaga la guía y, al prenderla, vuelve a mostrar los tours */
export async function guidePreferenceAction(fd: FormData) {
  const on = fd.get("guia") === "on";
  await setGuideDisabled(!on, on && fd.get("reiniciar") === "on");
  revalidatePath("/", "layout");
}
