import { PageHeader } from "@/components/admin/kit/PageHeader";
import { BadgeCheck, Clock, MapPin, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FILE_TEMPLATES, INDUSTRY_NAMES } from "@/modules/industries/catalog";
import { markStep } from "@/modules/onboarding/server";
import { labelOf, MODALITIES, RED_SERVICES, responseLabel, TEAM_SIZES } from "@/modules/red/catalog";
import { publicDirectory } from "@/modules/red/server";
import { getCurrentUser } from "@/lib/auth";
import { getDerivationRules, ownSuggestion } from "@/modules/escudo/server";
import { StudiosMap } from "@/components/red/StudiosMap";
import { SectionTabs } from "@/components/app/SectionTabs";
import { fieldClass } from "@/components/ds/primitives";

export const metadata: Metadata = { title: "Red Contable", description: "Directorio neutral de estudios contables que usan Faro: matrícula verificada, reseñas de clientes reales y orden sin posiciones pagas." };
export const dynamic = "force-dynamic";

const field = `mt-1 ${fieldClass}`;

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
  const mapa = sp.vista === "mapa";
  const viewHref = (v: "lista" | "mapa") => {
    const q = new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => !!e[1]));
    if (v === "mapa") q.set("vista", "mapa");
    return `/red${q.size ? `?${q}` : ""}`;
  };
  const [list, user] = await Promise.all([publicDirectory(filters), getCurrentUser().catch(() => null), markStep("red").catch(() => undefined)]);
  // Derivación (§1.c): la persona llega con el contexto armado (solo el propio, validado en el servidor)
  const derivacion = user ? await ownSuggestion(user.id, sp.derivacion) : null;
  const necesito = !derivacion && sp.necesito ? (await getDerivationRules()).find((r) => r.key === sp.necesito) : undefined;
  const q = derivacion ? `?derivacion=${derivacion.id}` : "";
  return (
    <>
      <PageHeader title="Encontrá tu estudio contable" description="Estudios y contadores que trabajan con Faro, con la matrícula verificada y reseñas de clientes reales. Nadie paga por aparecer primero." className="mb-0" />

      {(derivacion || necesito) && (
        <section aria-label="Lo que necesitás" data-contexto className="mt-6 rounded-md border border-rose/40 bg-rose-soft p-4 text-ui text-ink">
          <p className="font-medium">Lo que necesitás: {derivacion ? derivacion.context.need : necesito!.need}</p>
          {derivacion && <p className="mt-1 text-muted">Por qué: {derivacion.context.why}</p>}
          <p className="mt-2 text-meta text-muted">Elegí un estudio y pedile una propuesta: {derivacion ? "le llega este contexto armado, sin que lo tengas que explicar de nuevo." : "contale esto en el pedido."} Faro es una herramienta; el criterio y la responsabilidad profesional son del contador.</p>
        </section>
      )}

      <form method="get" className="mt-8 grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6" role="search" aria-label="Filtrar estudios">
        <label className="text-meta text-muted lg:col-span-2">
          Zona (localidad, barrio o provincia)
          <input name="zona" defaultValue={filters.zona ?? ""} placeholder="Ej.: Rosario" className={field} />
        </label>
        <label className="text-meta text-muted">
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
        <label className="text-meta text-muted">
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
        <label className="text-meta text-muted">
          Modalidad
          <select name="modalidad" defaultValue={filters.modalidad ?? ""} className={field}>
            <option value="">Cualquiera</option>
            <option value="presencial">Presencial</option>
            <option value="remoto">Remoto</option>
          </select>
        </label>
        <label className="text-meta text-muted">
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
          {mapa && <input type="hidden" name="vista" value="mapa" />}
          <button type="submit" className="h-10 rounded-md bg-navy px-5 text-ui font-medium text-paper hover:bg-night">
            Buscar
          </button>
          <Link href="/red-contable" className="h-10 px-3 text-ui leading-10 text-muted underline-offset-4 hover:underline">
            Limpiar
          </Link>
        </div>
      </form>

      <p className="mt-6 text-ui text-muted">
        {list.length === 0 ? "No encontramos estudios con esos filtros." : `${list.length} ${list.length === 1 ? "estudio" : "estudios"}`} · Ordenados por reseñas, tiempo de respuesta medido en Faro, cupo y coincidencia con tu búsqueda.{" "}
        <Link href="/ayuda/red-contable/resenas" className="underline underline-offset-4">
          Cómo ordenamos
        </Link>
      </p>
      <SectionTabs label="Cómo ver los estudios" className="mt-4" tabs={[{ href: viewHref("lista"), label: "Lista", active: !mapa }, { href: viewHref("mapa"), label: "Mapa", active: mapa }]} />
      {mapa ? (
        <div className="mt-4">
          <StudiosMap items={list.map((x) => ({ studioId: x.studioId, slug: x.slug, name: x.name, province: x.profile.province }))} />
        </div>
      ) : (
      <ul className="mt-4 grid gap-4 md:grid-cols-2">
        {list.map((x) => (
          <li key={x.studioId}>
            <Link href={`/red-contable/${x.slug}${q}`} className="block h-full rounded-lg border border-line bg-surface p-5 transition-colors hover:border-navy">
              <div className="flex items-start gap-3">
                <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-md bg-navy font-display text-headline text-gold">
                  {x.name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <h2 className="text-title font-semibold text-ink">{x.name}</h2>
                  <p className="text-ui text-muted">{x.profile.headline}</p>
                </div>
              </div>
              <ul className="mt-4 grid gap-1.5 text-meta text-ink">
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
                  <span key={s} className="rounded border border-line px-2 py-0.5 text-caption text-muted">
                    {labelOf(RED_SERVICES, s)}
                  </span>
                ))}
                {!x.profile.accepting_clients && <span className="rounded border border-line bg-canvas px-2 py-0.5 text-caption text-muted">Sin cupo por ahora</span>}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      )}
      <section className="mt-12 rounded-lg border border-line bg-surface p-5 text-ui text-muted">
        <h2 className="text-lead font-semibold text-ink">¿Sos de un estudio?</h2>
        <p className="mt-1">
          Sumarte a la Red es opcional y está incluido en los planes Profesional y Avanzado. Verificamos la matrícula antes de publicar.{" "}
          <Link href="/ayuda/red-contable/perfil-del-estudio" className="underline underline-offset-4">
            Cómo sumarte
          </Link>
        </p>
      </section>
    </>
  );
}
