"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireTenant, TENANT_OWNERS } from "@/lib/auth";
import { requireModule } from "@/lib/faro/require-module";
import { recordAcceptance } from "@/modules/legal/server";
import { RedError, respondReview, saveProfile, setPublished } from "@/modules/red/server";

// Ficha del estudio en la Red de estudios. El estudio sale de la sesión; la
// edita el dueño, las respuestas a reseñas también el contador.

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const back = (q: string): never => redirect(`/admin/red?${q}`);

async function owner() {
  const me = await requireTenant("studio", TENANT_OWNERS);
  await requireModule(me.studioId, "red_estudios");
  return me;
}

export async function saveRedProfileAction(fd: FormData) {
  const me = await owner();
  const r = await saveProfile(me.studioId, {
    headline: s(fd, "headline"),
    description: s(fd, "description"),
    province: s(fd, "province"),
    city: s(fd, "city"),
    modality: s(fd, "modality"),
    services: fd.getAll("services").map(String),
    industries: fd.getAll("industries").map(String),
    languages: s(fd, "languages").split(","),
    teamSize: s(fd, "team_size"),
    feeRange: s(fd, "fee_range"),
    contactEmail: s(fd, "contact_email"),
    acceptingClients: fd.get("accepting") === "on",
    licenseBody: s(fd, "license_body"),
    licenseNumber: s(fd, "license_number"),
    licenseHolder: s(fd, "license_holder"),
  });
  await audit({ studioId: me.studioId, actor: me, action: "red.ficha", entityType: "ficha_red", entityId: me.studioId, metadata: { matricula_a_verificar: r.licenseChanged } });
  revalidatePath("/admin/red");
  back(`ok=${encodeURIComponent(r.licenseChanged ? "Ficha guardada. La matrícula queda en verificación." : "Ficha guardada.")}`);
}

export async function publishRedAction(fd: FormData) {
  const me = await owner();
  const on = s(fd, "on") === "1";
  try {
    await setPublished(me.studioId, on);
  } catch (e) {
    if (e instanceof RedError) back(`error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  await audit({ studioId: me.studioId, actor: me, action: on ? "red.publicar" : "red.despublicar", entityType: "ficha_red", entityId: me.studioId });
  if (on) await recordAcceptance(me, ["red-de-estudios"]);
  revalidatePath("/admin/red");
  back(`ok=${encodeURIComponent(on ? "Publicaste la ficha. Se ve en la Red cuando la matrícula está verificada." : "Sacaste la ficha de la Red.")}`);
}

export async function respondReviewAction(fd: FormData) {
  const me = await requireTenant("studio", ["dueno", "contador"]);
  await requireModule(me.studioId, "red_estudios");
  const id = s(fd, "id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) back("error=Reseña%20inválida");
  try {
    await respondReview(me.studioId, id, me.id, s(fd, "response"));
  } catch (e) {
    if (e instanceof RedError) back(`error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  await audit({ studioId: me.studioId, actor: me, action: "red.resena_responder", entityType: "resena", entityId: id });
  revalidatePath("/admin/red");
  back("ok=Respuesta%20guardada");
}
