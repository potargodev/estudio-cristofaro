import { desc, eq } from "drizzle-orm";
import { BadgeCheck, Eye, MessageSquareQuote, Network } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Panel } from "@/components/admin/kit/Panel";
import { StatusBadge, Tag } from "@/components/admin/kit/StatusBadge";
import { SubmitButton } from "@/components/admin/ui";
import { getDb } from "@/db";
import { directory_reviews, organizations, studios } from "@/db/schema";
import { requireTenant, TENANT_OWNERS } from "@/lib/auth";
import { requireModule } from "@/lib/faro/require-module";
import { FILE_TEMPLATES } from "@/modules/industries/catalog";
import { LICENSE_STATUS_LABEL, MODALITIES, PROVINCES, RED_SERVICES, TEAM_SIZES } from "@/modules/red/catalog";
import { getProfile, visibilityIssue } from "@/modules/red/server";
import { publishRedAction, respondReviewAction, saveRedProfileAction } from "../../red-actions";

export const metadata: Metadata = { title: "Red de estudios" };

const field = "mt-1.5 h-10 w-full rounded-md border border-line bg-surface px-3 text-[14px] text-ink focus:border-navy focus:outline-none";
const label = "text-[13px] font-medium text-muted";
const day = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });

const LICENSE_TONE = { sin_cargar: "pendiente", pendiente: "en_proceso", verificada: "activa", rechazada: "vencido" } as const;

/** La ficha del estudio en la Red: opt-in, matrícula verificada y reseñas con respuesta pública */
export default async function RedAdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireTenant("studio", ["dueno", "contador"]);
  await requireModule(me.studioId, "red_estudios");
  const owner = TENANT_OWNERS.includes(me.role);
  const db = getDb();
  const [p, [studio], reviews] = await Promise.all([
    getProfile(me.studioId),
    db.select({ name: studios.name, slug: studios.slug, industries: studios.industries }).from(studios).where(eq(studios.id, me.studioId)),
    db
      .select({ r: directory_reviews, org: organizations.name })
      .from(directory_reviews)
      .innerJoin(organizations, eq(organizations.id, directory_reviews.organization_id))
      .where(eq(directory_reviews.studio_id, me.studioId))
      .orderBy(desc(directory_reviews.created_at)),
  ]);
  const issue = await visibilityIssue(me.studioId, p);
  const industries = p?.industries ?? studio?.industries ?? [];
  return (
    <div className="max-w-5xl">
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      <PageHeader title="Red de estudios" description="Tu ficha en el directorio neutral de Faro. Aparecer es opcional; el orden sale solo de criterios objetivos (reseñas, tiempo de respuesta, cupo y coincidencia con lo que se busca), nunca de un pago." />
      <div className="grid gap-6 [&>*]:min-w-0">
        <Panel
          title="Estado de la ficha"
          icon={Network}
          action={issue ? <StatusBadge status="pendiente" label="No visible" /> : <StatusBadge status="activa" label="Visible en la Red" />}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 text-[14px]">
            <p className="max-w-xl text-muted">{issue ?? "Tu ficha aparece en la Red. Los pedidos de propuesta llegan a Consultas."}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/admin/red/flotas" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[13px] hover:border-muted">
                Pedidos de Flotas
              </Link>
              {!issue && studio && (
                <Link href={`/red/${studio.slug}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[13px] hover:border-muted">
                  <Eye className="size-4" aria-hidden /> Ver ficha pública
                </Link>
              )}
              {owner && p && (
                <form action={publishRedAction}>
                  <input type="hidden" name="on" value={p.published ? "0" : "1"} />
                  <SubmitButton pendingText="…">{p.published ? "Sacar de la Red" : "Publicar en la Red"}</SubmitButton>
                </form>
              )}
            </div>
          </div>
        </Panel>

        <form action={saveRedProfileAction} className="grid gap-6">
          <Panel title="Matrícula" icon={BadgeCheck} action={<StatusBadge status={LICENSE_TONE[p?.license_status ?? "sin_cargar"]} label={LICENSE_STATUS_LABEL[p?.license_status ?? "sin_cargar"]} />}>
            <p className="text-[14px] text-muted">Faro la verifica a mano antes de publicar la ficha. Si cambiás estos datos, se vuelve a verificar.</p>
            {p?.license_status === "rechazada" && p.license_note && <p className="mt-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[14px] text-danger">Motivo: {p.license_note}</p>}
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className={label}>
                Consejo profesional
                <input name="license_body" defaultValue={p?.license_body ?? ""} disabled={!owner} placeholder="CPCE de Santa Fe" maxLength={120} className={field} />
              </label>
              <label className={label}>
                Número de matrícula
                <input name="license_number" defaultValue={p?.license_number ?? ""} disabled={!owner} maxLength={40} className={field} />
              </label>
              <label className={label}>
                Titular de la matrícula
                <input name="license_holder" defaultValue={p?.license_holder ?? ""} disabled={!owner} maxLength={120} className={field} />
              </label>
            </div>
          </Panel>

          <Panel title="Ficha pública">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={`${label} sm:col-span-2`}>
                Bajada (una línea)
                <input name="headline" defaultValue={p?.headline ?? ""} disabled={!owner} maxLength={120} placeholder="Contadores para pymes y autónomos de Rosario" className={field} />
              </label>
              <label className={`${label} sm:col-span-2`}>
                Cómo trabajan
                <textarea name="description" defaultValue={p?.description ?? ""} disabled={!owner} rows={4} maxLength={2000} className={`${field} h-auto py-2`} />
              </label>
              <label className={label}>
                Provincia
                <select name="province" defaultValue={p?.province ?? ""} disabled={!owner} className={field}>
                  <option value="">Elegí</option>
                  {PROVINCES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Localidad o barrio
                <input name="city" defaultValue={p?.city ?? ""} disabled={!owner} maxLength={80} className={field} />
              </label>
              <label className={label}>
                Modalidad
                <select name="modality" defaultValue={p?.modality ?? "ambas"} disabled={!owner} className={field}>
                  {MODALITIES.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Tamaño
                <select name="team_size" defaultValue={p?.team_size ?? ""} disabled={!owner} className={field}>
                  <option value="">Elegí</option>
                  {TEAM_SIZES.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Honorarios orientativos
                <input name="fee_range" defaultValue={p?.fee_range ?? ""} disabled={!owner} maxLength={80} placeholder="Desde $ 60.000 / mes" className={field} />
              </label>
              <label className={label}>
                Idiomas (separados por coma)
                <input name="languages" defaultValue={(p?.languages ?? ["español"]).join(", ")} disabled={!owner} maxLength={120} className={field} />
              </label>
              <label className={label}>
                Mail para pedidos de propuesta (opcional)
                <input name="contact_email" type="email" defaultValue={p?.contact_email ?? ""} disabled={!owner} className={field} />
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-[14px]">
                <input type="checkbox" name="accepting" defaultChecked={p?.accepting_clients ?? true} disabled={!owner} className="size-4 accent-navy" /> Tomamos clientes nuevos
              </label>
            </div>
            <fieldset className="mt-5">
              <legend className="text-[14px] font-semibold">Servicios</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {RED_SERVICES.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-[14px]">
                    <input type="checkbox" name="services" value={s.key} defaultChecked={p?.services.includes(s.key)} disabled={!owner} className="size-4 accent-navy" /> {s.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="mt-5">
              <legend className="text-[14px] font-semibold">Rubros en los que se especializan</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {FILE_TEMPLATES.map((t) => (
                  <label key={t.clave} className="flex items-center gap-2 text-[14px]">
                    <input type="checkbox" name="industries" value={t.clave} defaultChecked={industries.includes(t.clave)} disabled={!owner} className="size-4 accent-navy" /> {t.nombre}
                  </label>
                ))}
              </div>
            </fieldset>
          </Panel>
          {owner && (
            <div>
              <SubmitButton pendingText="Guardando…">Guardar la ficha</SubmitButton>
            </div>
          )}
        </form>

        <Panel title="Reseñas" icon={MessageSquareQuote} bodyClassName="p-0">
          {reviews.length === 0 ? (
            <p className="px-5 py-4 text-[14px] text-muted">Todavía no hay reseñas. Las dejan tus clientes desde su portal, después de 30 días trabajando con el estudio en Faro.</p>
          ) : (
            <ul className="divide-y divide-line">
              {reviews.map(({ r, org }) => (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                    <span className="text-[15px] text-ink" aria-label={`${r.rating} de 5`}>
                      {"★".repeat(r.rating)}
                      <span className="text-line">{"★".repeat(5 - r.rating)}</span>
                    </span>
                    <span>
                      {org} · {day.format(r.created_at)}
                    </span>
                    <Tag>{r.status === "publicada" ? "Publicada" : r.status === "pendiente" ? "En moderación" : "Rechazada por Faro"}</Tag>
                  </div>
                  <p className="mt-1.5 text-[14px] text-ink">{r.body}</p>
                  {r.status === "publicada" && (
                    <form action={respondReviewAction} className="mt-3 grid gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <label className="text-[13px] text-muted">
                        Respuesta pública del estudio
                        <textarea name="response" defaultValue={r.response ?? ""} rows={2} maxLength={1500} className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-[14px]" />
                      </label>
                      <div>
                        <SubmitButton pendingText="Guardando…">{r.response ? "Actualizar respuesta" : "Responder"}</SubmitButton>
                      </div>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
