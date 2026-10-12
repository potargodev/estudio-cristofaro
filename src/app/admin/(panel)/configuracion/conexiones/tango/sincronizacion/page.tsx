import { ArrowLeftRight, Download, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { adminButton } from "@/components/admin/styles";
import { SubmitButton } from "@/components/admin/ui";
import {
  addTangoRuleAction,
  approveTangoRuleAction,
  keepFaroAction,
  keepTangoAction,
  registerTangoWebhookAction,
  rejectTangoRuleAction,
  saveTangoLinkAction,
  suggestTangoRulesAction,
  syncTangoNowAction,
} from "@/app/admin/tango-sync-actions";
import { requireAdmin } from "@/lib/auth";
import { requireModule } from "@/lib/faro/require-module";
import { documentsFor, getLink, listRules, openConflicts, syncCounts } from "@/modules/tango-sync/server";
import { fieldClass } from "@/components/ds/primitives";
import { formatAmount, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Tango · Sincronización" };

const field = `mt-1 py-2 ${fieldClass}`;
const when = (d: Date | null) => (d ? formatDate(d, "shortTime") : "—");
const DOC_STATUS: Record<string, string> = { pendiente: "Pendiente", sincronizado: "Sincronizado", error: "Con error", conflicto: "En conflicto" };
const tone = (st: string) => (st === "sincronizado" ? "activa" : st === "conflicto" || st === "error" ? "vencida" : "pendiente");
const FIELD: Record<string, string> = { cliente: "Cliente", cuenta: "Cuenta", categoria: "Categoría", total: "Total", fecha: "Fecha", comprobante: "Comprobante" };

/**
 * Tango en los dos sentidos (principios §14): lo que se factura en Faro se
 * escribe en Tango y lo que cambia en Tango llega a Faro, con los nombres
 * normalizados y cada diferencia en manos de una persona.
 */
export default async function TangoSyncPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireAdmin();
  await requireModule(me.studioId, "tango");
  const [link, docs, conflicts, rules, counts] = await Promise.all([getLink(me.studioId), documentsFor(me.studioId, 60), openConflicts(me.studioId), listRules(me.studioId), syncCounts(me.studioId)]);
  const total = (st: string) => counts.filter((c) => c.status === st).reduce((a, c) => a + c.n, 0);
  const pendingRules = rules.filter((r) => r.status === "sugerida");
  const approved = rules.filter((r) => r.status === "aprobada");

  return (
    <div className="grid max-w-5xl gap-6 [&>*]:min-w-0">
      <PageHeader
        level={2}
        title="Tango en los dos sentidos"
        description="Lo que facturás en Faro se escribe en Tango y lo que cambia en Tango llega a Faro. Una sola verdad: cada comprobante sabe dónde nació, su ID en el otro sistema y cuándo se sincronizó. Si algo no coincide, lo decidís vos."
        className="mb-0"
      />
      <p className="text-ui">
        <Link href="/admin/configuracion/conexiones/tango" className="underline underline-offset-4">
          Volver al conector local de Tango
        </Link>
      </p>
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}

      <section aria-labelledby="enlace" className="rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 id="enlace" className="text-lead font-semibold">
            Enlace con la API de Tango
          </h3>
          {link && (
            <StatusBadge status={link.status === "activo" && !link.last_error ? "activa" : "pausada"} label={link.status === "pausado" ? "Pausado" : link.last_error ? "Con error" : link.webhooks ? "Al instante (webhooks)" : "Cada 15 minutos"} />
          )}
        </div>
        {link?.last_error && <p className="mt-2 text-ui text-danger">Último error: {link.last_error}</p>}
        <form action={saveTangoLinkAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-ui">
            URL de la API
            <input name="api_url" required defaultValue={link?.api_url ?? ""} placeholder="https://tango.tuestudio.com.ar" className={field} />
          </label>
          <label className="text-ui">
            Empresa de Tango
            <input name="company_id" defaultValue={link?.company_id ?? "1"} className={field} />
          </label>
          <label className="text-ui">
            Token de la API {link && <span className="text-muted">(dejalo vacío para no cambiarlo)</span>}
            <input name="token" type="password" autoComplete="off" className={field} />
          </label>
          <label className="text-ui">
            Secreto de los webhooks {link?.webhook_secret_enc && <span className="text-muted">(ya cargado)</span>}
            <input name="webhook_secret" type="password" autoComplete="off" className={field} />
          </label>
          <label className="flex items-center gap-2 text-ui sm:col-span-2">
            <input type="checkbox" name="write_enabled" defaultChecked={link?.write_enabled ?? true} className="size-4" />
            Escribir en Tango cada factura autorizada en Faro
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <SubmitButton>Guardar enlace</SubmitButton>
          </div>
        </form>
        {link && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <form action={registerTangoWebhookAction}>
              <SubmitButton variant="secondary" pendingText="Registrando…">
                Registrar webhook
              </SubmitButton>
            </form>
            <form action={syncTangoNowAction}>
              <SubmitButton variant="secondary" pendingText="Sincronizando…">
                <RefreshCw className="size-4" aria-hidden /> Sincronizar ahora
              </SubmitButton>
            </form>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- ruta /api (descarga u OAuth): necesita navegación completa */}
            <a href="/api/integrations/tango/exportar" className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-ui font-medium hover:bg-canvas">
              <Download className="size-4" aria-hidden /> Exportar CSV para Tango
            </a>
          </div>
        )}
        <p className="mt-3 text-meta text-muted">Sin API también funciona: exportá el CSV con los nombres estándar o importá archivos desde el conector local.</p>
      </section>

      <section aria-labelledby="resumen" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <h3 id="resumen" className="sr-only">
          Resumen
        </h3>
        {(["sincronizado", "pendiente", "error", "conflicto"] as const).map((st) => (
          <div key={st} className="rounded-md border border-line bg-surface p-3">
            <p className="text-meta text-muted">{DOC_STATUS[st]}</p>
            <p className="num text-headline">{total(st)}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="conflictos" className="rounded-lg border border-line bg-surface p-5">
        <h3 id="conflictos" className="flex items-center gap-2 text-lead font-semibold">
          <ArrowLeftRight className="size-5 text-rose-deep" aria-hidden /> Diferencias para decidir
        </h3>
        <p className="mt-1 text-ui text-muted">Faro nunca pisa datos en silencio. Elegí con qué versión te quedás. Un comprobante autorizado por ARCA no se modifica: solo su copia en Tango.</p>
        {conflicts.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-line px-4 py-5 text-ui text-muted">No hay diferencias abiertas.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {conflicts.map(({ c, d }) => (
              <li key={c.id} className="rounded-md border border-line p-3" data-conflicto={c.id}>
                <p className="font-medium">
                  {d.doc_type} {d.number} · {d.customer_std}
                </p>
                <dl className="mt-2 grid gap-1 text-ui">
                  {c.fields.map((f) => (
                    <div key={f.field} className="grid grid-cols-[6rem_1fr] gap-2 sm:grid-cols-[8rem_1fr_1fr]">
                      <dt className="text-muted">{FIELD[f.field] ?? f.field}</dt>
                      <dd>Faro: {String(f.faro ?? "—")}</dd>
                      <dd className="col-start-2 sm:col-start-auto">Tango: {String(f.tango ?? "—")}</dd>
                    </div>
                  ))}
                </dl>
                <form className="mt-3 flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <button formAction={keepFaroAction} className={adminButton.secondary}>
                    Quedarme con Faro
                  </button>
                  <button formAction={keepTangoAction} className={adminButton.secondary}>
                    Quedarme con Tango
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="normalizacion" className="rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="normalizacion" className="text-lead font-semibold">
              Nombres estándar
            </h3>
            <p className="mt-1 max-w-2xl text-ui text-muted">
              Tango suele tener el mismo cliente escrito de varias formas. Faro sugiere cómo unificarlo; vos aprobás. El dato original queda guardado y nunca se borra.
            </p>
          </div>
          <form action={suggestTangoRulesAction}>
            <SubmitButton variant="secondary" pendingText="Buscando…">
              Buscar nombres para unificar
            </SubmitButton>
          </form>
        </div>
        {pendingRules.length > 0 && (
          <ul className="mt-4 grid gap-3">
            {pendingRules.map((r) => (
              <li key={r.id} className="rounded-md border border-line p-3" data-regla={r.id}>
                <p className="text-meta text-muted">
                  {FIELD[r.field] ?? r.field} · aparece como: {r.examples.join(" · ")}
                </p>
                <form className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <label className="min-w-0 flex-1 text-ui">
                    Queda como
                    <input name="standard" defaultValue={r.standard} className={field} />
                  </label>
                  <button formAction={approveTangoRuleAction} className={adminButton.primary}>Aprobar</button>
                  <button formAction={rejectTangoRuleAction} className={adminButton.secondary}>
                    Rechazar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addTangoRuleAction} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[10rem_1fr_1fr_auto] sm:items-end">
          <label className="text-ui">
            Campo
            <select name="field" className={field} defaultValue="cliente">
              <option value="cliente">Cliente</option>
              <option value="cuenta">Cuenta</option>
              <option value="categoria">Categoría</option>
            </select>
          </label>
          <label className="text-ui">
            Cómo viene
            <input name="raw" required className={field} />
          </label>
          <label className="text-ui">
            Cómo tiene que quedar
            <input name="standard" required className={field} />
          </label>
          <SubmitButton variant="secondary">Agregar regla</SubmitButton>
        </form>
        {approved.length > 0 && (
          <details className="mt-4 text-ui">
            <summary className="cursor-pointer">Reglas aprobadas ({approved.length})</summary>
            <ul className="mt-2 divide-y divide-line">
              {approved.map((r) => (
                <li key={r.id} className="py-2">
                  <span className="text-muted">{FIELD[r.field]}:</span> {r.examples.join(" · ")} → <strong>{r.standard}</strong>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section aria-labelledby="comprobantes">
        <h3 id="comprobantes" className="text-lead font-semibold">
          Comprobantes
        </h3>
        {docs.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-line px-4 py-5 text-ui text-muted">Todavía no hay comprobantes sincronizados.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
            {docs.map(({ d, org }) => (
              <li key={d.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center" data-comprobante={d.number}>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {d.doc_type} {d.number} · {d.customer_std}
                  </p>
                  <p className="text-meta text-muted">
                    Nació en {d.origin === "faro" ? "Faro" : "Tango"}
                    {org ? ` · ${org}` : ""} · ID en Tango: {d.external_id || "—"} · sincronizado: {when(d.synced_at)}
                    {d.customer_raw !== d.customer_std ? ` · original: ${d.customer_raw}` : ""}
                  </p>
                  {d.last_error && d.status === "error" && <p className="text-meta text-danger">{d.last_error}</p>}
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  <span className="num">{formatAmount(Number(d.total))}</span>
                  <StatusBadge status={tone(d.status)} label={DOC_STATUS[d.status] ?? d.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
