"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/auth";
import { IndustryError, revokeStudioValidation, validateForStudio } from "@/modules/industries/server";

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

/** El dueño o un contador marca la plantilla vigente como validada por el estudio (auditado) */
export async function validateTemplateForStudioAction(fd: FormData) {
  const me = await requireTenant("studio", ["dueno", "contador"]);
  const back = s(fd, "back").startsWith("/admin/") ? s(fd, "back") : "/admin/rubros";
  try {
    if (s(fd, "undo") === "1") await revokeStudioValidation(me.studioId, me, s(fd, "key"));
    else await validateForStudio(me.studioId, me, s(fd, "key"), s(fd, "note"));
  } catch (e) {
    if (e instanceof IndustryError) redirect(`/admin/rubros?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/admin", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}ok=${s(fd, "undo") === "1" ? "Validaci%C3%B3n%20quitada" : "Plantilla%20validada%20por%20el%20estudio"}`);
}
