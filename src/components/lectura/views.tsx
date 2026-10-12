import { AlertTriangle, CheckCircle2, CircleHelp, Copy, Download, FileText, ScanText } from "lucide-react";
import Link from "next/link";
import { confirmDocAction, discardDocAction, readUploadAction } from "@/app/lectura-actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { CBTE_TYPES } from "@/modules/arca/config";
import { DEFAULT_ACCOUNTS, FIELDS, LOW_CONFIDENCE, type Extraction, type Validation } from "@/modules/smart-docs/core";
import type { ResolvedScope } from "@/modules/smart-docs/scope";
import type { SmartDoc } from "@/modules/smart-docs/server";
import { fieldClass } from "@/components/ds/primitives";

// Pantallas compartidas de la lectura inteligente: la bandeja (subir, para
// confirmar, confirmados y exportar) y la revisión de un documento.

const field = `mt-1 ${fieldClass}`;
const ars = (n: number | null | undefined) => (n == null ? "—" : `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const STATUS: Record<string, string> = { leyendo: "Leyendo", para_confirmar: "Para confirmar", confirmado: "Confirmado", descartado: "Descartado", error: "No se pudo leer" };

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
  const e = d.extracted as unknown as Extraction | null;
  if (!e) return d.file_name;
  const t = e.codigo_comprobante && CBTE_TYPES[e.codigo_comprobante] ? CBTE_TYPES[e.codigo_comprobante].short : e.tipo_documento;
  return `${e.razon_social_emisor ?? "Sin emisor"} · ${t}${e.numero != null ? ` ${String(e.punto_venta ?? 0).padStart(5, "0")}-${String(e.numero).padStart(8, "0")}` : ""}`;
}

export function LecturaInbox({ r, sp, docs, ready, usage }: { r: ResolvedScope; sp: Record<string, string | undefined>; docs: SmartDoc[]; ready: { module: boolean; model: boolean }; usage?: { docs: number; usd: number; limit: number | null } }) {
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
                {usage.limit != null && <> de <span className="num">{usage.limit}</span></>} leídos este mes · costo de IA <span className="num">US$ {usage.usd.toFixed(4)}</span>
              </span>
            )}
          </div>
        </form>
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
                    {warn ? <AlertTriangle className="size-4 shrink-0 text-[#b7791f]" aria-hidden /> : <CheckCircle2 className="size-4 shrink-0 text-[#1f6b3d]" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ui">{title(d)}</p>
                      <p className="text-caption text-muted">
                        {d.file_name}
                        {d.duplicate_of && " · parece repetido"}
                        {d.low_fields.length > 0 && ` · ${d.low_fields.length} dato${d.low_fields.length === 1 ? "" : "s"} para revisar`}
                      </p>
                    </div>
                    <span className="num text-ui">{ars((d.extracted as unknown as Extraction | null)?.total)}</span>
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
                  <p className="text-caption text-[#8f2a1c]">{d.error}</p>
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
                  <span className="num text-ui">{ars((d.extracted as unknown as Extraction | null)?.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const CHECK: Record<string, { label: string; tone: string }> = {
  ok: { label: "válido", tone: "text-[#1f6b3d]" },
  error: { label: "con error", tone: "text-[#8f2a1c]" },
  sin_dato: { label: "sin dato", tone: "text-muted" },
  no_verificado: { label: "sin verificar", tone: "text-muted" },
};

export function LecturaReview({ r, d, sp }: { r: ResolvedScope; d: SmartDoc; sp: Record<string, string | undefined> }) {
  const e = d.extracted as unknown as Extraction | null;
  const v = d.validation as unknown as Validation | null;
  const editable = d.status === "para_confirmar" && r.scope.canConfirm;
  const low = new Set(d.low_fields);
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
        {d.synced_at && ` el ${d.synced_at.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}`}
        {d.confidence && ` · confianza ${Math.round(Number(d.confidence) * 100)}%`}
      </p>
      {d.duplicate_of && (
        <p role="alert" className="flex gap-2 rounded-md border border-[#ecd6a8] bg-[#fbf3e2] px-4 py-3 text-ui text-[#7a5410]">
          <Copy className="mt-0.5 size-4 shrink-0" aria-hidden /> Parece el mismo comprobante que{" "}
          <Link href={`${r.base}/${d.duplicate_of}`} className="underline">
            otro ya leído
          </Link>
          . Confirmalo solo si es otro distinto.
        </p>
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
          {v.mensajes.map((m) => (
            <p key={m} className="flex gap-1.5 text-meta text-[#8f2a1c]">
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
          {(e.iva.length > 0 || e.percepciones.length > 0) && (
            <p className="text-meta text-muted">
              {e.iva.map((x) => `IVA ${x.alicuota}%: ${ars(x.importe)}`).join(" · ")}
              {e.percepciones.length > 0 && ` · ${e.percepciones.map((x) => `${x.concepto}: ${ars(x.importe)}`).join(" · ")}`}
            </p>
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
      {d.status === "error" && <p className="text-ui text-[#8f2a1c]">{d.error}</p>}
    </div>
  );
}
