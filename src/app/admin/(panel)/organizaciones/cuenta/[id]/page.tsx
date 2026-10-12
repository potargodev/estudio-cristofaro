import { ClipboardCheck, History, Link2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Tag } from "@/components/admin/kit/StatusBadge";
import { SubmitButton } from "@/components/admin/ui";
import { studioCheckAction, studioCloseAction, studioDisputeAction } from "@/app/admin/conexiones-actions";
import { LiveAccount } from "@/components/conexiones/LiveAccount";
import { requireStaff } from "@/lib/auth";
import { isMonth } from "@/modules/bitacora/catalog";
import { AUTONOMY_LABEL, disputeMessages, liveView, STATUS_LABEL, studioActions, studioConnection } from "@/modules/conexiones/server";
import { fieldClass } from "@/components/ds/primitives";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Cuenta conectada" };

const field = `mt-1 py-2 ${fieldClass}`;
const card = "rounded-lg border border-line bg-surface p-5";

/**
 * Cuenta conectada (Organizaciones): el estudio trabaja sobre los datos de la
 * persona en vivo, con su permiso y el mismo formato para cualquier estudio.
 * Sin conexión, o con la conexión cerrada, no se ve nada.
 */
export default async function CuentaConectadaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await requireStaff();
  const r = await studioConnection(me, id);
  if (!r) notFound();
  const month = isMonth(sp.mes) ? sp.mes! : new Date().toISOString().slice(0, 7);
  const v = await liveView(me, r.c.id, month);
  const c = r.c;
  const volver = `/admin/organizaciones/cuenta/${c.id}`;
  const operator = me.role === "dueno" || me.role === "contador";
  if (!v || v.level === "admision")
    return (
      <div className="grid gap-4">
        <PageHeader title={r.name} description={`${STATUS_LABEL[c.status]}: el estudio no tiene acceso a los datos de esta cuenta.`} />
        <p className="text-ui text-muted">
          {c.status === "cerrada" ? `Estuvieron conectados ${c.started_at ? `del ${formatDate(c.started_at, "numeric")} al ${formatDate(c.closed_at, "numeric")}` : ""}. Los datos quedaron en la cuenta de la persona.` : "Mirá el estado en "}
          {c.status !== "cerrada" && (
            <Link href={`/admin/comercial/conexiones/${c.id}`} className="underline underline-offset-4">
              Conexiones
            </Link>
          )}
        </p>
      </div>
    );
  const [actions, messages] = await Promise.all([studioActions(me, c.id), disputeMessages(c.id)]);
  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <Link href="/admin/organizaciones" className="text-meta text-muted hover:text-ink">
        ← Organizaciones
      </Link>
      <PageHeader
        title={r.name}
        description={`${r.email} · ${AUTONOMY_LABEL[c.autonomy as "delegar" | "proponer"]}${c.autonomy === "proponer" ? ": lo que hagas queda para que lo apruebe" : ": operás y la persona ve todo"} · ${STATUS_LABEL[c.status]}`}
        actions={
          <Tag>
            <span className="inline-flex items-center gap-1">
              <Link2 className="size-3.5" aria-hidden /> Cuenta conectada
            </span>
          </Tag>
        }
        className="mb-0"
      />
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      <form method="get" className="flex items-end gap-2 text-meta">
        <label className="text-muted">
          Mes
          <input type="month" name="mes" defaultValue={month} className={field} />
        </label>
        <button className="h-10 rounded-md border border-line px-3 text-ui">Ver</button>
      </form>
      <LiveAccount v={v} volver={volver} canAct={operator} />

      <section aria-labelledby="registro" className={card}>
        <h2 id="registro" className="flex items-center gap-2 text-lead font-semibold">
          <History className="size-5 text-rose-deep" aria-hidden /> Lo que hizo el estudio
        </h2>
        <p className="mt-1 text-meta text-muted">La persona ve lo mismo en «Lo que hizo tu contador».</p>
        {actions.length === 0 ? (
          <p className="mt-2 text-ui text-muted">Todavía nada.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {actions.map((a) => (
              <li key={a.id} className="py-2 text-ui">
                {a.summary} <span className="text-muted">· {a.actor_name} · {formatDate(a.created_at, "numericTime")} · {a.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {operator && c.status === "activa" && (
        <section aria-labelledby="cierre" className={card}>
          <h2 id="cierre" className="text-lead font-semibold">
            Terminar la relación
          </h2>
          <form action={studioCloseAction} className="mt-2 grid gap-2">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="volver" value={volver} />
            <label className="text-meta text-muted">
              Motivo (lo ve la persona)
              <textarea name="reason" rows={2} required maxLength={1000} className={field} />
            </label>
            <div>
              <SubmitButton variant="danger" pendingText="…">Iniciar el cierre</SubmitButton>
            </div>
          </form>
        </section>
      )}

      {operator && (c.status === "en_cierre" || c.status === "en_disputa") && (
        <section aria-labelledby="checklist" className={card}>
          <h2 id="checklist" className="flex items-center gap-2 text-lead font-semibold">
            <ClipboardCheck className="size-5 text-rose-deep" aria-hidden /> Checklist de cierre
          </h2>
          <p className="mt-1 text-meta text-muted">Motivo: {c.closing_reason}. Solo lectura hasta el {formatDate(c.readonly_until, "numeric")}.</p>
          <ul className="mt-2 grid gap-2 text-ui">
            {(
              [
                ["honorarios", "Honorarios en cero", c.fees_zero_at],
                ["pendientes", "Pendientes entregados", c.pending_delivered_at],
                ["constancia", "Nadie le debe nada a nadie (el estudio)", c.studio_clear_at],
              ] as const
            ).map(([item, label, done]) => (
              <li key={item} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {done ? "✓" : "○"} {label}
                </span>
                {!done && c.status === "en_cierre" && (
                  <form action={studioCheckAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="item" value={item} />
                    <input type="hidden" name="volver" value={volver} />
                    <SubmitButton variant="secondary" pendingText="…">Confirmar</SubmitButton>
                  </form>
                )}
              </li>
            ))}
            <li>{c.user_clear_at ? "✓" : "○"} Nadie le debe nada a nadie (la persona)</li>
          </ul>
          {c.status === "en_cierre" && (
            <form action={studioDisputeAction} className="mt-3 grid gap-2 border-t border-line pt-3">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="op" value="abrir" />
              <input type="hidden" name="volver" value={volver} />
              <label className="text-meta text-muted">
                ¿Hay diferencias?
                <textarea name="message" rows={2} required maxLength={2000} className={field} />
              </label>
              <div>
                <SubmitButton variant="secondary" pendingText="…">Abrir una disputa</SubmitButton>
              </div>
            </form>
          )}
          {messages.length > 0 && (
            <ul className="mt-3 grid gap-2 border-t border-line pt-3">
              {messages.map(({ m, name }) => (
                <li key={m.id} className="rounded-md border border-line bg-canvas px-3 py-2 text-ui">
                  <span className="text-caption text-muted">
                    {m.side === "estudio" ? (name ?? "Estudio") : `${r.name} (cliente)`} · {formatDate(m.created_at, "numericTime")}
                  </span>
                  <span className="block">{m.body}</span>
                </li>
              ))}
            </ul>
          )}
          {c.status === "en_disputa" && (
            <div className="mt-3 grid gap-2">
              <form action={studioDisputeAction} className="grid gap-2">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="op" value="mensaje" />
                <input type="hidden" name="volver" value={volver} />
                <textarea name="message" rows={2} required maxLength={2000} aria-label="Mensaje" className={field} />
                <div>
                  <SubmitButton variant="secondary" pendingText="…">Enviar</SubmitButton>
                </div>
              </form>
              <form action={studioDisputeAction}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="op" value="resolver" />
                <input type="hidden" name="volver" value={volver} />
                <SubmitButton pendingText="…">Resuelto: seguir con el cierre</SubmitButton>
              </form>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
