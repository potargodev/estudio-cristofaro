"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { approveConsult, ConsultError, discardConsult, draftConsult } from "@/modules/ai-consults/server";

// Consultas con IA: revisar, editar y aprobar el borrador antes de enviarlo.
// La consulta se busca siempre dentro del estudio de la sesión.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (fd: FormData) => {
  const v = s(fd, "volver");
  return v.startsWith("/admin/solicitudes") ? v : "/admin/solicitudes";
};
function go(path: string, q: Record<string, string>): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`);
}
async function guard<T>(b: string, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ConsultError) go(b, { error: e.message });
    throw e;
  }
}

export async function approveConsultAction(fd: FormData) {
  const me = await requireStaff();
  await guard(back(fd), () => approveConsult({ ...me, studioId: me.studioId }, s(fd, "id"), String(fd.get("body") ?? ""), fd.get("resolve") === "on"));
  revalidatePath("/admin/solicitudes");
  revalidatePath("/portal", "layout");
  go(back(fd), { ok: "Respuesta enviada al cliente." });
}

export async function discardConsultAction(fd: FormData) {
  const me = await requireStaff();
  await guard(back(fd), () => discardConsult({ ...me, studioId: me.studioId }, s(fd, "id")));
  revalidatePath("/admin/solicitudes");
  go(back(fd), { ok: "Borrador descartado. Respondé a mano desde la conversación." });
}

export async function redraftConsultAction(fd: FormData) {
  const me = await requireStaff();
  const c = await guard(back(fd), () => draftConsult(me.studioId, s(fd, "id"), { ...me, studioId: me.studioId }));
  revalidatePath("/admin/solicitudes");
  go(back(fd), c.status === "borrador" ? { ok: "La IA preparó un borrador nuevo." } : { error: c.error ?? "No se pudo preparar el borrador." });
}
