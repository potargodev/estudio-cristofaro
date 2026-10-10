"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireMember } from "@/lib/auth";
import { recordAcceptance } from "@/modules/legal/server";
import { RedError, submitReview } from "@/modules/red/server";

/** Reseña de la organización activa a su estudio: estudio, organización y rol salen de la sesión */
export async function submitReviewAction(fd: FormData) {
  const me = await requireMember();
  let id: string;
  try {
    id = await submitReview(me, me.organizationId, me.orgRole, Number(fd.get("rating")), String(fd.get("body") ?? ""));
  } catch (e) {
    if (e instanceof RedError) redirect(`/portal/resena?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  await audit({ studioId: me.studioId, organizationId: me.organizationId, actor: me, action: "red.resena", entityType: "resena", entityId: id });
  await recordAcceptance(me, ["red-de-estudios"]);
  redirect("/portal/resena?ok=1");
}
