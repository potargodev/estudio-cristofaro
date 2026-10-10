"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { directory_profiles, directory_reviews } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireFaro } from "@/lib/auth";

// Faro Manager · Red de estudios: verificación manual de matrículas y
// moderación de reseñas. Todo queda en la auditoría del estudio afectado.

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const back = (q: string): never => redirect(`/faro-manager/red?${q}`);
const UUID = /^[0-9a-f-]{36}$/i;

export async function reviewLicenseAction(fd: FormData) {
  const faro = await requireFaro();
  const id = s(fd, "studio");
  const decision = s(fd, "decision");
  if (!UUID.test(id) || !["verificada", "rechazada"].includes(decision)) back("error=Dato%20inválido");
  const note = s(fd, "note").slice(0, 500) || null;
  if (decision === "rechazada" && !note) back(`error=${encodeURIComponent("Para rechazar, contá el motivo: el estudio lo ve.")}`);
  const [p] = await getDb()
    .update(directory_profiles)
    .set({ license_status: decision as "verificada" | "rechazada", license_note: note, license_reviewed_by: faro.id, license_reviewed_at: new Date() })
    .where(eq(directory_profiles.studio_id, id))
    .returning({ number: directory_profiles.license_number, body: directory_profiles.license_body });
  if (!p) back("error=Ficha%20inexistente");
  await audit({ studioId: id, actor: faro, action: decision === "verificada" ? "red.matricula_verificar" : "red.matricula_rechazar", entityType: "ficha_red", entityId: id, metadata: { matricula: p!.number, consejo: p!.body, nota: note } });
  revalidatePath("/faro-manager/red");
  back(`ok=${decision === "verificada" ? "Matrícula%20verificada" : "Matrícula%20rechazada"}`);
}

export async function moderateReviewAction(fd: FormData) {
  const faro = await requireFaro();
  const id = s(fd, "id");
  const decision = s(fd, "decision");
  if (!UUID.test(id) || !["publicada", "rechazada"].includes(decision)) back("error=Dato%20inválido");
  const note = s(fd, "note").slice(0, 500) || null;
  const [r] = await getDb()
    .update(directory_reviews)
    .set({ status: decision as "publicada" | "rechazada", moderation_note: note, moderated_by: faro.id, moderated_at: new Date() })
    .where(eq(directory_reviews.id, id))
    .returning({ studio: directory_reviews.studio_id, org: directory_reviews.organization_id });
  if (!r) back("error=Reseña%20inexistente");
  await audit({ studioId: r!.studio, organizationId: r!.org, actor: faro, action: decision === "publicada" ? "red.resena_publicar" : "red.resena_rechazar", entityType: "resena", entityId: id, metadata: { nota: note } });
  revalidatePath("/faro-manager/red");
  back(`ok=${decision === "publicada" ? "Reseña%20publicada" : "Reseña%20rechazada"}`);
}
