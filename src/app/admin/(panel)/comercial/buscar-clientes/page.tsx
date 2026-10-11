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
import { acceptedContacts, searchSeekers, SEEKER_KINDS } from "@/modules/red/seekers";

export const metadata: Metadata = { title: "Buscar clientes" };

const field = "mt-1 block w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[14px] text-ink";

/**
 * Buscar clientes (Red Contable de doble mano, §15): personas, autónomos,
 * empresas y Flotas que activaron «Disponible, busco contador». Listado
 * anónimo: sin nombre ni contacto hasta que acepten. Sin comisión.
 */
export default async function BuscarClientesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireStaff();
  const f = { tipo: sp.tipo && sp.tipo in SEEKER_KINDS ? sp.tipo : undefined, rubro: sp.rubro || undefined, provincia: sp.provincia || undefined, necesidad: sp.necesidad || undefined };
  const [{ issue, list }, accepted] = await Promise.all([searchSeekers(me, f), acceptedContacts(me)]);
  const operator = me.role === "dueno" || me.role === "contador";
  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <PageHeader level={2} title="Buscar clientes" description="Personas, autónomos, empresas y Flotas que buscan contador en la Red Contable. Ves solo lo que eligieron mostrar, sin nombre ni contacto: si te interesa, contactalos y, cuando acepten, empieza la admisión. Faro no cobra comisión por los clientes." className="mb-0" />
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {issue ? (
        <p className="rounded-lg border border-line bg-surface p-5 text-[14px]">
          {issue}{" "}
          <Link href="/admin/comercial/red" className="underline underline-offset-4">
            Ir a tu perfil en la Red Contable
          </Link>
        </p>
      ) : (
        <>
          <form method="get" className="grid gap-2 rounded-lg border border-line bg-surface p-4 sm:grid-cols-5 sm:items-end" role="search" aria-label="Filtrar">
            <label className="text-[13px] text-muted">
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
            <label className="text-[13px] text-muted">
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
            <label className="text-[13px] text-muted">
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
            <label className="text-[13px] text-muted">
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
            <button className="h-10 rounded-md bg-navy px-4 text-[14px] text-paper">Buscar</button>
          </form>
          {list.length === 0 ? (
            <p className="text-[14px] text-muted">No hay nadie disponible con esos filtros por ahora.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2" aria-label="Disponibles">
              {list.map((x) => (
                <li key={x.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-5" data-buscando={x.kind}>
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[16px] font-medium">{x.kindLabel}{x.industry ? ` · ${x.industry}` : ""}</span>
                    {x.contact && <StatusBadge status={x.contact.status === "aceptado" ? "activa" : x.contact.status === "rechazado" ? "pausada" : "pendiente"} label={x.contact.status === "aceptado" ? "Aceptó" : x.contact.status === "rechazado" ? "No aceptó" : "Contactado"} />}
                  </p>
                  <p className="text-[14px] text-muted">{[x.size, x.zone].filter(Boolean).join(" · ") || "Sin zona ni tamaño"}</p>
                  {x.needs.length > 0 && <p className="text-[14px]">Necesita: {x.needs.join(", ")}</p>}
                  {x.note && <p className="text-[14px] text-muted">«{x.note}»</p>}
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
        <section aria-labelledby="aceptaron" className="rounded-lg border border-line bg-surface p-5">
          <h3 id="aceptaron" className="text-[16px] font-semibold">
            Aceptaron tu contacto
          </h3>
          <ul className="mt-2 divide-y divide-line">
            {accepted.map((a) => (
              <li key={a.c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]">
                <span>
                  {a.fleet ? `Flota «${a.fleet}» · Capitán: ${a.name}` : a.name} · {a.email}
                </span>
                {a.c.connection_id ? (
                  <Link href={`/admin/comercial/conexiones/${a.c.connection_id}`} className="underline underline-offset-4">
                    Ir a la admisión
                  </Link>
                ) : (
                  <Link href="/admin/comercial/red/flotas" className="underline underline-offset-4">
                    Ver pedidos de Flotas
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
