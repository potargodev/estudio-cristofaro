import { desc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { getDb } from "@/db";
import { directory_profiles, directory_reviews, organizations, studios } from "@/db/schema";
import { requireFaro } from "@/lib/auth";
import { LICENSE_STATUS_LABEL } from "@/modules/red/catalog";
import { moderateReviewAction, reviewLicenseAction } from "../red-actions";

export const metadata: Metadata = { title: "Red de estudios" };

const day = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });
const input = "h-9 w-full rounded-md border border-line bg-surface px-2 text-[14px]";

/** Matrículas por verificar, reseñas por moderar y fichas de la Red */
export default async function FaroRedPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireFaro();
  const db = getDb();
  const [profiles, pending] = await Promise.all([
    db
      .select({ p: directory_profiles, name: studios.name, slug: studios.slug })
      .from(directory_profiles)
      .innerJoin(studios, eq(studios.id, directory_profiles.studio_id))
      .orderBy(desc(directory_profiles.updated_at)),
    db
      .select({ r: directory_reviews, studio: studios.name, org: organizations.name })
      .from(directory_reviews)
      .innerJoin(studios, eq(studios.id, directory_reviews.studio_id))
      .innerJoin(organizations, eq(organizations.id, directory_reviews.organization_id))
      .where(inArray(directory_reviews.status, ["pendiente"]))
      .orderBy(directory_reviews.created_at),
  ]);
  const licenses = profiles.filter((x) => x.p.license_status === "pendiente");
  return (
    <>
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      <PageHeader title="Red de estudios" description="Verificación manual de matrículas antes de publicar y moderación de reseñas. El orden del directorio no se toca desde acá: es neutral." />

      <section aria-labelledby="matriculas" className="mb-8">
        <h2 id="matriculas" className="text-[17px] font-semibold">
          Matrículas por verificar ({licenses.length})
        </h2>
        {licenses.length === 0 ? (
          <p className="mt-2 text-[14px] text-muted">No hay matrículas pendientes.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {licenses.map(({ p, name }) => (
              <li key={p.studio_id} className="rounded-lg border border-line bg-surface p-4">
                <p className="text-[15px] font-medium">{name}</p>
                <p className="text-[14px] text-muted">
                  {p.license_holder} · Matrícula {p.license_number} · {p.license_body}
                </p>
                <p className="mt-1 text-[12px] text-muted">Verificala en el padrón del consejo profesional antes de aprobar.</p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <form action={reviewLicenseAction}>
                    <input type="hidden" name="studio" value={p.studio_id} />
                    <input type="hidden" name="decision" value="verificada" />
                    <SubmitButton pendingText="…">Verificada</SubmitButton>
                  </form>
                  <form action={reviewLicenseAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="studio" value={p.studio_id} />
                    <input type="hidden" name="decision" value="rechazada" />
                    <label className="grid gap-1 text-[12px] text-muted">
                      Motivo del rechazo
                      <input name="note" maxLength={500} className={`${input} w-64`} />
                    </label>
                    <button type="submit" className="h-9 rounded-md border border-line px-3 text-[14px] hover:border-muted">
                      Rechazar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="resenas" className="mb-8">
        <h2 id="resenas" className="text-[17px] font-semibold">
          Reseñas por moderar ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-[14px] text-muted">No hay reseñas pendientes.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {pending.map(({ r, studio, org }) => (
              <li key={r.id} className="rounded-lg border border-line bg-surface p-4">
                <p className="text-[13px] text-muted">
                  {studio} · de {org} · {day.format(r.created_at)} · <span className="text-ink">{"★".repeat(r.rating)}</span>
                </p>
                <p className="mt-1 text-[14px]">{r.body}</p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <form action={moderateReviewAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="publicada" />
                    <SubmitButton pendingText="…">Publicar</SubmitButton>
                  </form>
                  <form action={moderateReviewAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="rechazada" />
                    <label className="grid gap-1 text-[12px] text-muted">
                      Motivo (interno)
                      <input name="note" maxLength={500} className={`${input} w-64`} />
                    </label>
                    <button type="submit" className="h-9 rounded-md border border-line px-3 text-[14px] hover:border-muted">
                      Rechazar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="fichas">
        <h2 id="fichas" className="text-[17px] font-semibold">
          Fichas ({profiles.length})
        </h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <thead className="border-b border-line text-[12px] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Estudio</th>
                <th className="px-4 py-3 font-medium">Matrícula</th>
                <th className="px-4 py-3 font-medium">Publicada</th>
                <th className="px-4 py-3 font-medium">Zona</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {profiles.map(({ p, name, slug }) => (
                <tr key={p.studio_id}>
                  <td className="px-4 py-2.5">
                    <Link href={`/faro-manager/${p.studio_id}`} className="font-medium hover:underline">
                      {name}
                    </Link>
                    {p.published && p.license_status === "verificada" && (
                      <Link href={`/red/${slug}`} className="ml-2 text-[12px] text-muted underline">
                        ver
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{LICENSE_STATUS_LABEL[p.license_status]}</td>
                  <td className="px-4 py-2.5">{p.published ? "Sí" : "No"}</td>
                  <td className="px-4 py-2.5 text-muted">{[p.city, p.province].filter(Boolean).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
