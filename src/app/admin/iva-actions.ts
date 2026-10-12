"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { studioOrganization } from "@/lib/organizations";
import { IvaError, markRow } from "@/modules/iva/server";

// Análisis del Libro IVA: marcar un comprobante «a revisar» (con nota),
// resolverlo o quitar la marca. La organización se valida contra el estudio.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function ivaMarkAction(fd: FormData) {
  const me = await requireStaff();
  const org = await studioOrganization(s(fd, "org"), me.studioId);
  if (!org) notFound();
  const period = s(fd, "periodo");
  const book = s(fd, "libro") === "ventas" ? "ventas" : "compras";
  const back = `/admin/organizaciones/${org.id}?${new URLSearchParams({ tab: "iva", periodo: period, libro: book, ...(s(fd, "filtro") ? { filtro: s(fd, "filtro") } : {}) })}`;
  const state = s(fd, "estado");
  try {
    await markRow({ studioId: me.studioId, organizationId: org.id }, me, { period, book, rowId: s(fd, "row"), note: s(fd, "nota") || null, state: state === "resuelta" ? "resuelta" : state === "quitar" ? "quitar" : "a_revisar" });
  } catch (e) {
    if (e instanceof IvaError) redirect(`${back}&error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath(`/admin/organizaciones/${org.id}`);
  redirect(`${back}&ok=${encodeURIComponent(state === "resuelta" ? "Marcado como resuelto." : state === "quitar" ? "Marca quitada." : "Marcado a revisar.")}#libro`);
}
