"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { contactSeeker, SeekerError } from "@/modules/red/seekers";

const PATH = "/admin/comercial/buscar-clientes";

/** Contactar a alguien del listado anónimo: le llega sin que el estudio sepa quién es */
export async function contactSeekerAction(fd: FormData) {
  const me = await requireStaff();
  try {
    await contactSeeker(me, String(fd.get("id") ?? ""), String(fd.get("message") ?? ""));
  } catch (e) {
    if (e instanceof SeekerError) redirect(`${PATH}?${new URLSearchParams({ error: e.message })}`);
    throw e;
  }
  revalidatePath(PATH);
  redirect(`${PATH}?${new URLSearchParams({ ok: "Contacto enviado. Si acepta, ves sus datos y empieza la admisión." })}`);
}
