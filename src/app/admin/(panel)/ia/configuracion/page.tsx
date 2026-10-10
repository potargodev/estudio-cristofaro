import { and, desc, eq, gte, sql } from "drizzle-orm";
import { CheckCircle2, CircleDashed, Cpu, Gauge, KeyRound, Plus, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { deleteProvider, saveAiSettings, saveProvider, testProvider, toggleProvider } from "@/app/admin/ai-actions";
import { AdminField, Notice } from "@/components/admin/AdminField";
import { ModelSelect, ProviderForm } from "@/components/admin/ai/ProviderForm";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { EmptyState, Panel } from "@/components/admin/kit/Panel";
import { Tag } from "@/components/admin/kit/StatusBadge";
import { SubmitButton } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { getDb } from "@/db";
import { ai_usage } from "@/db/schema";
import { AI_PROVIDER_KINDS, AI_TASKS, PROVIDERS, modelKey, type AiProviderKind, type AiTaskKey } from "@/lib/ai/catalog";
import { getAiSettings, getProviders, monthSpend } from "@/lib/ai/models";
import { priceFor } from "@/lib/ai/pricing";
import { requireTenantOwner } from "@/lib/auth";
import { encryptionEnabled } from "@/lib/crypto";
import { iaTabs } from "../tabs";

export const metadata: Metadata = { title: "Configuración de IA" };

const ERRORS: Record<string, string> = {
  cifrado: "Falta ENCRYPTION_KEY en el servidor: sin ella no se pueden guardar claves de forma segura.",
  proveedor: "Ese proveedor no existe.",
  url: "Revisá la URL base (tiene que empezar con http:// o https://).",
  clave: "Falta la clave de API.",
  azure: "Para Azure OpenAI completá el nombre del recurso o una URL base.",
  presupuesto: "Revisá el límite de gasto (un número en dólares).",
};

const fmtDate = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const usd = (n: number) => `US$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;

export default async function IaConfigPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const admin = await requireTenantOwner();
  const db = getDb();
  const [providers, settings, spend, byModel] = await Promise.all([
    getProviders(admin.studioId),
    getAiSettings(admin.studioId),
    monthSpend(admin.studioId),
    db
      .select({
        model: ai_usage.model,
        kind: ai_usage.provider_kind,
        calls: sql<number>`count(*)::int`,
        input: sql<number>`coalesce(sum(${ai_usage.input_tokens}), 0)::int`,
        output: sql<number>`coalesce(sum(${ai_usage.output_tokens}), 0)::int`,
        cost: sql<string>`coalesce(sum(${ai_usage.cost_usd}), 0)`,
      })
      .from(ai_usage)
      .where(and(eq(ai_usage.studio_id, admin.studioId), gte(ai_usage.created_at, new Date(Date.now() - 30 * 86400000))))
      .groupBy(ai_usage.model, ai_usage.provider_kind)
      .orderBy(desc(sql`sum(${ai_usage.cost_usd})`)),
  ]);
  const modelOptions = providers.flatMap((p) => (p.settings.models ?? []).map((m) => ({ value: modelKey(p.id, m), label: `${m} · ${p.name}` })));
  const ref = (r?: { providerId: string; model: string } | null) => (r ? modelKey(r.providerId, r.model) : "");
  const budget = settings.monthly_budget_usd ? Number(settings.monthly_budget_usd) : null;
  const pct = budget ? Math.min(100, Math.round((spend.usd / budget) * 100)) : null;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Inteligencia artificial"
        description="Conectá las IA del estudio con claves propias. Las claves se guardan cifradas y nunca salen del servidor. La IA propone y una persona aprueba: nada fiscal, de pagos ni comunicaciones a clientes se ejecuta sin aprobación."
        tabs={iaTabs("configuracion")}
      />
      {sp.guardado && <Notice>Cambios guardados.</Notice>}
      {sp.prueba === "ok" && <Notice>La conexión funciona.</Notice>}
      {sp.error && <Notice tone="error">{ERRORS[sp.error] ?? "No se pudo guardar. Revisá los datos."}</Notice>}
      {!encryptionEnabled() && <Notice tone="error">{ERRORS.cifrado}</Notice>}

      <div className="mt-6 grid gap-6 [&>*]:min-w-0">
        <Panel title="Proveedores" icon={KeyRound}>
          {providers.length === 0 ? (
            <EmptyState icon={Cpu} title="Todavía no hay proveedores" text="Agregá uno abajo: Anthropic, OpenAI, Google, OpenRouter, Azure OpenAI o un servidor compatible con OpenAI (Ollama, LM Studio)." />
          ) : (
            <ul className="divide-y divide-line">
              {providers.map((p) => (
                <li key={p.id} id={`proveedor-${p.id}`} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                        {p.name}
                        <Tag>{PROVIDERS[p.kind].label}</Tag>
                        {!p.active && <Tag>Pausado</Tag>}
                      </p>
                      <p className="mt-1 text-[13px] text-muted">
                        {p.key_hint ? `Clave …${p.key_hint}` : "Sin clave"}
                        {p.base_url ? ` · ${p.base_url}` : ""} · Modelos: {(p.settings.models ?? []).join(", ") || "ninguno"}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-[13px]">
                        {p.last_test_ok === null ? (
                          <CircleDashed className="size-4 text-muted" strokeWidth={1.5} aria-hidden />
                        ) : p.last_test_ok ? (
                          <CheckCircle2 className="size-4 text-[#1f5f36]" strokeWidth={1.5} aria-hidden />
                        ) : (
                          <XCircle className="size-4 text-danger" strokeWidth={1.5} aria-hidden />
                        )}
                        <span className={p.last_test_ok === false ? "text-danger" : "text-muted"}>
                          {p.last_test_at ? `${p.last_test_message} (${fmtDate.format(p.last_test_at)})` : "Sin probar"}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <form action={testProvider}>
                        <input type="hidden" name="id" value={p.id} />
                        <SubmitButton variant={sp.probar === p.id ? "primary" : "secondary"} pendingText="Probando…">
                          Probar conexión
                        </SubmitButton>
                      </form>
                      <form action={toggleProvider}>
                        <input type="hidden" name="id" value={p.id} />
                        <SubmitButton variant="secondary" pendingText="…">
                          {p.active ? "Pausar" : "Activar"}
                        </SubmitButton>
                      </form>
                      <form action={deleteProvider}>
                        <input type="hidden" name="id" value={p.id} />
                        <SubmitButton variant="danger" confirm={`¿Eliminar ${p.name}? Se borra la clave guardada.`} confirmLabel="Eliminar">
                          Eliminar
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[14px] text-ink underline-offset-4 hover:underline">Editar</summary>
                    <div className="mt-3 border border-line bg-canvas p-4">
                      <ProviderForm
                        action={saveProvider}
                        current={{
                          id: p.id,
                          kind: p.kind,
                          name: p.name,
                          base_url: p.base_url,
                          key_hint: p.key_hint,
                          models: p.settings.models ?? [],
                          resourceName: p.settings.resourceName,
                          apiVersion: p.settings.apiVersion,
                        }}
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div id="agregar" className="scroll-mt-24">
          <Panel title="Agregar proveedor" icon={Plus}>
            <ProviderForm action={saveProvider} defaultKind={(AI_PROVIDER_KINDS as readonly string[]).includes(sp.tipo ?? "") ? (sp.tipo as AiProviderKind) : undefined} />
          </Panel>
        </div>

        <Panel title="Modelos y límite de gasto" icon={Cpu} className="scroll-mt-24" bodyClassName="p-5">
          <form id="modelos" action={saveAiSettings} className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Modelo por defecto" htmlFor="default_model" hint="Se usa cuando una tarea no tiene uno propio." className="sm:col-span-2">
              <ModelSelect id="default_model" name="default_model" options={modelOptions} defaultValue={ref(settings.default_model)} emptyLabel="El primero disponible" />
            </AdminField>
            {(Object.keys(AI_TASKS) as AiTaskKey[]).map((t) => (
              <AdminField key={t} label={AI_TASKS[t]} htmlFor={`task_${t}`}>
                <ModelSelect id={`task_${t}`} name={`task_${t}`} options={modelOptions} defaultValue={ref(settings.task_models[t])} emptyLabel="Usar el por defecto" />
              </AdminField>
            ))}
            <AdminField label="Límite de gasto mensual (US$)" htmlFor="budget" hint="Al llegar al límite el Asistente deja de responder hasta el mes siguiente. Vacío: sin límite.">
              <Input id="budget" name="budget" inputMode="decimal" defaultValue={budget ?? ""} placeholder="Sin límite" className="mt-1" />
            </AdminField>
            <div className="sm:col-span-2">
              <SubmitButton>Guardar modelos y límite</SubmitButton>
            </div>
          </form>
        </Panel>

        <Panel title="Uso" icon={Gauge}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[13px] text-muted">Gasto estimado este mes</p>
              <p className="font-display text-[36px] leading-none text-ink">{usd(spend.usd)}</p>
              <p className="mt-1 text-[13px] text-muted">
                {spend.tokens.toLocaleString("es-AR")} tokens{budget ? ` · límite ${usd(budget)}` : " · sin límite"}
              </p>
            </div>
            {pct !== null && (
              <div className="w-full max-w-xs" aria-label={`${pct}% del límite usado`}>
                <div className="h-2 w-full bg-navy-soft">
                  <div className={pct >= 90 ? "h-2 bg-danger" : "h-2 bg-rose-deep"} style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-right text-[12px] text-muted">{pct}% del límite</p>
              </div>
            )}
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[14px]">
              <caption className="sr-only">Uso por modelo en los últimos 30 días</caption>
              <thead className="text-[12px] uppercase tracking-wide text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 font-medium">Modelo (30 días)</th>
                  <th className="py-2 text-right font-medium">Llamadas</th>
                  <th className="py-2 text-right font-medium">Tokens entrada</th>
                  <th className="py-2 text-right font-medium">Tokens salida</th>
                  <th className="py-2 text-right font-medium">Costo estimado</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {byModel.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-muted">
                      Todavía no hay uso registrado.
                    </td>
                  </tr>
                ) : (
                  byModel.map((r) => (
                    <tr key={`${r.kind}-${r.model}`} className="border-b border-line last:border-0">
                      <td className="py-2">
                        {r.model} <span className="text-muted">· {PROVIDERS[r.kind as keyof typeof PROVIDERS]?.label ?? r.kind}</span>
                      </td>
                      <td className="py-2 text-right">{r.calls}</td>
                      <td className="py-2 text-right">{r.input.toLocaleString("es-AR")}</td>
                      <td className="py-2 text-right">{r.output.toLocaleString("es-AR")}</td>
                      <td className="py-2 text-right">{priceFor(r.model) ? usd(Number(r.cost)) : "Sin precio"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-muted">El costo es una estimación con precios de referencia por modelo; el importe real lo factura cada proveedor.</p>
        </Panel>
      </div>
    </div>
  );
}
