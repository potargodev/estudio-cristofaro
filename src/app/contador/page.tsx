import { ClipboardCheck, FileSignature, History, MessagesSquare, Search, Ship, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { ModeBadge } from "@/components/conexiones/ModeBadge";
import { myContacts, mySeeker } from "@/modules/red/seekers";
import { requirePersonal } from "@/lib/auth";
import { money } from "@/modules/bitacora/catalog";
import { NO_REEMPLAZA } from "@/modules/escudo/catalog";
import { actionsFor, AUTONOMY_LABEL, connectionHistory, currentConnection, disputeMessages, READONLY_DAYS, STATUS_LABEL, surveyDue } from "@/modules/conexiones/server";
import { acceptInvitationAction, answerInfoAction, autonomyAction, closingClearAction, declineAction, approveActionAction, rejectActionAction, disputeAction, disputeMessageAction, rateAction, skipRatingAction, answerContactAction, rejectContactAction, resolveDisputeAction, scopesAction, signAction, startClosingAction, weeklyAction } from "./actions";
import { fieldClass } from "@/components/ds/primitives";

export const metadata: Metadata = { title: { absolute: "Contador · Faro" } };

const card = "rounded-lg border border-line bg-surface p-5";
const field = `mt-1 py-2 ${fieldClass}`;
const lbl = "block text-meta text-muted";
const fmt = (d: Date | null | undefined) => (d ? d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "—");
const when = (d: Date) => d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
const show = (v: unknown) => (v == null ? "—" : typeof v === "boolean" ? (v ? "sí" : "no") : typeof v === "object" ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${typeof x === "boolean" ? (x ? "sí" : "no") : String(x)}`).join(" · ") : String(v));

function Scopes({ id, personal }: { id: string; personal: boolean }) {
  return (
    <form action={scopesAction} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <p className="text-ui text-ink">
        <strong className="font-medium">Siempre compartís:</strong> tu caja de negocio y lo fiscal (facturación, monotributo, calendario).
      </p>
      <label className="flex items-center gap-2 text-ui">
        <input type="checkbox" name="personal" defaultChecked={personal} className="size-4 accent-navy" /> También mis cajas personales (la Bitácora)
      </label>
      <div>
        <SubmitButton variant="secondary" pendingText="…">Guardar qué compartís</SubmitButton>
      </div>
    </form>
  );
}

function ChooseScopesAndAutonomy() {
  return (
    <>
      <label className="flex items-center gap-2 text-ui">
        <input type="checkbox" name="personal" className="size-4 accent-navy" /> Compartir también mis cajas personales (apagado: solo la caja de negocio y lo fiscal)
      </label>
      <fieldset className="grid gap-1 text-ui">
        <legend className={lbl}>¿Cómo trabaja tu contador?</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="autonomy" value="delegar" defaultChecked className="mt-0.5 size-4 accent-navy" />
          <span>
            <strong className="font-medium">Delegar y mirar</strong> · el contador opera y vos ves todo.
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="autonomy" value="proponer" className="mt-0.5 size-4 accent-navy" />
          <span>
            <strong className="font-medium">Proponer y aprobar</strong> · cada cosa que haga queda para que la apruebes.
          </span>
        </label>
      </fieldset>
    </>
  );
}

/**
 * Contador (§2, §4 a §9): en qué modo estás, tu conexión con un estudio
 * (conexión, no copia), la admisión, el acuerdo, la perilla de autonomía, lo
 * que hizo tu contador, el cierre con mediación y las calificaciones.
 */
export default async function ContadorPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requirePersonal();
  const titular = me.role === "titular";
  const [c, history, survey, seeker, contacts] = await Promise.all([currentConnection(me.id), connectionHistory(me.id), surveyDue(me.id), mySeeker(me.id), myContacts(me.id)]);
  const [actions, messages] = c && ["activa", "en_cierre", "en_disputa", "cerrada"].includes(c.status) ? await Promise.all([actionsFor(me.id, c.id, { status: sp.estado, from: sp.desde, to: sp.hasta }), disputeMessages(c.id)]) : [[], []];
  const proposals = actions.filter((a) => a.status === "propuesta");
  return (
    <div className="grid gap-6 pb-10 [&>*]:min-w-0">
      <PageHeader title="Contador" description="Ordená solo y, cuando quieras tranquilidad de verdad, sumá un profesional. Tus datos siguen siendo tuyos: el estudio se conecta con un permiso, no se lleva una copia." className="mb-0" />
      <Feedback sp={sp} />
      <ModeBadge userId={me.id} />

      {survey && (
        <section aria-labelledby="encuesta" className={card} data-encuesta={survey.kind}>
          <h2 id="encuesta" className="flex items-center gap-2 text-lead font-semibold">
            <Star className="size-5 text-rose-deep" aria-hidden /> {survey.kind === "cierre" ? `¿Cómo fue tu relación con ${survey.studio}?` : `¿Cómo va todo con ${survey.studio}?`}
          </h2>
          <p className="mt-1 text-meta text-muted">Tu opinión queda guardada y el estudio la ve. No se publica.</p>
          <form action={rateAction} className="mt-3 grid gap-2">
            <input type="hidden" name="id" value={survey.connId} />
            <input type="hidden" name="kind" value={survey.kind} />
            <div className="flex flex-wrap gap-3 text-ui">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="flex items-center gap-1.5">
                  <input type="radio" name="score" value={n} defaultChecked={n === 5} className="size-4 accent-navy" /> {n}
                </label>
              ))}
            </div>
            <label>
              <span className={lbl}>Comentario (opcional)</span>
              <textarea name="comment" rows={2} maxLength={1000} className={field} />
            </label>
            <div className="flex flex-wrap gap-2">
              <SubmitButton pendingText="…">Enviar</SubmitButton>
              {survey.kind === "periodica" && (
                <button type="submit" formAction={skipRatingAction} formNoValidate className="h-10 rounded-md px-3 text-ui text-muted hover:text-ink">
                  Ahora no
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      {!c && (
        <section aria-labelledby="sumar" className={card}>
          <h2 id="sumar" className="text-lead font-semibold">
            Sumá un contador
          </h2>
          <p className="mt-1 text-ui text-muted">
            Faro te ordena y te deja hacer lo básico, pero no da fe de nada: el único que puede hacerlo es un contador matriculado. {NO_REEMPLAZA}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/red-contable" className="inline-flex h-10 items-center gap-2 rounded-md bg-navy px-4 text-ui text-paper hover:bg-night">
              <Search className="size-4" aria-hidden /> Buscar en la Red Contable
            </Link>
            <Link href="/flotas" className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-ui hover:border-muted">
              <Ship className="size-4" aria-hidden /> Flotas
            </Link>
          </div>
        </section>
      )}

      {c && (
        <section aria-labelledby="conexion" className={card} data-estado={c.status}>
          <h2 id="conexion" className="text-lead font-semibold">
            {c.studioName} · {STATUS_LABEL[c.status]}
          </h2>
          {c.status === "invitada" && (
            <form action={acceptInvitationAction} className="mt-3 grid gap-3">
              <input type="hidden" name="id" value={c.id} />
              <p className="text-ui">{c.message ?? "El estudio te invita a conectar tu cuenta."}</p>
              <ChooseScopesAndAutonomy />
              <div className="flex flex-wrap gap-2">
                <SubmitButton pendingText="…">Aceptar y pasar a la admisión</SubmitButton>
                <button formAction={declineAction} className="h-10 rounded-md px-3 text-ui text-muted hover:text-danger">
                  No, gracias
                </button>
              </div>
            </form>
          )}
          {c.status === "admision" && (
            <div className="mt-2 grid gap-3 text-ui">
              <p className="text-muted">El estudio está revisando la información que autorizaste antes de aceptarte. Mientras tanto no opera sobre tus datos.</p>
              {c.interview_requested_at && (
                <p className="rounded-md border border-line bg-navy-soft px-4 py-2.5">
                  Te pidió una entrevista{c.interview_note ? `: «${c.interview_note}»` : ""}.{" "}
                  {c.studioSlug && (
                    <Link href={`/red-contable/${c.studioSlug}/agendar`} className="underline underline-offset-4">
                      Elegí un horario en su agenda
                    </Link>
                  )}
                </p>
              )}
              {c.info_request && (
                <form action={answerInfoAction} className="grid gap-2 rounded-md border border-line p-3">
                  <input type="hidden" name="id" value={c.id} />
                  <p>Te pide: «{c.info_request}»</p>
                  {c.info_response && <p className="text-muted">Respondiste: «{c.info_response}»</p>}
                  <label>
                    <span className={lbl}>Tu respuesta</span>
                    <textarea name="answer" rows={2} required maxLength={2000} className={field} />
                  </label>
                  <div>
                    <SubmitButton variant="secondary" pendingText="…">Responder</SubmitButton>
                  </div>
                </form>
              )}
              <Scopes id={c.id} personal={c.scope_personal} />
              <form action={declineAction}>
                <input type="hidden" name="id" value={c.id} />
                <button className="text-meta text-muted underline underline-offset-4 hover:text-danger">Cancelar el pedido</button>
              </form>
            </div>
          )}
          {c.status === "acuerdo" && c.terms && (
            <form action={signAction} className="mt-3 grid gap-3 text-ui">
              <input type="hidden" name="id" value={c.id} />
              <div className="rounded-md border border-line bg-canvas p-4">
                <p className="flex items-center gap-2 font-medium">
                  <FileSignature className="size-4" aria-hidden /> Acuerdo de servicio con {c.studioName}
                </p>
                <p className="mt-2">{c.terms.services}</p>
                <p className="mt-1 text-muted">
                  Honorarios: <span className="num">{money(c.terms.monthlyPrice * 100)}</span> por mes · preaviso de baja: {c.terms.noticeDays} días · versión {c.terms.version}
                </p>
                <p className="mt-1 text-muted">
                  {c.studio_signed_at ? `Firmó el estudio (${c.studio_signed_name}) el ${fmt(c.studio_signed_at)}.` : "Falta la firma del estudio."} {c.user_signed_at ? `Firmaste el ${fmt(c.user_signed_at)}.` : ""}
                </p>
              </div>
              {!c.user_signed_at && (
                <>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" name="policies" required className="mt-0.5 size-4 accent-navy" />
                    <span>
                      Acepto las políticas: el estudio accede a mi caja de negocio y a lo fiscal{c.scope_personal ? " y a mis cajas personales" : ""} con un permiso que puedo revocar; mis datos siguen en mi cuenta; la responsabilidad profesional pasa a mi contador (
                      <Link href="/legal/terminos" className="underline underline-offset-4">
                        términos
                      </Link>
                      ).
                    </span>
                  </label>
                  <label>
                    <span className={lbl}>Firmá escribiendo tu nombre ({me.name})</span>
                    <input name="signed_name" required className={field} autoComplete="name" />
                  </label>
                  <div>
                    <SubmitButton pendingText="…">Firmar</SubmitButton>
                  </div>
                </>
              )}
            </form>
          )}
          {["activa", "en_cierre", "en_disputa"].includes(c.status) && (
            <div className="mt-2 grid gap-4 text-ui">
              <p className="text-muted">
                Conectados desde el {fmt(c.started_at)}. Trabaja sobre tus datos en vivo: no se lleva una copia.
                {c.status !== "activa" && ` Desde el ${fmt(c.closing_started_at)} está en cierre (motivo: ${c.closing_reason}); el estudio solo puede mirar hasta el ${fmt(c.readonly_until)}.`}
              </p>
              {c.status === "activa" && (
                <form action={autonomyAction} className="grid gap-2 rounded-md border border-line p-3">
                  <input type="hidden" name="id" value={c.id} />
                  <p className="font-medium">Cómo trabaja tu contador: {AUTONOMY_LABEL[c.autonomy as "delegar" | "proponer"]}</p>
                  <select name="autonomy" defaultValue={c.autonomy} aria-label="Autonomía" className={field}>
                    <option value="delegar">Delegar y mirar: el contador opera y vos ves todo</option>
                    <option value="proponer">Proponer y aprobar: aprobás cada cosa</option>
                  </select>
                  <div>
                    <SubmitButton variant="secondary" pendingText="…">Cambiar</SubmitButton>
                  </div>
                </form>
              )}
              {c.status === "activa" && <Scopes id={c.id} personal={c.scope_personal} />}
            </div>
          )}
        </section>
      )}

      {proposals.length > 0 && (
        <section aria-labelledby="aprobar" className="rounded-lg border border-rose/40 bg-rose-soft p-5">
          <h2 id="aprobar" className="text-lead font-semibold">
            Para aprobar
          </h2>
          <ul className="mt-2 divide-y divide-line">
            {proposals.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-ui">
                <span>
                  {a.summary} <span className="text-muted">· {a.actor_name} · {when(a.created_at)}</span>
                </span>
                <form action={approveActionAction} className="flex gap-2">
                  <input type="hidden" name="action" value={a.id} />
                  <button className="h-10 rounded-md bg-navy px-3 text-ui text-paper hover:bg-night">
                    Aprobar
                  </button>
                  <button formAction={rejectActionAction} className="h-10 rounded-md border border-line px-3 text-ui hover:border-muted">
                    Rechazar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c && ["activa", "en_cierre", "en_disputa"].includes(c.status) && (
        <section aria-labelledby="hizo" className={card}>
          <h2 id="hizo" className="flex items-center gap-2 text-lead font-semibold">
            <History className="size-5 text-rose-deep" aria-hidden /> Lo que hizo tu contador
          </h2>
          <form method="get" className="mt-3 flex flex-wrap items-end gap-2 text-meta">
            <label>
              <span className={lbl}>Estado</span>
              <select name="estado" defaultValue={sp.estado ?? ""} className={field}>
                <option value="">Todas</option>
                <option value="aplicada">Aplicadas</option>
                <option value="propuesta">Para aprobar</option>
                <option value="aprobada">Aprobadas</option>
                <option value="rechazada">Rechazadas</option>
              </select>
            </label>
            <label>
              <span className={lbl}>Desde</span>
              <input type="date" name="desde" defaultValue={sp.desde ?? ""} className={field} />
            </label>
            <label>
              <span className={lbl}>Hasta</span>
              <input type="date" name="hasta" defaultValue={sp.hasta ?? ""} className={field} />
            </label>
            <button className="h-10 rounded-md border border-line px-3 text-ui">Filtrar</button>
          </form>
          {actions.length === 0 ? (
            <p className="mt-3 text-ui text-muted">Todavía no hay acciones{sp.estado || sp.desde || sp.hasta ? " con esos filtros" : ""}.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {actions.map((a) => (
                <li key={a.id} className="py-2.5 text-ui" data-accion={a.status}>
                  <p className="text-ink">{a.summary}</p>
                  <p className="text-meta text-muted">
                    {a.actor_name} · {when(a.created_at)} · {a.status}
                  </p>
                  {(a.before != null || a.after != null) && (
                    <p className="text-meta text-muted">
                      Antes: {show(a.before)} → Después: {show(a.after)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form action={weeklyAction} className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-ui">
            <input type="hidden" name="id" value={c.id} />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="weekly" defaultChecked={c.weekly_summary} className="size-4 accent-navy" /> Mandarme un resumen semanal
            </label>
            <SubmitButton variant="secondary" pendingText="…">Guardar</SubmitButton>
          </form>
        </section>
      )}

      {c && c.status === "activa" && (
        <section aria-labelledby="cerrar" className={card}>
          <h2 id="cerrar" className="text-lead font-semibold">
            Terminar la relación
          </h2>
          <p className="mt-1 text-ui text-muted">No es un portazo: queda en cierre y el estudio solo puede mirar por {READONLY_DAYS} días, mientras dejan constancia de que nadie le debe nada a nadie.</p>
          <form action={startClosingAction} className="mt-3 grid gap-2">
            <input type="hidden" name="id" value={c.id} />
            <label>
              <span className={lbl}>Motivo</span>
              <textarea name="reason" rows={2} required maxLength={1000} className={field} />
            </label>
            <div>
              <SubmitButton variant="danger" pendingText="…">Iniciar el cierre</SubmitButton>
            </div>
          </form>
        </section>
      )}

      {c && (c.status === "en_cierre" || c.status === "en_disputa") && (
        <section aria-labelledby="checklist" className={card}>
          <h2 id="checklist" className="flex items-center gap-2 text-lead font-semibold">
            <ClipboardCheck className="size-5 text-rose-deep" aria-hidden /> Checklist de cierre
          </h2>
          <ul className="mt-2 grid gap-1 text-ui">
            <li>{c.fees_zero_at ? "✓" : "○"} Honorarios en cero (lo confirma el estudio)</li>
            <li>{c.pending_delivered_at ? "✓" : "○"} Pendientes entregados (lo confirma el estudio)</li>
            <li>{c.studio_clear_at ? "✓" : "○"} El estudio: «nadie le debe nada a nadie»</li>
            <li>{c.user_clear_at ? "✓" : "○"} Vos: «nadie le debe nada a nadie»</li>
          </ul>
          {c.status === "en_cierre" && !c.user_clear_at && (
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={closingClearAction}>
                <input type="hidden" name="id" value={c.id} />
                <SubmitButton pendingText="…">Nadie le debe nada a nadie</SubmitButton>
              </form>
            </div>
          )}
          {c.status === "en_cierre" && (
            <form action={disputeAction} className="mt-3 grid gap-2 border-t border-line pt-3">
              <input type="hidden" name="id" value={c.id} />
              <label>
                <span className={lbl}>¿Hay diferencias? Contalas y queda en disputa hasta resolverlas</span>
                <textarea name="message" rows={2} required maxLength={2000} className={field} />
              </label>
              <div>
                <SubmitButton variant="secondary" pendingText="…">Abrir una disputa</SubmitButton>
              </div>
            </form>
          )}
          {messages.length > 0 && (
            <div className="mt-4 grid gap-2 border-t border-line pt-3">
              <p className="flex items-center gap-2 text-ui font-medium">
                <MessagesSquare className="size-4" aria-hidden /> Mensajes del cierre
              </p>
              <ul className="grid gap-2">
                {messages.map(({ m, name }) => (
                  <li key={m.id} className="rounded-md border border-line bg-canvas px-3 py-2 text-ui">
                    <span className="text-caption text-muted">
                      {m.side === "usuario" ? "Vos" : (name ?? "El estudio")} · {when(m.created_at)}
                    </span>
                    <span className="block">{m.body}</span>
                  </li>
                ))}
              </ul>
              {c.status === "en_disputa" && (
                <>
                  <form action={disputeMessageAction} className="grid gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <textarea name="message" rows={2} required maxLength={2000} aria-label="Mensaje" className={field} />
                    <div>
                      <SubmitButton variant="secondary" pendingText="…">Enviar</SubmitButton>
                    </div>
                  </form>
                  <form action={resolveDisputeAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <SubmitButton pendingText="…">Ya lo resolvimos: seguir con el cierre</SubmitButton>
                  </form>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {contacts.some((x) => x.c.status === "pendiente" && !x.fleetId) && (
        <section aria-labelledby="contactos" className="rounded-lg border border-rose/40 bg-rose-soft p-5">
          <h2 id="contactos" className="text-lead font-semibold">
            Estudios que quieren ser tu contador
          </h2>
          <ul className="mt-2 divide-y divide-line">
            {contacts
              .filter((x) => x.c.status === "pendiente" && !x.fleetId)
              .map((x) => (
                <li key={x.c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-ui" data-contacto>
                  <span className="min-w-0">
                    <Link href={`/red-contable/${x.slug}`} className="font-medium underline underline-offset-4">
                      {x.studio}
                    </Link>
                    {x.c.message && <span className="block text-muted">«{x.c.message}»</span>}
                  </span>
                  <form action={answerContactAction} className="flex gap-2">
                    <input type="hidden" name="id" value={x.c.id} />
                    <button className="h-10 rounded-md bg-navy px-3 text-ui text-paper hover:bg-night">Aceptar</button>
                    <button formAction={rejectContactAction} className="h-10 rounded-md border border-line px-3 text-ui hover:border-muted">
                      No, gracias
                    </button>
                  </form>
                </li>
              ))}
          </ul>
          <p className="mt-2 text-meta text-muted">Al aceptar, el estudio ve tu nombre y tus datos y empieza su admisión. Hasta entonces no sabe quién sos.</p>
        </section>
      )}

      {titular && (!c || !["activa", "en_cierre", "en_disputa"].includes(c.status)) && (
        <section aria-labelledby="disponible" className={card}>
          <h2 id="disponible" className="text-title font-semibold">
            Que los estudios te encuentren
          </h2>
          <p className="mt-1 text-ui text-muted">
            {seeker?.active ? "Estás disponible en la Red Contable: los estudios ven lo que elegiste mostrar, sin tu nombre ni tus datos." : "Activá «Disponible, busco contador» y los estudios de la Red te van a poder contactar. Vos decidís a quién responder."}
          </p>
          <Link href="/contador/disponible" className="mt-3 inline-flex h-(--control-h) items-center rounded-md border border-navy/30 px-4 text-ui font-medium text-navy hover:border-navy/60 hover:bg-navy-soft">
            {seeker?.active ? "Ver mi postulación" : "Activar «Disponible, busco contador»"}
          </Link>
        </section>
      )}

      {history.length > 0 && (
        <section aria-labelledby="historial" className={card}>
          <h2 id="historial" className="text-lead font-semibold">
            Relaciones anteriores
          </h2>
          <ul className="mt-2 grid gap-1 text-ui">
            {history.map((h) => (
              <li key={h.id}>
                {h.studio} · {STATUS_LABEL[h.status]} {h.started ? `· del ${fmt(h.started)} al ${fmt(h.closed)}` : `· ${fmt(h.created)}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {titular && !c && (
        <p className="text-meta text-muted">
          Para conectar, elegí un estudio en la{" "}
          <Link href="/red-contable" className="underline underline-offset-4">
            Red
          </Link>{" "}
          y tocá «Conectar mi cuenta», o esperá la invitación de tu estudio.
        </p>
      )}
    </div>
  );
}
