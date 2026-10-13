"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { internalPath } from "@/lib/paths";
import { isShareType, revokeLink, sendByWhatsApp, ShareError } from "@/modules/share/server";

// Compartir documentos por WhatsApp (A4): cualquier persona con sesión que
// pueda ver el documento; el servidor valida cada ID contra su estudio y sus
// permisos. Vuelve a la pantalla de origen con el resultado del lote.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function back(fd: FormData, q: Record<string, string>): never {
  const path = internalPath(s(fd, "back"), "/");
  const [p, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  for (const k of ["ok", "error", "lote"]) params.delete(k);
  for (const [k, v] of Object.entries(q)) params.set(k, v);
  redirect(`${p}?${params}`);
}

export async function sendWhatsAppAction(fd: FormData) {
  const me = await getSessionUser();
  if (!me) redirect("/ingresar");
  const type = s(fd, "type");
  if (!isShareType(type)) back(fd, { error: "Tipo de documento inválido." });
  let r: Awaited<ReturnType<typeof sendByWhatsApp>>;
  try {
    r = await sendByWhatsApp(me, { type, ids: fd.getAll("id").map(String), phone: s(fd, "phone"), intro: s(fd, "intro"), days: Number(s(fd, "days")) || 7 });
  } catch (e) {
    if (e instanceof ShareError) back(fd, { error: e.message });
    throw e;
  }
  revalidatePath(internalPath(s(fd, "back"), "/").split("?")[0]);
  const n = r.items.length;
  if (r.mode === "api" && r.items.every((x) => x.status === "enviado")) back(fd, { ok: `${n === 1 ? "Enviado" : `${n} documentos enviados`} por WhatsApp. Los acuses de entrega y lectura se ven en el registro.` });
  back(fd, { lote: r.batchId });
}

export async function revokeLinkAction(fd: FormData) {
  const me = await getSessionUser();
  if (!me) redirect("/ingresar");
  try {
    await revokeLink(me, s(fd, "link"));
  } catch (e) {
    if (e instanceof ShareError) back(fd, { error: e.message });
    throw e;
  }
  back(fd, { ok: "Link desactivado: ya no abre el documento." });
}
