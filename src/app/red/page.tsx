import { BadgeCheck, Clock, MapPin, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FILE_TEMPLATES, INDUSTRY_NAMES } from "@/modules/industries/catalog";
import { markStep } from "@/modules/onboarding/server";
import { labelOf, MODALITIES, RED_SERVICES, responseLabel, TEAM_SIZES } from "@/modules/red/catalog";
import { publicDirectory } from "@/modules/red/server";

export const metadata: Metadata = { title: "Red de estudios", description: "Directorio neutral de estudios contables que usan Faro: matrícula verificada, reseñas de clientes reales y orden sin posiciones pagas." };
export const dynamic = "force-dynamic";

const field = "mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-[14px] text-ink focus:border-navy focus:outline-none";

export default async function RedPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const pick = (k: string, allowed: string[]) => (sp[k] && allowed.includes(sp[k]!) ? sp[k] : undefined);
  const filters = {
    zona: sp.zona?.slice(0, 60) || undefined,
    rubro: pick("rubro", Object.keys(INDUSTRY_NAMES)),
    servicio: pick("servicio", RED_SERVICES.map((s) => s.key)),
    modalidad: pick("modalidad", MODALITIES.map((m) => m.key)),
    tamano: pick("tamano", TEAM_SIZES.map((t) => t.key)),
  };
  const [list] = await Promise.all([publicDirectory(filters), markStep("red").catch(() => undefined)]);
  return (
    <>
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-rose-deep">Red de estudios</p>
      <h1 className="mt-2 font-display text-[40px] leading-tight sm:text-[56px]">Encontrá tu estudio contable.</h1>
      <p className="mt-2 max-w-2xl text-[16px] text-muted">Estudios y contadores que trabajan con Faro, con la matrícula verificada y reseñas de clientes reales. Nadie paga por aparecer primero.</p>

      <form method="get" className="mt-8 grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6" role="search" aria-label="Filtrar estudios">
        <label className="text-[13px] text-muted lg:col-span-2">
          Zona (localidad, barrio o provincia)
          <input name="zona" defaultValue={filters.zona ?? ""} placeholder="Ej.: Rosario" className={field} />
        </label>
        <label className="text-[13px] text-muted">
          Rubro
          <select name="rubro" defaultValue={filters.rubro ?? ""} className={field}>
            <option value="">Todos</option>
            {FILE_TEMPLATES.map((t) => (
              <option key={t.clave} value={t.clave}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[13px] text-muted">
          Servicio
          <select name="servicio" defaultValue={filters.servicio ?? ""} className={field}>
            <option value="">Todos</option>
            {RED_SERVICES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[13px] text-muted">
          Modalidad
          <select name="modalidad" defaultValue={filters.modalidad ?? ""} className={field}>
            <option value="">Cualquiera</option>
            <option value="presencial">Presencial</option>
            <option value="remoto">Remoto</option>
          </select>
        </label>
        <label className="text-[13px] text-muted">
          Tamaño
          <select name="tamano" defaultValue={filters.tamano ?? ""} className={field}>
            <option value="">Cualquiera</option>
            {TEAM_SIZES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
          <button type="submit" className="h-10 rounded-md bg-navy px-5 text-[14px] font-medium text-paper hover:bg-night">
            Buscar
          </button>
          <Link href="/red" className="h-10 px-3 text-[14px] leading-10 text-muted underline-offset-4 hover:underline">
            Limpiar
          </Link>
        </div>
      </form>

      <p className="mt-6 text-[14px] text-muted">
        {list.length === 0 ? "No encontramos estudios con esos filtros." : `${list.length} ${list.length === 1 ? "estudio" : "estudios"}`} · Ordenados por reseñas, tiempo de respuesta medido en Faro, cupo y coincidencia con tu búsqueda.{" "}
        <Link href="/ayuda/red-de-estudios/resenas" className="underline underline-offset-4">
          Cómo ordenamos
        </Link>
      </p>
      <ul className="mt-4 grid gap-4 md:grid-cols-2">
        {list.map((x) => (
          <li key={x.studioId}>
            <Link href={`/red/${x.slug}`} className="block h-full rounded-lg border border-line bg-surface p-5 transition-colors hover:border-navy">
              <div className="flex items-start gap-3">
                <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-md bg-navy font-display text-[22px] text-gold">
                  {x.name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <h2 className="text-[18px] font-semibold text-ink">{x.name}</h2>
                  <p className="text-[14px] text-muted">{x.profile.headline}</p>
                </div>
              </div>
              <ul className="mt-4 grid gap-1.5 text-[13px] text-ink">
                <li className="flex items-center gap-1.5">
                  <BadgeCheck className="size-4 text-rose-deep" aria-hidden /> Matrícula verificada · {x.profile.license_body}
                </li>
                <li className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-muted" aria-hidden /> {[x.profile.city, x.profile.province].filter(Boolean).join(", ")} · {labelOf(MODALITIES, x.profile.modality)}
                </li>
                <li className="flex items-center gap-1.5">
                  <Star className="size-4 text-muted" aria-hidden /> {x.rating ? `${x.rating.avg.toFixed(1)} de 5 · ${x.rating.n} ${x.rating.n === 1 ? "reseña" : "reseñas"}` : "Sin reseñas todavía"}
                </li>
                <li className="flex items-center gap-1.5">
                  <Clock className="size-4 text-muted" aria-hidden /> {responseLabel(x.responseHours)}
                </li>
              </ul>
              <p className="mt-3 flex flex-wrap gap-1.5">
                {x.profile.services.slice(0, 4).map((s) => (
                  <span key={s} className="rounded border border-line px-2 py-0.5 text-[12px] text-muted">
                    {labelOf(RED_SERVICES, s)}
                  </span>
                ))}
                {!x.profile.accepting_clients && <span className="rounded border border-line bg-canvas px-2 py-0.5 text-[12px] text-muted">Sin cupo por ahora</span>}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <section className="mt-12 rounded-lg border border-line bg-surface p-5 text-[14px] text-muted">
        <h2 className="text-[16px] font-semibold text-ink">¿Sos de un estudio?</h2>
        <p className="mt-1">
          Sumarte a la Red es opcional y está incluido en los planes Profesional y Avanzado. Verificamos la matrícula antes de publicar.{" "}
          <Link href="/ayuda/red-de-estudios/perfil-del-estudio" className="underline underline-offset-4">
            Cómo sumarte
          </Link>
        </p>
      </section>
    </>
  );
}
