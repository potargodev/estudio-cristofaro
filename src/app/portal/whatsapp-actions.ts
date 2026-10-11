"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { confirmVerification, removeContact, setOptIn, startVerification, WhatsAppError } from "@/modules/whatsapp/server";

// WhatsApp del cliente: cada persona verifica su propio número con un código.
// Usuario, organización y estudio salen de la sesión.

const PATH = "/portal/whatsapp";
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
function go(q: Record<string, string>): never {
  redirect(`${PATH}?${new URLSearchParams(q)}`);
}
async function member() {
  const m = await requireMember();
  return { id: m.id, email: m.email, studioId: m.studioId, organizationId: m.organizationId };
}
async function guard<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof WhatsAppError) go({ error: e.message });
    throw e;
  }
}

export async function startWaAction(fd: FormData) {
  const m = await member();
  const masked = await guard(() => startVerification(m, s(fd, "phone")));
  revalidatePath(PATH);
  go({ ok: `Te mandamos un código por WhatsApp al ${masked}.` });
}

export async function confirmWaAction(fd: FormData) {
  const m = await member();
  await guard(() => confirmVerification(m, s(fd, "code")));
  revalidatePath(PATH);
  go({ ok: "¡Listo! Tu WhatsApp quedó verificado." });
}

export async function optInWaAction(fd: FormData) {
  const m = await member();
  await setOptIn(m, s(fd, "on") === "1");
  revalidatePath(PATH);
  go({ ok: "Guardado." });
}

export async function removeWaAction() {
  const m = await member();
  await removeContact(m);
  revalidatePath(PATH);
  go({ ok: "Quitamos tu número." });
}
