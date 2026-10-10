"use server";

import { and, eq, gt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { leads, studios } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requirePersonal } from "@/lib/auth";
import { SITE_STUDIO_SLUG } from "@/lib/faro/tenants";
import { esc, sendMail } from "@/lib/email";
import { mailLayout } from "@/lib/notify";
import { getSiteUrl } from "@/lib/runtime-config";
import { site } from "@/lib/site";

// Acciones del panel del autónomo (Faro Personal).

/**
 * "Necesito un contador": deja una consulta en Estudio Cristofaro (el primer
 * estudio de Faro). No comparte datos del autónomo más allá de nombre, email,
 * CUIT y lo que escriba: compartir sus números necesita su consentimiento aparte.
 */
export async function requestAccountant(fd: FormData) {
  const me = await requirePersonal();
  const message = String(fd.get("message") ?? "").trim().slice(0, 1500);
  const db = getDb();
  const [[tenant], [studio]] = await Promise.all([
    db.select().from(studios).where(eq(studios.id, me.studioId)),
    db.select({ id: studios.id }).from(studios).where(eq(studios.slug, SITE_STUDIO_SLUG())),
  ]);
  if (!studio) redirect("/personal?contador=error");
  // Una consulta por día alcanza
  const [recent] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.studio_id, studio.id), eq(leads.email, me.email), gt(leads.created_at, new Date(Date.now() - 86400000))));
  if (!recent) {
    await db.insert(leads).values({
      studio_id: studio.id,
      name: me.name,
      email: me.email,
      company: tenant?.name ?? null,
      contributor_type: "monotributista",
      source: "otro",
      needs: ["Faro Personal"],
      message: `Desde Faro Personal (CUIT ${tenant?.cuit ?? "—"}): ${message || "Quiero que un contador me acompañe."}`,
    });
    await sendMail({
      to: process.env.STUDIO_NOTIFY_EMAIL || site.email,
      subject: `Faro Personal: ${me.name} busca contador`,
      html: mailLayout("Consulta desde Faro Personal", `<p><strong>${esc(me.name)}</strong> (${esc(me.email)}) pidió que un contador lo acompañe.</p>`, { href: `${getSiteUrl()}/admin/consultas`, label: "Ver la consulta" }),
    });
  }
  await audit({ studioId: me.studioId, actor: me, action: "personal.pedir_contador", metadata: { estudio: SITE_STUDIO_SLUG() } });
  revalidatePath("/personal");
  redirect("/personal?contador=1");
}
