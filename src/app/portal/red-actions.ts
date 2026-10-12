"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { answerOrgContact, SeekerError, setOrgSeeker } from "@/modules/red/seekers";

// Red Contable desde el portal (principios §15): la empresa activa «Disponible,
// busco contador» y responde contactos. La organización sale de la sesión y
// el módulo valida que quien actúa la administre.

const P = "/portal/red-contable";
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (q: Record<string, string>): never => redirect(`${P}?${new URLSearchParams(q)}`);
const list = (fd: FormData, k: string) => fd.getAll(k).map(String);

export async function orgSeekerAction(fd: FormData) {
  const me = await requireMember();
  const active = fd.get("active") === "on";
  try {
    await setOrgSeeker(me, me.organizationId, active, { kind: "empresa", industry: s(fd, "industry") || null, size: s(fd, "size") || null, province: s(fd, "province") || null, city: s(fd, "city") || null, needs: list(fd, "needs"), note: s(fd, "note") || null });
  } catch (e) {
    if (e instanceof SeekerError) go({ error: e.message });
    throw e;
  }
  revalidatePath(P);
  go({ ok: active ? "Listo: los estudios de la Red Contable ven a la empresa sin su nombre ni sus datos." : "La empresa ya no aparece en el listado." });
}

async function answer(fd: FormData, accept: boolean) {
  const me = await requireMember();
  try {
    await answerOrgContact(me, me.organizationId, s(fd, "id"), accept);
  } catch (e) {
    if (e instanceof SeekerError) go({ error: e.message });
    throw e;
  }
  revalidatePath(P);
  go({ ok: accept ? "Aceptaste: el estudio ya ve tus datos para contactarte." : "Listo, no aceptaste." });
}
export async function acceptOrgContactAction(fd: FormData) {
  return answer(fd, true);
}
export async function rejectOrgContactAction(fd: FormData) {
  return answer(fd, false);
}
