import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { acceptConnectionAction, rejectConnectionAction, infoAction, interviewAction, studioSignAction } from "@/app/admin/conexiones-actions";
import { LiveAccount } from "@/components/conexiones/LiveAccount";
import { requireStaff } from "@/lib/auth";
import { AUTONOMY_LABEL, liveView, STATUS_LABEL, studioConnection } from "@/modules/conexiones/server";
import { fieldClass } from "@/components/ds/primitives";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Admisión" };

const field = `mt-1 py-2 ${fieldClass}`;
const card = "rounded-lg border border-line bg-surface p-5";

/** Admisión (§7): resumen de lo autorizado, entrevista o información, aceptar o rechazar con motivo y firmar el acuerdo */
export default async function AdmisionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await requireStaff();
  const r = await studioConnection(me, id);
  if (!r) notFound();
  const { c, name, email } = r;
  const volver = `/admin/comercial/conexiones/${c.id}`;
  const v = await liveView(me, c.id, new Date().toISOString().slice(0, 7));
  const operator = me.role === "dueno" || me.role === "contador";
  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <Link href="/admin/comercial/conexiones" className="text-meta text-muted hover:text-ink">
        ← Conexiones
      </Link>
      <PageHeader level={2} title={name} description={`${email} · ${STATUS_LABEL[c.status]} · ${c.initiated_by === "usuario" ? "la pidió la persona" : "la invitó el estudio"} · comparte la caja de negocio y lo fiscal${c.scope_personal ? " y sus cajas personales" : ""} · ${AUTONOMY_LABEL[c.autonomy as "delegar" | "proponer"]}`} className="mb-0" />
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {c.message && <p className={card}>«{c.message}»</p>}
      {(c.status === "activa" || c.status === "en_cierre" || c.status === "en_disputa") && (
        <Link href={`/admin/organizaciones/cuenta/${c.id}`} className="text-ui font-medium text-rose-deep underline underline-offset-4">
          Abrir la cuenta conectada
        </Link>
      )}
      {c.status === "rechazada" && <p className={card}>No aceptada. Motivo: {c.decision_reason}</p>}

      {c.status === "admision" && operator && (
        <section aria-labelledby="admision" className={`${card} grid gap-4`}>
          <h3 id="admision" className="text-lead font-semibold">
            Admisión
          </h3>
          <form action={interviewAction} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="volver" value={volver} />
            <label className="text-meta text-muted">
              Pedir una entrevista (elige horario en tu agenda)
              <input name="note" maxLength={500} defaultValue={c.interview_note ?? ""} className={field} />
            </label>
            <SubmitButton variant="secondary" pendingText="…">{c.interview_requested_at ? "Volver a pedir" : "Pedir entrevista"}</SubmitButton>
          </form>
          <form action={infoAction} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="volver" value={volver} />
            <label className="text-meta text-muted">
              Pedir más información
              <input name="question" maxLength={2000} defaultValue={c.info_request ?? ""} className={field} />
            </label>
            <SubmitButton variant="secondary" pendingText="…">Pedir</SubmitButton>
          </form>
          {c.info_response && <p className="text-ui">Respondió: «{c.info_response}»</p>}
          <form action={acceptConnectionAction} className="grid gap-2 border-t border-line pt-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="volver" value={volver} />
            <label className="text-meta text-muted sm:col-span-2">
              Servicios que incluye el acuerdo
              <textarea name="services" rows={2} maxLength={2000} placeholder="Ej.: monotributo, recategorización, facturación y vencimientos" className={field} />
            </label>
            <label className="text-meta text-muted">
              Honorarios por mes ($)
              <input name="price" inputMode="decimal" className={field} />
            </label>
            <label className="text-meta text-muted">
              Preaviso de baja (días)
              <input name="notice" type="number" min={0} max={90} defaultValue={30} className={field} />
            </label>
            <label className="text-meta text-muted sm:col-span-2">
              Motivo o mensaje (obligatorio si rechazás)
              <input name="reason" maxLength={1000} className={field} />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button className="h-10 rounded-md bg-navy px-4 text-ui text-paper hover:bg-night">
                Aceptar y pasar al acuerdo
              </button>
              <button formAction={rejectConnectionAction} className="h-10 rounded-md border border-danger/40 px-4 text-ui text-danger hover:bg-danger/10">
                Rechazar
              </button>
            </div>
          </form>
        </section>
      )}

      {c.status === "acuerdo" && c.terms && (
        <section aria-labelledby="acuerdo" className={`${card} grid gap-2 text-ui`}>
          <h3 id="acuerdo" className="text-lead font-semibold">
            Acuerdo de servicio
          </h3>
          <p>{c.terms.services}</p>
          <p className="text-muted">
            Honorarios <span className="num">{formatMoney(c.terms.monthlyPrice * 100, "ARS", { decimals: "auto" })}</span> por mes · preaviso {c.terms.noticeDays} días · {c.user_signed_at ? `firmó ${c.user_signed_name}` : "falta la firma de la persona"} · {c.studio_signed_at ? `firmó el estudio (${c.studio_signed_name})` : "falta la firma del estudio"}
          </p>
          {!c.studio_signed_at && operator && (
            <form action={studioSignAction} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="volver" value={volver} />
              <label className="text-meta text-muted">
                Firmá en nombre del estudio (tu nombre)
                <input name="signed_name" required defaultValue={me.name} className={field} />
              </label>
              <SubmitButton pendingText="…">Firmar</SubmitButton>
            </form>
          )}
        </section>
      )}

      {v && (
        <>
          <h3 className="text-lead font-semibold">Lo que autorizó a ver</h3>
          <LiveAccount v={v} volver={volver} canAct={false} />
        </>
      )}
    </div>
  );
}
