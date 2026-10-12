import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Feedback } from "@/components/app/Feedback";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { ViewSwitch } from "@/components/ds/primitives";
import { SeekerForm } from "@/components/red/SeekerForm";
import { requirePersonal } from "@/lib/auth";
import { myContacts, mySeeker } from "@/modules/red/seekers";
import { answerContactAction, rejectContactAction, seekerAction } from "../actions";

export const metadata: Metadata = { title: "Mi postulación" };

const fmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" });

/**
 * Red Contable · Mi postulación (§15): «Disponible, busco contador» bien a la
 * vista, lo que ven los estudios y quién te contactó. Sin nombre ni contacto
 * hasta que aceptes.
 */
export default async function DisponiblePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requirePersonal();
  const titular = me.role === "titular";
  const [seeker, contacts] = await Promise.all([mySeeker(me.id), myContacts(me.id)]);
  const mine = contacts.filter((x) => !x.fleetId);
  const pending = mine.filter((x) => x.c.status === "pendiente");
  return (
    <div className="grid gap-6 [&>*]:min-w-0">
      <PageHeader title="Red Contable" description="Estudios y contadores con la matrícula verificada, y tu postulación para que te encuentren. Nadie paga por aparecer primero." className="mb-0" />
      <ViewSwitch
        label="Vistas de la Red Contable"
        views={[
          { href: "/red-contable", label: "Estudios y contadores", active: false },
          { href: "/contador/disponible", label: seeker?.active ? "Mi postulación · activa" : "Mi postulación", active: true, count: pending.length, hint: "Los estudios ven solo lo que elijas mostrar, sin tu nombre ni tus datos. Si uno te contacta, decidís vos; recién al aceptar ve quién sos." },
        ]}
      />
      <Feedback sp={sp} />

      {pending.length > 0 && (
        <section aria-labelledby="contactos" className="rounded-md border border-rose/40 bg-rose-soft p-4 sm:p-5">
          <h2 id="contactos" className="text-title font-semibold">
            Estudios que quieren ser tu contador
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
                <form action={answerContactAction} className="flex gap-2">
                  <input type="hidden" name="id" value={x.c.id} />
                  <input type="hidden" name="volver" value="/contador/disponible" />
                  <button className="h-(--control-h) rounded-md bg-navy px-4 text-ui font-medium text-paper hover:bg-night">Aceptar</button>
                  <button formAction={rejectContactAction} className="h-(--control-h) rounded-md border border-line px-4 text-ui hover:border-muted">
                    No, gracias
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-meta text-muted">Al aceptar, el estudio ve tu nombre y tus datos y empieza su admisión.</p>
        </section>
      )}

      {titular ? (
        <section aria-labelledby="postulacion" className="rounded-md border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="postulacion" className="text-title font-semibold">
              Disponible, busco contador
            </h2>
            <StatusBadge status={seeker?.active ? "activa" : "pausada"} label={seeker?.active ? "Visible en la Red" : "No visible"} />
          </div>
          <div className="mt-3">
            <SeekerForm action={seekerAction} seeker={seeker} hidden={{ volver: "/contador/disponible" }} />
          </div>
        </section>
      ) : (
        <p className="rounded-md border border-dashed border-line px-4 py-5 text-ui text-muted">La postulación la activa la persona titular de la cuenta.</p>
      )}

      <section aria-labelledby="historial-red" className="rounded-md border border-line bg-surface p-4 sm:p-5">
        <h2 id="historial-red" className="text-title font-semibold">
          Contactos
        </h2>
        {mine.length === 0 ? (
          <p className="mt-2 text-ui text-muted">Todavía ningún estudio te contactó. Cuando lo haga, te avisamos y lo ves acá.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {mine.map((x) => (
              <li key={x.c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-ui">
                <Link href={`/red-contable/${x.slug}`} className="min-w-0 truncate underline-offset-4 hover:underline">
                  {x.studio}
                </Link>
                <span className="flex items-center gap-2 text-meta text-muted">
                  {fmt.format(x.c.created_at)}
                  <StatusBadge status={x.c.status === "aceptado" ? "activa" : x.c.status === "rechazado" ? "cancelada" : "pendiente"} label={x.c.status === "aceptado" ? "Aceptado" : x.c.status === "rechazado" ? "No aceptado" : "Para responder"} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
