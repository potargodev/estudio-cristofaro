import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/admin/ui";
import { PageTitle } from "@/components/portal/ui";
import { getDb } from "@/db";
import { studios } from "@/db/schema";
import { requireMember } from "@/lib/auth";
import { getProfile, reviewEligibility, visibilityIssue } from "@/modules/red/server";
import { submitReviewAction } from "../../review-actions";

export const metadata: Metadata = { title: "Reseñar al estudio" };

/** Reseña de la organización a su estudio (Red de estudios). Todo sale de la sesión */
export default async function ResenaPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireMember();
  const [[st], p] = await Promise.all([getDb().select({ name: studios.name, slug: studios.slug }).from(studios).where(eq(studios.id, me.studioId)), getProfile(me.studioId)]);
  const inRed = !(await visibilityIssue(me.studioId, p));
  const e = await reviewEligibility(me, me.organizationId, me.orgRole);
  return (
    <>
      <PageTitle title={`Reseñá a ${st?.name ?? "tu estudio"}`} intro="Tu opinión ayuda a otras personas a elegir. Se publica con tu nombre de pila y la marca «cliente verificado», después de la moderación de Faro." />
      {sp.ok && (
        <p role="status" className="mb-4 rounded-md border border-line bg-navy-soft px-4 py-3 text-[15px]">
          ¡Gracias! Tu reseña queda en moderación y en unos días se publica.
        </p>
      )}
      {sp.error && (
        <p role="alert" className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-[15px] text-danger">
          {sp.error}
        </p>
      )}
      {!inRed ? (
        <p className="text-[15px] text-muted">Tu estudio todavía no está en la Red de estudios de Faro, así que por ahora no se pueden dejar reseñas.</p>
      ) : !e.ok ? (
        <div className="rounded-lg border border-line bg-surface p-5 text-[15px]">
          <p>{e.reason}</p>
          {"review" in e && e.review && (
            <p className="mt-2 text-[14px] text-muted">
              Estado: {e.review.status === "publicada" ? "publicada" : e.review.status === "pendiente" ? "en moderación" : "no publicada"}.{" "}
              {e.review.status === "publicada" && st && (
                <Link href={`/red/${st.slug}`} className="underline underline-offset-4">
                  Verla en la Red
                </Link>
              )}
            </p>
          )}
        </div>
      ) : (
        <form action={submitReviewAction} className="grid max-w-xl gap-4 rounded-lg border border-line bg-surface p-5">
          <fieldset>
            <legend className="text-[15px] font-semibold">¿Cómo calificás al estudio?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[5, 4, 3, 2, 1].map((n) => (
                <label key={n} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-3 py-2 text-[14px] has-[:checked]:border-navy has-[:checked]:bg-navy-soft">
                  <input type="radio" name="rating" value={n} required className="size-4 accent-navy" /> {"★".repeat(n)}
                  <span className="sr-only">{n} de 5</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-[14px] text-muted">
            Contá tu experiencia
            <textarea name="body" required minLength={20} maxLength={2000} rows={5} className="mt-1.5 w-full rounded-md border border-line bg-canvas px-3 py-2 text-[15px] text-ink" />
          </label>
          <p className="text-[13px] text-muted">
            Una reseña por organización. El estudio puede responderla públicamente.{" "}
            <Link href="/ayuda/red-de-estudios/resenas" className="underline underline-offset-4">
              Reglas de las reseñas
            </Link>
          </p>
          <div>
            <SubmitButton pendingText="Enviando…">Enviar reseña</SubmitButton>
          </div>
        </form>
      )}
    </>
  );
}
