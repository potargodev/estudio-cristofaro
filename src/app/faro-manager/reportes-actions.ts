"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFaro } from "@/lib/auth";
import { MessagesError, resolveReport } from "@/modules/messages/server";

/** Revisar un mensaje reportado: dejarlo o borrarlo (queda en la auditoría) */
export async function resolveReportAction(fd: FormData) {
  const faro = await requireFaro();
  try {
    await resolveReport({ id: faro.id, email: faro.email }, String(fd.get("report") ?? ""), fd.get("accion") === "borrar" ? "borrar" : "sin_accion");
  } catch (e) {
    if (e instanceof MessagesError) redirect(`/faro-manager/reportes?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/faro-manager/reportes");
  redirect("/faro-manager/reportes?ok=Reporte%20revisado");
}
