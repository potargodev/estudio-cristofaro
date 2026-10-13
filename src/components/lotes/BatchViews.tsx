import { FileDown, FileSpreadsheet, Layers, Mail, MessageCircle, Pause, Play, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { batchAction, createBatchAction } from "@/app/lotes-actions";
import { LiveRefresh } from "@/components/agente/LiveRefresh";
import { Feedback } from "@/components/app/Feedback";
import { Button, EmptyState, Panel, SubmitButton, Table, ToneBadge, chipClass, fieldClass } from "@/components/ds";
import { WhatsAppBatch } from "@/components/share/WhatsAppShare";
import { formatAmount, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fullNumber } from "@/modules/arca/calc";
import { CBTE_TYPES } from "@/modules/arca/config";
import type { BatchRow } from "@/modules/lotes/core";
import { listBatches, progressOf, rowsOf, type BatchScope } from "@/modules/lotes/server";

// Facturación en lote (§2.p, B2): subir o pegar la planilla, ver la
// validación fila por fila, emitir con progreso en vivo y descargar el
// informe, el ZIP de PDF o mandarlos por mail o WhatsApp.

type SP = Record<string, string | undefined>;
const BATCH_STATUS: Record<string, { label: string; tone: "ok" | "progress" | "neutral" | "danger" | "done" }> = {
  validado: { label: "Validado", tone: "neutral" },
  en_curso: { label: "En curso", tone: "progress" },
  pausado: { label: "En pausa", tone: "neutral" },
  terminado: { label: "Terminado", tone: "done" },
  cancelado: { label: "Cancelado", tone: "neutral" },
};
const ROW_STATUS: Record<string, { label: string; tone: "ok" | "progress" | "neutral" | "danger" | "done" }> = {
  invalida: { label: "Con errores", tone: "danger" },
  pendiente: { label: "Pendiente", tone: "neutral" },
  procesando: { label: "Procesando", tone: "progress" },
  borrador: { label: "Borrador", tone: "ok" },
  emitida: { label: "Emitida", tone: "done" },
  en_cola: { label: "En cola (ARCA)", tone: "progress" },
  fallida: { label: "Con error", tone: "danger" },
  omitida: { label: "Omitida", tone: "neutral" },
};
const TEMPLATE = "cuit_emisor;punto_venta;tipo;fecha;cliente;documento;condicion_iva;email;telefono;descripcion;cantidad;precio;alicuota;grupo";

export async function BatchHome({ scope, base, sp }: { scope: BatchScope; base: string; sp: SP }) {
  const list = await listBatches(scope);
  const columns = scope.organizationId ? TEMPLATE.replace("cuit_emisor;", "") : TEMPLATE;
  return (
    <div className="grid gap-5">
      <Feedback sp={sp} />
      <Panel title="Nuevo lote" icon={Layers}>
        <form action={createBatchAction} className="grid gap-3 sm:grid-cols-2">
          <label className="text-meta text-muted">
            Nombre del lote
            <input name="name" placeholder="Abonos de octubre" className={cn(fieldClass, "mt-1")} />
          </label>
          <label className="text-meta text-muted">
            Planilla (Excel .xlsx o CSV)
            <input type="file" name="file" accept=".xlsx,.csv,.txt" className={cn(fieldClass, "mt-1 h-auto py-1.5")} />
          </label>
          <label className="text-meta text-muted sm:col-span-2">
            O pegá las filas (con la fila de encabezados; columnas separadas por punto y coma o tabulación)
            <textarea name="text" rows={5} placeholder={columns} className={cn(fieldClass, "mt-1 py-2 font-mono text-meta")} />
          </label>
          <fieldset className="grid gap-2 sm:col-span-2">
            <legend className="text-meta text-muted">Qué hacer con los comprobantes</legend>
            <label className="flex items-start gap-2 text-ui">
              <input type="radio" name="mode" value="borradores" defaultChecked className="mt-0.5 size-4 accent-navy" /> Dejarlos en borrador para revisar
            </label>
            {scope.canEmit && (
              <label className="flex items-start gap-2 text-ui">
                <input type="radio" name="mode" value="emitir" className="mt-0.5 size-4 accent-navy" /> Emitirlos en ARCA cuando confirme el lote (después de ver la validación)
              </label>
            )}
          </fieldset>
          <p className="text-caption text-muted sm:col-span-2">
            Columnas: {columns.split(";").join(", ")}. Solo son obligatorias {scope.organizationId ? "" : "la CUIT emisora, "}la descripción y el precio; sin documento es consumidor final. Las filas con el mismo «grupo» son un comprobante con varios ítems.
          </p>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Validando…">Validar el lote</SubmitButton>
          </div>
        </form>
      </Panel>
      <Panel title="Lotes" icon={FileSpreadsheet} bodyClassName="p-0">
        {list.length === 0 ? (
          <div className="p-4 sm:p-5">
            <EmptyState icon={Layers} title="Todavía no hay lotes" text="Subí una planilla: Faro valida cada fila antes de emitir." />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((b) => (
              <li key={b.id}>
                <Link href={`${base}/${b.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-canvas">
                  <span className="min-w-0">
                    <span className="block truncate text-body text-ink">{b.name}</span>
                    <span className="block text-meta text-muted">
                      {formatDate(b.created_at.toISOString().slice(0, 10), "numeric")} · {b.rows_valid} de {b.rows_total} filas válidas · {b.mode === "emitir" ? "para emitir" : "en borrador"}
                    </span>
                  </span>
                  <ToneBadge tone={BATCH_STATUS[b.status]?.tone ?? "neutral"}>{BATCH_STATUS[b.status]?.label ?? b.status}</ToneBadge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export async function BatchDetail({ scope, base, id, sp }: { scope: BatchScope; base: string; id: string; sp: SP }) {
  const p = await progressOf(scope, id).catch(() => null);
  if (!p) return <EmptyState icon={Layers} title="No encontramos ese lote" text="Volvé a la lista de lotes." />;
  const rows = await rowsOf(scope, id, { limit: 400 });
  const b = p.batch;
  const live = b.status === "en_curso";
  const can = (b.mode === "borradores" || scope.canEmit) && ["validado", "pausado"].includes(b.status);
  const hidden = <input type="hidden" name="id" value={b.id} />;
  const counts: [string, number][] = Object.entries(ROW_STATUS)
    .map(([k]) => [k, p.by[k] ?? 0] as [string, number])
    .filter(([, n]) => n > 0);
  return (
    <div className="grid gap-5">
      <LiveRefresh active={live} />
      <Link href={base} className="text-meta text-muted hover:text-ink">
        ← Lotes
      </Link>
      <Feedback sp={sp} />
      <WhatsAppBatch batch={sp.lote} />
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-title font-semibold">{b.name}</h2>
        <ToneBadge tone={BATCH_STATUS[b.status]?.tone ?? "neutral"}>{BATCH_STATUS[b.status]?.label ?? b.status}</ToneBadge>
        <span className="text-meta text-muted">{b.mode === "emitir" ? "Se emiten en ARCA" : "Quedan en borrador"}</span>
      </div>
      <div className="grid gap-2 rounded-md border border-line bg-surface p-4">
        <div className="flex items-center justify-between text-ui">
          <span>
            {p.done} de {p.total} procesados
          </span>
          <span className="num">{p.pct} %</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso del lote">
          <div className="h-full bg-navy transition-[width]" style={{ width: `${p.pct}%` }} />
        </div>
        <div className="flex flex-wrap gap-2">
          {counts.map(([k, n]) => (
            <ToneBadge key={k} tone={ROW_STATUS[k].tone}>
              {ROW_STATUS[k].label}: {n}
            </ToneBadge>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {can && (
          <form action={batchAction}>
            {hidden}
            <input type="hidden" name="op" value="emitir" />
            <SubmitButton pendingText="…" confirm={b.mode === "emitir" ? `¿Emitir en ARCA los ${b.rows_valid} comprobantes válidos del lote?` : undefined} confirmLabel="Emitir">
              <Play className="size-4" aria-hidden /> {b.status === "pausado" ? "Reanudar" : b.mode === "emitir" ? `Emitir ${b.rows_valid}` : `Crear ${b.rows_valid} borradores`}
            </SubmitButton>
          </form>
        )}
        {live && (
          <form action={batchAction}>
            {hidden}
            <input type="hidden" name="op" value="pausar" />
            <SubmitButton variant="secondary" pendingText="…">
              <Pause className="size-4" aria-hidden /> Pausar
            </SubmitButton>
          </form>
        )}
        {["validado", "pausado", "en_curso"].includes(b.status) && (
          <form action={batchAction}>
            {hidden}
            <input type="hidden" name="op" value="cancelar" />
            <SubmitButton variant="secondary" pendingText="…" confirm="¿Cancelar el lote? Lo que ya se emitió queda." confirmLabel="Cancelar el lote">
              <X className="size-4" aria-hidden /> Cancelar
            </SubmitButton>
          </form>
        )}
        {(p.by.fallida ?? 0) > 0 && (
          <form action={batchAction}>
            {hidden}
            <input type="hidden" name="op" value="reintentar" />
            <SubmitButton variant="secondary" pendingText="…">
              <RotateCcw className="size-4" aria-hidden /> Reintentar los {p.by.fallida} con error
            </SubmitButton>
          </form>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/api/lotes/${b.id}?formato=xlsx`} className={chipClass(false)}>
          <FileSpreadsheet className="size-3.5" aria-hidden /> Informe en Excel
        </a>
        <a href={`/api/lotes/${b.id}?formato=pdf`} className={chipClass(false)}>
          Informe en PDF
        </a>
        {(p.by.emitida ?? 0) > 0 && (
          <>
            <a href={`/api/lotes/${b.id}?formato=zip`} className={chipClass(false)}>
              <FileDown className="size-3.5" aria-hidden /> ZIP con los PDF
            </a>
            <form action={batchAction}>
              {hidden}
              <input type="hidden" name="op" value="mail" />
              <Button type="submit" variant="outline" size="sm">
                <Mail className="size-4" aria-hidden /> Mandar por mail a cada cliente
              </Button>
            </form>
            <form action={batchAction}>
              {hidden}
              <input type="hidden" name="op" value="whatsapp" />
              <Button type="submit" variant="outline" size="sm">
                <MessageCircle className="size-4" aria-hidden /> Por WhatsApp a los teléfonos
              </Button>
            </form>
          </>
        )}
      </div>
      <Table label="Filas del lote" minWidth={760}>
        <thead>
          <tr className="border-b border-line text-meta text-muted">
            <th className="px-3 py-2 font-medium">Fila</th>
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium">Comprobante o detalle</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ r, inv }) => {
            const d = r.data as unknown as Partial<BatchRow>;
            const total = inv ? Number(inv.total) : (d.items ?? []).reduce((t, x) => t + x.quantity * x.unitPrice, 0);
            const st = ROW_STATUS[r.status] ?? ROW_STATUS.pendiente;
            return (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <td className="num px-3 py-2 text-muted">{r.row_number}</td>
                <td className="px-3 py-2">{inv?.customer_name ?? d.customerName ?? "—"}</td>
                <td className="num px-3 py-2 text-right">{total ? formatAmount(total) : "—"}</td>
                <td className="px-3 py-2">
                  <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
                </td>
                <td className="px-3 py-2 text-meta">
                  {inv?.number ? `${CBTE_TYPES[inv.cbte_type]?.label ?? ""} ${fullNumber(inv.point_of_sale, inv.number)}` : inv?.reserved_number ? `Número previsto ${inv.reserved_number}` : null}
                  {(r.errors.length > 0 || r.last_error) && <span className="block text-danger">{r.errors.length ? r.errors.join(" · ") : r.last_error}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {b.rows_total > rows.length && <p className="text-meta text-muted">Se muestran las primeras {rows.length} filas; el informe en Excel tiene todas.</p>}
    </div>
  );
}
