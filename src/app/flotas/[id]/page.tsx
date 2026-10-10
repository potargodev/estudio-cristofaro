import { Anchor, Crown, MessageSquare, Ship } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/admin/ui";
import { FirstSteps } from "@/components/app/FirstSteps";
import { Feedback, FleetLabel } from "@/components/flotas/Feedback";
import { requirePersonal } from "@/lib/auth";
import { formatArs } from "@/lib/faro/plans";
import { cn } from "@/lib/utils";
import { FLEET_MAX, FLEET_MIN, INFORMAL_NOTICE, PROFILES, profileLabel } from "@/modules/flotas/catalog";
import { FleetError, fleetSpace } from "@/modules/flotas/server";
import { markStep } from "@/modules/onboarding/server";
import { RED_SERVICES } from "@/modules/red/catalog";
import {
  closeRequestAction,
  inviteAction,
  leaveFleetAction,
  postMessageAction,
  publishRequestAction,
  removeMemberAction,
  setProfileAction,
  transferCaptainAction,
  updateFleetAction,
  voteAction,
} from "../actions";

export const metadata: Metadata = { title: "Flota" };

const field = "mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-[14px] text-ink focus:border-navy focus:outline-none";
const time = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" });
const STATUS = { invitado: "Invitado", activo: "Activo", salio: "Salió", rechazo: "No aceptó" } as const;

/** Espacio de la Flota: lo ven todos sus integrantes. Nadie ve las finanzas de nadie */
export default async function FlotaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const u = await requirePersonal();
  let x: Awaited<ReturnType<typeof fleetSpace>>;
  try {
    x = await fleetSpace({ id: u.id, name: u.name, email: u.email }, id);
  } catch (e) {
    if (e instanceof FleetError) notFound();
    throw e;
  }
  const isCaptain = x.me.role === "capitan";
  await markStep("flota_ver", `/flotas/${x.fleet.id}`).catch(() => undefined);
  const active = x.members.filter((m) => m.status === "activo");
  const hidden = <input type="hidden" name="fleet" value={x.fleet.id} />;
  return (
    <>
      <Feedback ok={sp.ok} error={sp.error} />
      <div className="flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-navy text-gold">
          <Ship className="size-7" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0">
          <FleetLabel />
          <h1 className="mt-1 font-display text-[32px] leading-tight sm:text-[42px]">{x.fleet.name}</h1>
          {x.fleet.description && <p className="text-[15px] text-muted">{x.fleet.description}</p>}
        </div>
      </div>
      <p className="mt-4 rounded-md border border-line bg-surface px-4 py-3 text-[13px] text-muted">{INFORMAL_NOTICE}</p>
      <FirstSteps className="mt-6" path={`/flotas/${x.fleet.id}`} />

      <section aria-labelledby="tripulacion" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="tripulacion" className="text-[19px] font-semibold">
            Tripulación ({active.length} de {FLEET_MAX})
          </h2>
          <p className="text-[13px] text-muted">
            Mínimo {FLEET_MIN} para pedir propuestas. Cada uno ve nombre, perfil y estado; nunca finanzas.
          </p>
        </div>
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
          {x.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[15px] font-medium">
                  {m.role === "capitan" && <Crown className="size-4 text-rose-deep" aria-label="Capitán" />}
                  {m.name}
                  {m.isMe && <span className="text-[12px] font-normal text-muted">(vos)</span>}
                </span>
                <span className="block text-[13px] text-muted">
                  {m.role === "capitan" ? "Capitán" : "Tripulante"} · {profileLabel(m.profile)} · {STATUS[m.status]}
                  {m.accepted && " · aceptó la propuesta"}
                </span>
              </span>
              {isCaptain && !m.isMe && m.status !== "salio" && (
                <span className="flex gap-2">
                  {m.status === "activo" && (
                    <form action={transferCaptainAction}>
                      {hidden}
                      <input type="hidden" name="member" value={m.id} />
                      <button type="submit" className="h-8 rounded-md border border-line px-2.5 text-[12px] hover:border-muted">
                        Hacer Capitán
                      </button>
                    </form>
                  )}
                  <form action={removeMemberAction}>
                    {hidden}
                    <input type="hidden" name="member" value={m.id} />
                    <button type="submit" className="h-8 rounded-md border border-line px-2.5 text-[12px] hover:border-muted">
                      Quitar
                    </button>
                  </form>
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {isCaptain && (
            <form action={inviteAction} className="rounded-lg border border-line bg-surface p-4">
              {hidden}
              <p className="text-[15px] font-semibold">Invitar</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-[13px] text-muted">
                  Nombre
                  <input name="name" maxLength={120} className={field} />
                </label>
                <label className="text-[13px] text-muted">
                  Email
                  <input name="email" type="email" required className={field} />
                </label>
              </div>
              <div className="mt-3">
                <SubmitButton pendingText="…">Invitar</SubmitButton>
              </div>
            </form>
          )}
          <form action={setProfileAction} className="rounded-lg border border-line bg-surface p-4">
            {hidden}
            <p className="text-[15px] font-semibold">Tu perfil</p>
            <label className="text-[13px] text-muted">
              Lo usa el estudio para cotizarte
              <select name="profile" defaultValue={x.me.profile ?? ""} className={field}>
                {PROFILES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3">
              <SubmitButton pendingText="…">Guardar</SubmitButton>
            </div>
          </form>
        </div>
      </section>

      <section aria-labelledby="pedido" className="mt-10">
        <h2 id="pedido" className="text-[19px] font-semibold">
          Pedido de propuesta
        </h2>
        {x.fleet.request_status === "publicado" ? (
          <div className="mt-3 rounded-lg border border-line bg-surface p-4 text-[14px]">
            <p>
              Publicado en la Red de estudios{x.fleet.request_zone ? ` · zona ${x.fleet.request_zone}` : ""}. Los estudios ven cuántos son por perfil y la zona, sin datos personales.
            </p>
            {isCaptain && (
              <form action={closeRequestAction} className="mt-3">
                {hidden}
                <button type="submit" className="h-9 rounded-md border border-line px-3 text-[13px] hover:border-muted">
                  Cerrar el pedido
                </button>
              </form>
            )}
          </div>
        ) : isCaptain ? (
          <form action={publishRequestAction} className="mt-3 grid gap-3 rounded-lg border border-line bg-surface p-4">
            {hidden}
            <label className="text-[13px] text-muted">
              Zona (para estudios presenciales)
              <input name="zone" defaultValue={x.fleet.request_zone ?? ""} maxLength={80} placeholder="Ej.: Rosario" className={field} />
            </label>
            <fieldset>
              <legend className="text-[13px] text-muted">Qué necesitan</legend>
              <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                {RED_SERVICES.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-[14px]">
                    <input type="checkbox" name="services" value={s.key} defaultChecked={x.fleet.request_services.includes(s.key)} className="size-4 accent-navy" /> {s.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="text-[13px] text-muted">
              Mensaje para los estudios (sin datos personales)
              <textarea name="message" defaultValue={x.fleet.request_message ?? ""} rows={3} maxLength={1000} className={`${field} h-auto py-2`} />
            </label>
            <div>
              <SubmitButton pendingText="…">{x.fleet.request_status === "cerrado" ? "Volver a publicar" : "Publicar en la Red"}</SubmitButton>
            </div>
            {active.length < FLEET_MIN && <p className="text-[13px] text-muted">Hacen falta {FLEET_MIN - active.length} integrantes activos más para publicar.</p>}
          </form>
        ) : (
          <p className="mt-2 text-[14px] text-muted">{x.fleet.request_status === "cerrado" ? "El Capitán cerró el pedido." : "El Capitán todavía no publicó el pedido."}</p>
        )}
      </section>

      <section aria-labelledby="propuestas" className="mt-10">
        <h2 id="propuestas" className="text-[19px] font-semibold">
          Propuestas ({x.proposals.length})
        </h2>
        {x.proposals.length === 0 ? (
          <p className="mt-2 text-[14px] text-muted">Cuando los estudios respondan, las comparan acá.</p>
        ) : (
          <>
            <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[640px] text-left text-[14px]">
                <caption className="sr-only">Comparación de propuestas: precio mensual por integrante según perfil</caption>
                <thead className="border-b border-line text-[12px] text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Estudio</th>
                    {PROFILES.map((p) => (
                      <th key={p.key} className={cn("px-3 py-3 text-right font-medium", p.key === x.me.profile && "text-ink")}>
                        {p.label}
                      </th>
                    ))}
                    <th className="px-3 py-3 font-medium">Mínimo</th>
                    <th className="px-3 py-3 font-medium">Preaviso</th>
                    <th className="px-3 py-3 font-medium">Votos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {x.proposals.map(({ p, studio, slug, votes, myVote }) => (
                    <tr key={p.id}>
                      <th scope="row" className="px-4 py-3 font-medium">
                        <Link href={`/red/${slug}`} className="hover:underline">
                          {studio}
                        </Link>
                      </th>
                      {PROFILES.map((pr) => (
                        <td key={pr.key} className={cn("tabular-nums px-3 py-3 text-right", pr.key === x.me.profile && "font-semibold")}>
                          {p.prices[pr.key] != null ? formatArs(p.prices[pr.key]!) : "—"}
                        </td>
                      ))}
                      <td className="px-3 py-3">{p.min_members}</td>
                      <td className="px-3 py-3">{p.notice_days} días</td>
                      <td className="px-3 py-3">
                        {votes}
                        {myVote && <span className="ml-1 text-[12px] text-muted">(tu voto)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12px] text-muted">Precios en pesos por mes y por integrante, pago mensual por adelantado. En negrita, tu perfil. La votación no es vinculante: cada uno decide si acepta.</p>
            <ul className="mt-4 grid gap-3">
              {x.proposals.map(({ p, studio, myVote, accepted }) => (
                <li key={p.id} className="rounded-lg border border-line bg-surface p-4">
                  <p className="text-[15px] font-semibold">{studio}</p>
                  <p className="mt-1 whitespace-pre-line text-[14px]">{p.includes}</p>
                  {p.below_min_since && <p className="mt-2 text-[13px] text-danger">La Flota quedó debajo del mínimo de esta propuesta: el precio grupal tiene 30 días de aviso.</p>}
                  <p className="mt-2 text-[13px] text-muted">{accepted} {accepted === 1 ? "integrante aceptó" : "integrantes aceptaron"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!myVote && (
                      <form action={voteAction}>
                        {hidden}
                        <input type="hidden" name="proposal" value={p.id} />
                        <button type="submit" className="h-9 rounded-md border border-line px-3 text-[13px] hover:border-muted">
                          Votar esta
                        </button>
                      </form>
                    )}
                    {!x.myAgreement && (
                      <Link href={`/flotas/acuerdo/${p.id}`} className="inline-flex h-9 items-center rounded-md bg-navy px-4 text-[13px] font-medium text-paper hover:bg-night">
                        Ver y aceptar mi acuerdo
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {x.myAgreement && (
          <p className="mt-3 text-[14px]">
            Ya tenés tu acuerdo con el estudio.{" "}
            <Link href="/flotas/servicios" className="font-medium underline underline-offset-4">
              Ver Mis servicios
            </Link>
          </p>
        )}
      </section>

      <section aria-labelledby="conversacion" className="mt-10">
        <h2 id="conversacion" className="flex items-center gap-2 text-[19px] font-semibold">
          <MessageSquare className="size-5 text-rose-deep" aria-hidden /> Conversación y novedades
        </h2>
        <form action={postMessageAction} className="mt-3 flex gap-2">
          {hidden}
          <label htmlFor="msg" className="sr-only">
            Mensaje para la Flota
          </label>
          <input id="msg" name="body" required maxLength={1000} placeholder="Escribile a la tripulación" className={`${field} mt-0`} />
          <SubmitButton pendingText="…">Enviar</SubmitButton>
        </form>
        <ol className="mt-4 grid gap-2">
          {x.events.map((e) => (
            <li key={e.id} className={cn("rounded-md px-4 py-2.5 text-[14px]", e.kind === "mensaje" ? "border border-line bg-surface" : "bg-canvas text-muted")}>
              <span className="block text-[12px] text-muted">
                {e.kind === "mensaje" ? e.actor_label : "Novedad"} · {time.format(e.created_at)}
              </span>
              {e.body}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 rounded-lg border border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold">
          <Anchor className="size-5 text-rose-deep" aria-hidden /> Configuración
        </h2>
        {isCaptain && (
          <form action={updateFleetAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            {hidden}
            <label className="text-[13px] text-muted">
              Nombre
              <input name="name" defaultValue={x.fleet.name} required maxLength={60} className={field} />
            </label>
            <label className="text-[13px] text-muted">
              Descripción
              <input name="description" defaultValue={x.fleet.description ?? ""} maxLength={500} className={field} />
            </label>
            <div>
              <SubmitButton pendingText="…">Guardar</SubmitButton>
            </div>
          </form>
        )}
        <form action={leaveFleetAction} className="mt-4">
          {hidden}
          <p className="text-[13px] text-muted">
            Salir de la Flota no da de baja tu acuerdo con el estudio: lo mantenés con la tarifa grupal o lo das de baja desde Mis servicios.
            {isCaptain && " Si salís, el rol de Capitán pasa al integrante más antiguo."}
          </p>
          <button type="submit" className="mt-2 h-9 rounded-md border border-line px-3 text-[13px] hover:border-muted">
            Salir de la Flota
          </button>
        </form>
      </section>
    </>
  );
}
