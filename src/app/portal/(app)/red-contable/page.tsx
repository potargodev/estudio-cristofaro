import type { Metadata } from "next";
import Link from "next/link";
import { acceptOrgContactAction, orgSeekerAction, rejectOrgContactAction } from "@/app/portal/red-actions";
import { Notice } from "@/components/admin/AdminField";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { EmpresaHeader } from "@/components/portal/EmpresaTabs";
import { SeekerForm } from "@/components/red/SeekerForm";
import { requireMember } from "@/lib/auth";
import { myContacts, mySeeker } from "@/modules/red/seekers";

export const metadata: Metadata = { title: "Red Contable" };

/**
 * Red Contable para la empresa (§15): «Disponible, busco contador» con lo que
 * la empresa elige mostrar (sin su nombre) y los estudios que la contactaron.
 * Solo para quien la administra.
 */
export default async function PortalRedPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireMember();
  const admin = me.orgRole === "administrador" || me.orgRole === "direccion";
  const [seeker, contacts] = await Promise.all([admin ? mySeeker(me.id) : null, admin ? myContacts(me.id) : []]);
  const pending = contacts.filter((x) => x.c.status === "pendiente" && !x.fleetId);
  return (
    <div className="grid gap-6 [&>*]:min-w-0">
      <div>
        <EmpresaHeader me={me} />
      </div>
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {!admin ? (
        <p className="rounded-md border border-dashed border-line px-4 py-5 text-ui text-muted">La Red Contable la maneja quien administra la empresa.</p>
      ) : (
        <>
          <section aria-labelledby="red-intro" className="rounded-md border border-line bg-surface p-4 sm:p-5">
            <h2 id="red-intro" className="text-title font-semibold">
              Estudios y contadores
            </h2>
            <p className="mt-1 max-w-3xl text-ui text-muted">
              La Red Contable reúne estudios con la matrícula verificada y reseñas de clientes reales, en un orden que nadie paga. Si buscás otro estudio o uno para algo puntual, miralos o activá la postulación y que te encuentren ellos.
            </p>
            <Link href="/red-contable" target="_blank" className="mt-3 inline-flex h-(--control-h) items-center rounded-md border border-navy/30 px-4 text-ui font-medium text-navy hover:border-navy/60 hover:bg-navy-soft">
              Ver estudios y contadores
            </Link>
          </section>

          {pending.length > 0 && (
            <section aria-labelledby="contactos" className="rounded-md border border-rose/40 bg-rose-soft p-4 sm:p-5">
              <h2 id="contactos" className="text-title font-semibold">
                Estudios que quieren trabajar con la empresa
              </h2>
              <ul className="mt-2 divide-y divide-line">
                {pending.map((x) => (
                  <li key={x.c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-ui" data-contacto>
                    <span className="min-w-0">
                      <Link href={`/red-contable/${x.slug}`} className="font-medium underline underline-offset-4">
                        {x.studio}
                      </Link>
                      {x.c.message && <span className="block text-muted">«{x.c.message}»</span>}
                    </span>
                    <form action={acceptOrgContactAction} className="flex gap-2">
                      <input type="hidden" name="id" value={x.c.id} />
                      <button className="h-(--control-h) rounded-md bg-navy px-4 text-ui font-medium text-paper hover:bg-night">Aceptar</button>
                      <button formAction={rejectOrgContactAction} className="h-(--control-h) rounded-md border border-line px-4 text-ui hover:border-muted">
                        No, gracias
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-meta text-muted">Al aceptar, el estudio ve tu nombre y tu mail para contactarte. Nada de la empresa se comparte sin que lo decidas.</p>
            </section>
          )}

          <section aria-labelledby="postulacion" className="rounded-md border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="postulacion" className="text-title font-semibold">
                Disponible, busco contador
              </h2>
              <StatusBadge status={seeker?.active ? "activa" : "pausada"} label={seeker?.active ? "Visible en la Red" : "No visible"} />
            </div>
            <div className="mt-3">
              <SeekerForm action={orgSeekerAction} seeker={seeker} company />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
