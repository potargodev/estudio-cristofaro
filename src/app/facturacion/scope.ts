import "server-only";
import { redirect } from "next/navigation";
import { requirePersonal } from "@/lib/auth";
import { ArcaError, personalIssuer } from "@/modules/arca/server";

/** Emisor de la cuenta personal de la sesión (o vuelve al inicio con el motivo) */
export async function personalScope() {
  const me = await requirePersonal();
  try {
    return { me, scope: await personalIssuer(me) };
  } catch (e) {
    if (e instanceof ArcaError) redirect(`/personal?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
}
