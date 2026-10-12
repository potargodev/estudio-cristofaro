import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { SubmitButton } from "@/components/admin/ui";
import { contactSeekerAction } from "@/app/admin/buscar-clientes-actions";
import { requireStaff } from "@/lib/auth";
import { FILE_TEMPLATES } from "@/modules/industries/catalog";
import { PROVINCES, RED_SERVICES } from "@/modules/red/catalog";
import { acceptedContacts, newCandidates, searchSeekers, SEEKER_KINDS } from "@/modules/red/seekers";
import { EmptyState } from "@/components/admin/kit/Panel";
import { fieldClass, ViewSwitch } from "@/components/ds/primitives";
import { StudioCard } from "@/components/red/StudioCard";
import { getPrefs, setPrefs } from "@/lib/prefs";
import { publicDirectory } from "@/modules/red/server";
import { Sparkles, UserSearch } from "lucide-react";

export const metadata: Metadata = { title: "Red Contable" };

const field = `mt-1 py-2 ${fieldClass}`;

/**
 * Buscar clientes (Red Contable de doble mano, §15): personas, autónomos,
 * empresas y Flotas que activaron «Disponible, busco contador». Listado
 * anónimo: sin nombre ni contacto hasta que acepten. Sin comisión.
 */
export default async function BuscarClientesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireStaff();
  const estudios = sp.vista === "estudios";
  const f = { tipo: sp.tipo && sp.tipo in SEEKER_KINDS ? sp.tipo : undefined, rubro: sp.rubro || undefined, provincia: sp.provincia || undefined, necesidad: sp.necesidad || undefined };
  const prefs = await getPrefs(me.id);
  const [{ issue, list }, accepted, fresh, directory] = await Promise.all([searchSeekers(me, f), acceptedContacts(me), newCandidates(me, prefs.redSeenAt).catch(() => 0), estudios ? publicDirectory({}) : Promise.resolve([])]);
  // Mirar las postulaciones apaga el badge de candidatos nuevos
  if (!estudios && !issue) await setPrefs(me.id, { redSeenAt: new Date().toISOString() }).catch(() => undefined);
  const operator = me.role === "dueno" || me.role === "contador";
  const views = (
    <ViewSwitch
      label="Vistas de la Red Contable"
      views={[
        { href: "/admin/comercial/buscar-clientes", label: "Postulaciones", active: !estudios, count: estudios ? fresh : 0, hint: "Personas, autónomos, empresas y Flotas que activaron «Disponible, busco contador». Ves solo lo que eligieron mostrar, sin nombre ni contacto: si te interesa, contactalos y, cuando acepten, empieza la admisión. Faro no cobra comisión." },
        { href: "/admin/comercial/buscar-clientes?vista=estudios", label: "Estudios y contadores", active: estudios, hint: "Así ven la Red quienes buscan contador: los estudios con la matrícula verificada, en un orden que nadie paga." },
      ]}
    />
  );
  if (estudios)
    return (
      <div className="grid gap-5 [&>*]:min-w-0">
        <PageHeader level={2} title="Red Contable" description="Postulaciones de quienes buscan contador y los estudios de la Red." className="mb-0" />
        {views}
        {directory.length === 0 ? (
          <EmptyState icon={UserSearch} title="Todavía no hay estudios publicados" text="Cuando un estudio publica su ficha con la matrícula verificada, aparece acá y en la Red Contable." />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2" aria-label="Estudios y contadores">
            {directory.map((x) => (
              <li key={x.studioId}>
                <StudioCard x={x} href={`/red-contable/${x.slug}`} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <PageHeader level={2} title="Red Contable" description="Postulaciones de quienes buscan contador y los estudios de la Red." className="mb-0" />
      {views}
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {issue ? (
        <div className="rounded-md border border-line bg-surface">
          <EmptyState icon={UserSearch} title="Para ver las postulaciones, publicá tu ficha" text={`${issue} Quien busca contador tiene que poder ver quién lo contacta.`} action={{ href: "/admin/comercial/red", label: "Ir a tu perfil en la Red" }} />
        </div>
      ) : (
        <>
          <form method="get" className="grid gap-3 rounded-md border border-line bg-surface p-4 sm:grid-cols-5 sm:items-end" role="search" aria-label="Filtrar postulaciones">
            <label className="text-meta text-muted">
              Tipo
              <select name="tipo" defaultValue={f.tipo ?? ""} className={field}>
                <option value="">Todos</option>
                {Object.entries(SEEKER_KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-meta text-muted">
              Rubro
              <select name="rubro" defaultValue={f.rubro ?? ""} className={field}>
                <option value="">Todos</option>
                {FILE_TEMPLATES.map((t) => (
                  <option key={t.clave} value={t.clave}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-meta text-muted">
              Provincia
              <select name="provincia" defaultValue={f.provincia ?? ""} className={field}>
                <option value="">Todas</option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-meta text-muted">
              Necesita
              <select name="necesidad" defaultValue={f.necesidad ?? ""} className={field}>
                <option value="">Cualquier cosa</option>
                {RED_SERVICES.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="h-(--control-h) rounded-md bg-navy px-4 text-ui font-medium text-paper hover:bg-night">Filtrar</button>
          </form>
          {list.length === 0 ? (
            <div className="rounded-md border border-line bg-surface">
              <EmptyState icon={UserSearch} title={Object.values(f).some(Boolean) ? "Nadie con esos filtros por ahora" : "Todavía no hay postulaciones"} text="Las personas, autónomos, empresas y Flotas que activan «Disponible, busco contador» aparecen acá, sin nombre ni contacto. Te avisamos cuando haya alguien que coincida con tu perfil." />
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2" aria-label="Disponibles">
              {list.map((x) => (
                <li key={x.id} className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4 sm:p-5" data-buscando={x.kind}>
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body font-semibold">{x.kindLabel}{x.industry ? ` · ${x.industry}` : ""}</span>
                    {x.match && !x.contact && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-soft px-1.5 py-0.5 text-caption font-medium text-rose-deep">
                        <Sparkles className="size-3.5" aria-hidden /> Coincide con tu perfil
                      </span>
                    )}
                    {x.contact && <StatusBadge status={x.contact.status === "aceptado" ? "activa" : x.contact.status === "rechazado" ? "pausada" : "pendiente"} label={x.contact.status === "aceptado" ? "Aceptó" : x.contact.status === "rechazado" ? "No aceptó" : "Contactado"} />}
                  </p>
                  <p className="text-ui text-muted">{[x.size, x.zone].filter(Boolean).join(" · ") || "Sin zona ni tamaño"}</p>
                  {x.needs.length > 0 && <p className="text-ui">Necesita: {x.needs.join(", ")}</p>}
                  {x.note && <p className="text-ui text-muted">«{x.note}»</p>}
                  {!x.contact && operator && (
                    <form action={contactSeekerAction} className="mt-auto grid gap-2">
                      <input type="hidden" name="id" value={x.id} />
                      <input name="message" maxLength={1000} placeholder="Un mensaje corto (opcional)" aria-label="Mensaje" className={field} />
                      <SubmitButton pendingText="…">Contactar</SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {accepted.length > 0 && (
        <section aria-labelledby="aceptaron" className="rounded-md border border-line bg-surface p-4 sm:p-5">
          <h3 id="aceptaron" className="text-title font-semibold">
            Aceptaron tu contacto
          </h3>
          <ul className="mt-2 divide-y divide-line">
            {accepted.map((a) => (
              <li key={a.c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-ui">
                <span>
                  {a.fleet ? `Flota «${a.fleet}» · Capitán: ${a.name}` : a.name} · {a.email}
                </span>
                {a.c.connection_id ? (
                  <Link href={`/admin/comercial/conexiones/${a.c.connection_id}`} className="underline underline-offset-4">
                    Ir a la admisión
                  </Link>
                ) : a.fleet ? (
                  <Link href="/admin/comercial/red/flotas" className="underline underline-offset-4">
                    Ver pedidos de Flotas
                  </Link>
                ) : (
                  <a href={`mailto:${a.email}`} className="underline underline-offset-4">
                    Escribirle
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
