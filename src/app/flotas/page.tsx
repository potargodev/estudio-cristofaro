import { PageHeader } from "@/components/admin/kit/PageHeader";
import { and, eq } from "drizzle-orm";
import { ChevronRight, Ship } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback, FleetLabel } from "@/components/flotas/Feedback";
import { getDb } from "@/db";
import { fleet_members, fleets } from "@/db/schema";
import { requirePersonal } from "@/lib/auth";
import { FLEET_MAX, FLEET_MIN, INFORMAL_NOTICE, PROFILES } from "@/modules/flotas/catalog";
import { myInvitations } from "@/modules/flotas/server";
import { answerInvitationAction, createFleetAction } from "./actions";
import { fieldClass } from "@/components/ds/primitives";

export const metadata: Metadata = { title: "Flotas" };

const field = `mt-1 ${fieldClass}`;

function ProfileSelect() {
  return (
    <select name="profile" required defaultValue="" className={field}>
      <option value="" disabled>
        Elegí
      </option>
      {PROFILES.map((p) => (
        <option key={p.key} value={p.key}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

export default async function FlotasPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const u = await requirePersonal();
  const me = { id: u.id, name: u.name, email: u.email };
  const [mine, invites] = await Promise.all([
    getDb()
      .select({ id: fleets.id, name: fleets.name, role: fleet_members.role, request: fleets.request_status })
      .from(fleet_members)
      .innerJoin(fleets, eq(fleets.id, fleet_members.fleet_id))
      .where(and(eq(fleet_members.user_id, u.id), eq(fleet_members.status, "activo"), eq(fleets.status, "activa"))),
    myInvitations(me),
  ]);
  return (
    <>
      <Feedback ok={sp.ok} error={sp.error} />
      <PageHeader title="Flotas" description={`Naveguen juntos: entre ${FLEET_MIN} y ${FLEET_MAX} personas piden juntas una propuesta a los estudios de la Red y consiguen mejores condiciones. Cada uno firma su propio acuerdo y paga solo lo suyo.`} className="mb-0" />
      <p className="mt-3">
        <Link href="/flotas/servicios" className="text-ui font-medium underline underline-offset-4">
          Mis servicios
        </Link>
      </p>

      {invites.length > 0 && (
        <section aria-labelledby="invitaciones" className="mt-8">
          <h2 id="invitaciones" className="text-title font-semibold">
            Te invitaron
          </h2>
          <ul className="mt-3 grid gap-3">
            {invites.map((i) => (
              <li key={i.id} className="rounded-md border border-navy bg-surface p-5">
                <FleetLabel />
                <p className="mt-2 text-title font-semibold">{i.name}</p>
                {i.description && <p className="text-ui text-muted">{i.description}</p>}
                <form action={answerInvitationAction} className="mt-4 grid gap-3">
                  <input type="hidden" name="member" value={i.id} />
                  <input type="hidden" name="accept" value="1" />
                  <label className="text-meta text-muted">
                    Tu perfil
                    <ProfileSelect />
                  </label>
                  <p className="rounded-md bg-canvas px-3 py-2 text-meta text-muted">{INFORMAL_NOTICE}</p>
                  <label className="flex items-start gap-2 text-ui">
                    <input type="checkbox" name="informal" required className="mt-0.5 size-4 accent-navy" /> Entiendo que es un grupo informal y que cada uno responde solo por lo suyo.
                  </label>
                  <div>
                    <SubmitButton pendingText="…">Unirme a la Flota</SubmitButton>
                  </div>
                </form>
                <form action={answerInvitationAction} className="mt-2">
                  <input type="hidden" name="member" value={i.id} />
                  <input type="hidden" name="accept" value="0" />
                  <button type="submit" className="text-meta text-muted underline underline-offset-4">
                    No, gracias
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="mis-flotas" className="mt-8">
        <h2 id="mis-flotas" className="text-title font-semibold">
          Mis Flotas
        </h2>
        {mine.length === 0 ? (
          <p className="mt-2 text-ui text-muted">Todavía no estás en ninguna Flota.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
            {mine.map((f) => (
              <li key={f.id}>
                <Link href={`/flotas/${f.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-canvas">
                  <Ship className="size-5 shrink-0 text-rose-deep mt-0.5" strokeWidth={1.5} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-medium">{f.name}</span>
                    <span className="block text-meta text-muted">
                      {f.role === "capitan" ? "Capitán" : "Tripulante"} · {f.request === "publicado" ? "pedido publicado" : f.request === "cerrado" ? "pedido cerrado" : "armando el pedido"}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="crear" className="mt-8 rounded-md border border-line bg-surface p-5">
        <h2 id="crear" className="text-title font-semibold">
          Crear una Flota
        </h2>
        <form action={createFleetAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-meta text-muted">
            Nombre
            <input name="name" required minLength={3} maxLength={60} placeholder="Ej.: Diseñadores de Rosario" className={field} />
            <span className="mt-1 block text-caption">Sin palabras de sociedades (S.A., SRL, SAS, Cooperativa…).</span>
          </label>
          <label className="text-meta text-muted">
            Tu perfil
            <ProfileSelect />
          </label>
          <label className="text-meta text-muted sm:col-span-2">
            Descripción (opcional)
            <input name="description" maxLength={500} placeholder="Qué tienen en común y qué buscan" className={field} />
          </label>
          <p className="rounded-md bg-canvas px-3 py-2 text-meta text-muted sm:col-span-2">{INFORMAL_NOTICE}</p>
          <label className="flex items-start gap-2 text-ui sm:col-span-2">
            <input type="checkbox" name="informal" required className="mt-0.5 size-4 accent-navy" /> Entiendo que la Flota es un grupo informal y no una sociedad.
          </label>
          <div>
            <SubmitButton pendingText="Creando…">Crear la Flota</SubmitButton>
          </div>
        </form>
      </section>
    </>
  );
}
