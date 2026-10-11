"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { chargeLink, getCharge } from "@/modules/billing/fees";
import { BillingError } from "@/modules/billing/mp";

/** Pagar un cargo desde el portal: solo de la organización activa de quien tiene finanzas.ver */
export async function portalPayAction(fd: FormData) {
  const me = await requireMember("finanzas.ver");
  const c = await getCharge(me.studioId, String(fd.get("id") ?? ""));
  if (!c || c.organization_id !== me.organizationId) redirect("/portal/estado-de-cuenta?error=" + encodeURIComponent("No encontramos ese cobro."));
  let url: string;
  try {
    url = await chargeLink(me.studioId, c.id, me);
  } catch (e) {
    if (e instanceof BillingError) redirect("/portal/estado-de-cuenta?error=" + encodeURIComponent(e.message));
    throw e;
  }
  redirect(url);
}
