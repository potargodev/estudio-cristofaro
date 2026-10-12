import { AlertTriangle, CheckCircle2, CircleHelp, Copy, Download, FileText, Files, GraduationCap, ScanText, Undo2 } from "lucide-react";
import Link from "next/link";
import { confirmDocAction, discardDocAction, forgetRuleAction, readBatchAction, readUploadAction, undoLearnedAction } from "@/app/lectura-actions";
import { LiveRefresh } from "@/components/agente/LiveRefresh";
import { Table, ToneBadge } from "@/components/ds";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { CBTE_TYPES } from "@/modules/arca/config";
import { asExtraction, DEFAULT_ACCOUNTS, FIELDS, LOW_CONFIDENCE, type Extraction, type Validation } from "@/modules/smart-docs/core";
import type { ResolvedScope } from "@/modules/smart-docs/scope";
import { batchProgress, listRules, supplierPrecision, type SmartDoc } from "@/modules/smart-docs/server";
import { LEARNED_LABEL, type Decisions, type SupplierRule } from "@/modules/smart-docs/learning";
import { TRATAMIENTOS, TRIBUTO_LABEL, tributoKey, type TributoTipo } from "@/modules/smart-docs/tributos";
import { fieldClass } from "@/components/ds/primitives";
import { formatAmountOrDash, formatDate, formatPercent, formatUsd } from "@/lib/format";

// Pantallas compartidas de la lectura inteligente: la bandeja (subir, para
// confirmar, confirmados y exportar) y la revisión de un documento.

const field = `mt-1 ${fieldClass}`;
const STATUS: Record<string, string> = { en_cola: "En cola", leyendo: "Leyendo", para_confirmar: "Para confirmar", confirmado: "Confirmado", descartado: "Descartado", error: "No se pudo leer" };

function Hidden({ r }: { r: ResolvedScope }) {
  const ambito = r.scope.scope === "organizacion" ? "estudio" : r.scope.scope;
  return (
    <>
      <input type="hidden" name="ambito" value={ambito} />
      {r.scope.scope === "organizacion" && <input type="hidden" name="org" value={r.scope.organizationId ?? ""} />}
    </>
  );
}

const exportHref = (r: ResolvedScope, formato: string) => `/api/lectura/exportar?${new URLSearchParams({ ambito: r.scope.scope === "organizacion" ? "estudio" : r.scope.scope, ...(r.scope.organizationId && r.scope.scope === "organizacion" ? { org: r.scope.organizationId } : {}), formato })}`;
const fileHref = (r: ResolvedScope, id: string) => `/api/lectura/${id}/archivo?${new URLSearchParams({ ambito: r.scope.scope === "organizacion" ? "estudio" : r.scope.scope, ...(r.scope.scope === "organizacion" && r.scope.organizationId ? { org: r.scope.organizationId } : {}) })}`;

function title(d: SmartDoc) {
  const e = asExtraction(d.extracted);
  if (!e) return d.file_name;
  const t = e.codigo_comprobante && CBTE_TYPES[e.codigo_comprobante] ? CBTE_TYPES[e.codigo_comprobante].short : e.tipo_documento;
  return `${e.razon_social_emisor ?? "Sin emisor"} · ${t}${e.numero != null ? ` ${String(e.punto_venta ?? 0).padStart(5, "0")}-${String(e.numero).padStart(8, "0")}` : ""}`;
}

export async function LecturaInbox({ r, sp, docs, ready, usage }: { r: ResolvedScope; sp: Record<string, string | undefined>; docs: SmartDoc[]; ready: { module: boolean; model: boolean }; usage?: { docs: number; usd: number; limit: number | null } }) {
  const [batches, precision, rules] = await Promise.all([batchProgress(r.scope), supplierPrecision(r.scope), listRules(r.scope)]);
  const running = batches.some((b) => b.waiting > 0);
  const pending = docs.filter((d) => d.status === "para_confirmar");
  const done = docs.filter((d) => d.status === "confirmado");
  const failed = docs.filter((d) => d.status === "error");
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      {!ready.module ? (
        <p className="rounded-md border border-line bg-surface p-4 text-ui">La lectura inteligente no está incluida en el plan. Se activa desde Plan y facturación.</p>
      ) : !ready.model ? (
        <p className="rounded-md border border-line bg-surface p-4 text-ui">Falta configurar un modelo de IA para leer documentos (IA → Proveedores en el estudio, o la IA de la plataforma en Faro).</p>
      ) : (
        <form action={readUploadAction} className="grid gap-3 rounded-md border border-line bg-surface p-4">
          <Hidden r={r} />
          <p className="flex items-start gap-2 text-ui">
            <ScanText className="mt-0.5 size-4 shrink-0 text-rose-deep" aria-hidden /> Subí una factura, un ticket o un extracto (PDF o foto). Faro lee los datos, los valida y te los deja para confirmar: nada cuenta hasta que lo confirmás.
          </p>
          <label className="text-meta text-muted">
            Archivo
            <input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="mt-1 block w-full text-ui text-ink" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingText="Leyendo…">Leer</SubmitButton>
            {usage && (
              <span className="text-meta text-muted">
                <span className="num">{usage.docs}</span>
                {usage.limit != null && <> de <span className="num">{usage.limit}</span></>} leídos este mes · costo de IA <span className="num">{formatUsd(usage.usd, 4)}</span>
              </span>
            )}
          </div>
        </form>
      )}
      {ready.module && ready.model && r.scope.canConfirm && (
        <form action={readBatchAction} className="grid gap-3 rounded-md border border-line bg-surface p-4">
          <Hidden r={r} />
          <p className="flex items-start gap-2 text-ui">
            <Files className="mt-0.5 size-4 shrink-0 text-rose-deep" aria-hidden /> Carga masiva: elegí muchos comprobantes o un ZIP (hasta 500). Se leen en cola y te quedan en «Para confirmar».
          </p>
          <label className="text-meta text-muted">
            Archivos o ZIP
            <input type="file" name="files" multiple required accept=".pdf,.jpg,.jpeg,.png,.zip,application/pdf,image/jpeg,image/png,application/zip" className="mt-1 block w-full text-ui text-ink" />
          </label>
          <div>
            <SubmitButton variant="secondary" pendingText="Subiendo…">Cargar en cola</SubmitButton>
          </div>
        </form>
      )}
      {batches.length > 0 && (
        <section aria-label="Cargas masivas" className="grid gap-2">
          <LiveRefresh active={running} />
          <h2 className="text-lead font-semibold">Cargas masivas</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {batches.map((b) => {
              const pct = b.total ? Math.round((b.read / b.total) * 100) : 100;
              return (
                <li key={b.id} className="grid gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-ui">
                    <span>
                      {formatDate(b.created_at, "dateTime")} · <span className="num">{b.total}</span> comprobantes{b.source === "zip" ? " (ZIP)" : ""}
                    </span>
                    <ToneBadge tone={b.waiting ? "progress" : b.failed ? "danger" : "ok"}>{b.waiting ? `Leyendo · faltan ${b.waiting}` : b.failed ? `Listo · ${b.failed} con error` : "Listo"}</ToneBadge>
                  </div>
                  <span role="progressbar" aria-label="Avance de la carga" aria-valuemin={0} aria-valuemax={b.total} aria-valuenow={b.read} className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                    <span className="block h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                  </span>
                  {b.skipped > 0 && <p className="text-caption text-muted">{b.skipped} archivos salteados (formato o tamaño).</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section aria-label="Para confirmar" className="grid gap-2">
        <h2 className="text-lead font-semibold">Para confirmar {pending.length > 0 && <span className="num text-muted">({pending.length})</span>}</h2>
        {pending.length === 0 ? (
          <p className="text-ui text-muted">No hay documentos esperando revisión.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {pending.map((d) => {
              const v = d.validation as unknown as Validation | null;
              const warn = d.duplicate_of || (v?.mensajes?.length ?? 0) > 0 || d.low_fields.length > 0;
              return (
                <li key={d.id}>
                  <Link href={`${r.base}/${d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                    {warn ? <AlertTriangle className="size-4 shrink-0 text-[#7a5410]" aria-hidden /> : <CheckCircle2 className="size-4 shrink-0 text-[#1f5f36]" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ui">{title(d)}</p>
                      <p className="text-caption text-muted">
                        {d.file_name}
                        {d.duplicate_of && " · parece repetido"}
                        {d.low_fields.length > 0 && ` · ${d.low_fields.length} dato${d.low_fields.length === 1 ? "" : "s"} para revisar`}
                      </p>
                    </div>
                    <span className="num text-ui">{formatAmountOrDash((asExtraction(d.extracted))?.total)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {failed.length > 0 && (
        <section aria-label="No se pudieron leer" className="grid gap-2">
          <h2 className="text-lead font-semibold">No se pudieron leer</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {failed.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-ui">{d.file_name}</p>
                  <p className="text-caption text-danger">{d.error}</p>
                </div>
                {r.scope.canConfirm && (
                  <form action={discardDocAction}>
                    <Hidden r={r} />
                    <input type="hidden" name="id" value={d.id} />
                    <SubmitButton variant="danger" pendingText="…">Quitar</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label="Confirmados" className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lead font-semibold">Confirmados</h2>
          {done.length > 0 && r.scope.scope !== "bitacora" && (
            <div className="flex flex-wrap gap-2 text-meta">
              {[
                ["csv", "CSV"],
                ["xlsx", "Planilla (XLSX)"],
                ["tango", "Tango"],
                ["xubio", "Xubio"],
              ].map(([f, l]) => (
                <a key={f} href={exportHref(r, f)} className="inline-flex h-(--control-h-sm) items-center gap-1.5 rounded-md border border-line px-2.5 hover:border-muted">
                  <Download className="size-3.5" aria-hidden /> {l}
                </a>
              ))}
            </div>
          )}
        </div>
        {done.length === 0 ? (
          <p className="text-ui text-muted">Todavía no confirmaste documentos.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {done.slice(0, 50).map((d) => (
              <li key={d.id}>
                <Link href={`${r.base}/${d.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas">
                  <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui">{title(d)}</p>
                    <p className="text-caption text-muted">
                      {d.account}
                      {d.exported_at ? " · exportado" : ""}
                    </p>
                  </div>
                  <span className="num text-ui">{formatAmountOrDash((asExtraction(d.extracted))?.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {(rules.length > 0 || precision.length > 0) && r.scope.scope !== "bitacora" && (
        <section aria-label="Proveedores aprendidos" className="grid gap-2">
          <h2 className="flex items-center gap-2 text-lead font-semibold">
            <GraduationCap className="size-5 text-rose-deep" aria-hidden /> Proveedores aprendidos
          </h2>
          <p className="text-meta text-muted">Lo que corregís al confirmar queda como regla del proveedor y se propone en el próximo comprobante. «Campos corregidos» es el promedio por comprobante: al principio y en los últimos.</p>
          <Table label="Proveedores aprendidos" minWidth={640}>
            <thead>
              <tr>
                <th scope="col">Proveedor</th>
                <th scope="col">Regla</th>
                <th scope="col" className="text-right">Comprobantes</th>
                <th scope="col" className="text-right">Campos corregidos</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {[...new Set([...rules.map((x) => x.supplier_cuit), ...precision.map((x) => x.cuit)])].map((cuit) => {
                const rule = rules.find((x) => x.supplier_cuit === cuit);
                const p = precision.find((x) => x.cuit === cuit);
                const rr = (rule?.rule ?? {}) as SupplierRule;
                const parts = [rr.account && `cuenta ${rr.account}`, rr.costCenter && `centro de costo ${rr.costCenter}`, rr.concept && `concepto ${rr.concept}`, rr.itemRate != null && `alícuota ${formatPercent(rr.itemRate, 1, false)}`, rr.treatments && Object.keys(rr.treatments).length > 0 && `${Object.keys(rr.treatments).length} tratamiento(s)`].filter(Boolean);
                return (
                  <tr key={cuit}>
                    <td>
                      <span className="block">{rule?.supplier_name ?? p?.name ?? cuit}</span>
                      <span className="num text-caption text-muted">{cuit}</span>
                    </td>
                    <td className="text-meta">{parts.length ? parts.join(" · ") : "—"}</td>
                    <td className="num text-right">{p?.docs ?? 0}</td>
                    <td className="num text-right">{p ? (p.last != null ? `${p.first.toFixed(1)} → ${p.last.toFixed(1)}` : p.first.toFixed(1)) : "—"}</td>
                    <td className="text-right">
                      {rule && r.scope.canConfirm && (
                        <form action={forgetRuleAction}>
                          <Hidden r={r} />
                          <input type="hidden" name="rule" value={rule.id} />
                          <SubmitButton variant="secondary" pendingText="…" confirm={`¿Olvidar lo aprendido de ${rule.supplier_name ?? cuit}?`}>
                            Olvidar
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </section>
      )}
    </div>
  );
}

const CHECK: Record<string, { label: string; tone: string }> = {
  ok: { label: "válido", tone: "text-[#1f5f36]" },
  error: { label: "con error", tone: "text-danger" },
  sin_dato: { label: "sin dato", tone: "text-muted" },
  no_verificado: { label: "sin verificar", tone: "text-muted" },
};

export function LecturaReview({ r, d, sp }: { r: ResolvedScope; d: SmartDoc; sp: Record<string, string | undefined> }) {
  const e = asExtraction(d.extracted);
  const v = d.validation as unknown as Validation | null;
  const editable = d.status === "para_confirmar" && r.scope.canConfirm;
  const low = new Set(d.low_fields);
  const dec = d.decisions as unknown as Decisions | null;
  const learned = d.learned;
  const value = (k: keyof Extraction) => {
    const x = e?.[k];
    return x == null ? "" : typeof x === "number" ? String(x) : String(x);
  };
  return (
    <div className="grid gap-4">
      <Link href={r.base} className="text-meta text-muted hover:text-ink">
        ← {r.title}
      </Link>
      <Feedback sp={sp} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-title font-semibold">{title(d)}</h2>
        <span className="rounded-md bg-navy-soft px-2 py-0.5 text-caption">{STATUS[d.status] ?? d.status}</span>
      </div>
      <p className="text-meta text-muted">
        <a href={fileHref(r, d.id)} className="underline">
          {d.file_name}
        </a>
        {d.model && ` · leído con ${d.model}`}
        {d.synced_at && ` el ${formatDate(d.synced_at, "numericTime")}`}
        {d.confidence && ` · confianza ${Math.round(Number(d.confidence) * 100)}%`}
      </p>
      {d.duplicate_of && (
        <p role="alert" className="flex gap-2 rounded-md border border-[#e3cf9f] bg-[#fbf5e6] px-4 py-3 text-ui text-[#7a5410]">
          <Copy className="mt-0.5 size-4 shrink-0" aria-hidden /> Parece el mismo comprobante que{" "}
          <Link href={`${r.base}/${d.duplicate_of}`} className="underline">
            otro ya leído
          </Link>
          . Confirmalo solo si es otro distinto.
        </p>
      )}
      {learned && learned.fields.length > 0 && !learned.undone && d.status === "para_confirmar" && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-navy-soft px-4 py-3 text-ui">
          <span className="flex gap-2">
            <GraduationCap className="mt-0.5 size-4 shrink-0 text-rose-deep" aria-hidden />
            <span>
              <strong className="font-semibold">Aprendido de tus correcciones:</strong> {learned.fields.map((f) => LEARNED_LABEL[f] ?? f).join(", ")} de este proveedor.
            </span>
          </span>
          {r.scope.canConfirm && (
            <form action={undoLearnedAction}>
              <Hidden r={r} />
              <input type="hidden" name="id" value={d.id} />
              <SubmitButton variant="secondary" pendingText="…">
                <Undo2 className="size-4" aria-hidden /> Deshacer
              </SubmitButton>
            </form>
          )}
        </div>
      )}
      {v && (
        <section aria-label="Validaciones" className="grid gap-1 rounded-md border border-line bg-surface p-4 text-ui">
          <p>
            CUIT: <span className={CHECK[v.cuit]?.tone}>{CHECK[v.cuit]?.label}</span>
            {v.arca?.cuit && <span className="text-muted"> · ARCA: {v.arca.cuit === "activo" ? "activo" : v.arca.cuit === "inexistente" ? "no registrado" : "sin respuesta"}</span>}
          </p>
          <p>
            CAE: <span className={CHECK[v.cae]?.tone}>{CHECK[v.cae]?.label}</span>
            {v.arca?.cae && <span className="text-muted"> · ARCA: {v.arca.cae === "autorizado" ? "autorizado" : v.arca.cae === "no_encontrado" ? "no encontrado" : "sin respuesta"}</span>}
            {!v.arca && <span className="text-muted"> · sin consulta a ARCA</span>}
          </p>
          <p>
            Totales: <span className={CHECK[v.totales]?.tone}>{CHECK[v.totales]?.label}</span>
          </p>
          {v.items && (
            <p>
              Ítems contra el neto: <span className={CHECK[v.items]?.tone}>{CHECK[v.items]?.label}</span>
            </p>
          )}
          {v.mensajes.map((m) => (
            <p key={m} className="flex gap-1.5 text-meta text-danger">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {m}
            </p>
          ))}
        </section>
      )}
      {e && (
        <form action={confirmDocAction} className="grid gap-3 rounded-md border border-line bg-surface p-4">
          <Hidden r={r} />
          <input type="hidden" name="id" value={d.id} />
          <div className="grid gap-2 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className={`text-meta ${low.has(f.key) ? "text-[#7a5410]" : "text-muted"}`}>
                {f.label}
                {low.has(f.key) && (
                  <span className="ml-1 inline-flex items-center gap-0.5">
                    <CircleHelp className="size-3" aria-hidden /> revisar
                  </span>
                )}
                {typeof e.confianza?.[f.key] === "number" && e.confianza[f.key] < LOW_CONFIDENCE && <span className="sr-only"> (confianza baja)</span>}
                <input name={f.key} defaultValue={value(f.key)} disabled={!editable} type={f.kind === "date" ? "date" : "text"} inputMode={f.kind === "money" ? "decimal" : f.kind === "int" ? "numeric" : undefined} className={`${field} ${low.has(f.key) ? "border-[#d6a32a]" : ""}`} />
              </label>
            ))}
          </div>
          {e.iva.length > 0 && <p className="text-meta text-muted">{e.iva.map((x) => `IVA ${x.alicuota}%: ${formatAmountOrDash(x.importe)}`).join(" · ")}</p>}
          {e.items.length > 0 && (
            <Table label="Ítems" minWidth={560}>
              <thead>
                <tr>
                  <th scope="col">Ítem</th>
                  <th scope="col">Código</th>
                  <th scope="col" className="text-right">Cantidad</th>
                  <th scope="col" className="text-right">Precio unitario</th>
                  <th scope="col" className="text-right">Alícuota</th>
                </tr>
              </thead>
              <tbody>
                {e.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.descripcion}</td>
                    <td className="num">{it.codigo ?? "—"}</td>
                    <td className="num text-right">{it.cantidad ?? "—"}</td>
                    <td className="num text-right">{formatAmountOrDash(it.precio_unitario)}</td>
                    <td className="text-right">
                      <select name={`item_alicuota_${i}`} defaultValue={it.alicuota == null ? "" : String(it.alicuota)} disabled={!editable} aria-label={`Alícuota de ${it.descripcion}`} className={`${fieldClass} h-(--control-h-sm) w-24`} data-free>
                        <option value="">—</option>
                        {[0, 2.5, 5, 10.5, 21, 27].map((x) => (
                          <option key={x} value={x}>
                            {x} %
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {(e.percepciones.length > 0 || e.retenciones.length > 0) && (
            <Table label="Percepciones, retenciones y otros tributos" minWidth={560}>
              <thead>
                <tr>
                  <th scope="col">Concepto</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Jurisdicción</th>
                  <th scope="col" className="text-right">Importe</th>
                  <th scope="col">Tratamiento</th>
                </tr>
              </thead>
              <tbody>
                {[...e.percepciones.map((x) => ({ ...x, ret: false })), ...e.retenciones.map((x) => ({ ...x, ret: true }))].map((x, i) => {
                  const k = tributoKey(x);
                  return (
                    <tr key={i}>
                      <td>
                        {x.concepto}
                        {x.ret && <span className="text-caption text-muted"> · retención</span>}
                      </td>
                      <td>{TRIBUTO_LABEL[(x.tipo ?? "otros") as TributoTipo]}</td>
                      <td>{x.jurisdiccion ?? "—"}</td>
                      <td className="num text-right">{formatAmountOrDash(x.importe)}</td>
                      <td>
                        <select name={`tratamiento_${k}`} defaultValue={dec?.treatments?.[k] ?? ""} disabled={!editable} aria-label={`Tratamiento de ${x.concepto}`} className={`${fieldClass} h-(--control-h-sm) w-full`} data-free>
                          {Object.entries(TRATAMIENTOS).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          {r.scope.scope !== "bitacora" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-meta text-muted">
                Centro de costo
                <input name="cost_center" defaultValue={dec?.costCenter ?? ""} disabled={!editable} maxLength={80} className={field} />
              </label>
              <label className="text-meta text-muted">
                Concepto
                <input name="concept" defaultValue={dec?.concept ?? ""} disabled={!editable} maxLength={80} className={field} />
              </label>
            </div>
          )}
          <label className="text-meta text-muted">
            {r.scope.scope === "bitacora" ? "Categoría" : "Cuenta de la planilla"}
            <input name="account" list="cuentas" defaultValue={d.account ?? ""} disabled={!editable} className={field} />
            <datalist id="cuentas">
              {DEFAULT_ACCOUNTS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>
          {editable && d.duplicate_of && (
            <label className="flex items-center gap-2 text-meta">
              <input type="checkbox" name="allow_duplicate" /> Es otro comprobante, confirmalo igual
            </label>
          )}
          {editable && (
            <div>
              <SubmitButton pendingText="Confirmando…">Confirmar</SubmitButton>
            </div>
          )}
        </form>
      )}
      {editable && (
        <form action={discardDocAction}>
          <Hidden r={r} />
          <input type="hidden" name="id" value={d.id} />
          <SubmitButton variant="danger" pendingText="…">Descartar</SubmitButton>
        </form>
      )}
      {d.status === "error" && <p className="text-ui text-danger">{d.error}</p>}
    </div>
  );
}
