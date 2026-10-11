import "server-only";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { ArcaError, orgIssuer } from "@/modules/arca/server";

/** Emisor: organización del estudio de la sesión (si no es suya, 404) */
export async function orgScope(id: string, cuit?: string | null) {
  const me = await requireStaff();
  try {
    return await orgIssuer(me, id, cuit ?? null);
  } catch (e) {
    if (e instanceof ArcaError) notFound();
    throw e;
  }
}
