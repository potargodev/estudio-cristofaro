import { AlertTriangle, KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { requireFaro } from "@/lib/auth";
import { PLANS, planFullName } from "@/lib/faro/plans";
import { cn } from "@/lib/utils";
import { platformSpend, usageByUser } from "@/modules/copilot/limits";
import { getPlatformAi, isConfigured, limitsFor, PLATFORM_PROVIDERS } from "@/modules/copilot/platform";
import { forgetPlatformKeyAction, savePlatformAiAction } from "@/app/faro-manager/ia-actions";
import { fieldClass } from "@/components/ds/primitives";

export const metadata: Metadata = { title: "IA de la plataforma" };

const input = fieldClass;
const label = "grid gap-1 text-meta text-muted";
const usd = (n: number) => `USD ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const int = (n: number) => n.toLocaleString("es-AR");

/** Clave y modelos de la IA que Faro pone para personas y autónomos (§2.m), límites, topes y consumo */
export default async function IaPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireFaro();
  const owner = me.faroRole === "faro_owner";
  const [p, spend, byUser] = await Promise.all([getPlatformAi(), platformSpend(), usageByUser(50)]);
  const ready = isConfigured(p);
  return (
    <>
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      <PageHeader level={2} title="IA de la plataforma" description="El modelo que usa el Vigía de las personas y los autónomos. La clave se guarda cifrada y nunca se vuelve a mostrar: solo sus últimos 4 caracteres." />

      {!ready && (
        <div className="mb-5 flex gap-3 rounded-md border border-line bg-surface p-4 text-ui">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-rose-deep" aria-hidden />
          <p>No hay clave cargada. El Vigía funciona en <strong>modo básico</strong>: entiende frases simples de texto y avisa que la IA no está configurada.</p>
        </div>
      )}
      {p.cap_alerted_at && Date.now() - p.cap_alerted_at.getTime() < 48 * 3600_000 && (
        <div role="status" className="mb-5 flex gap-3 rounded-md border border-line bg-surface p-4 text-ui">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-deep" aria-hidden />
          <p>
            Última alerta de la IA: {new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(p.cap_alerted_at)}. El detalle está en la <a href="/faro-manager/auditoria" className="underline underline-offset-2">auditoría</a>.
          </p>
        </div>
      )}
      {p.free_tier && (
        <div role="alert" className="mb-5 flex gap-3 rounded-md border border-danger/40 bg-danger/5 p-4 text-ui">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          <p>
            <strong>La clave es del plan gratis del proveedor.</strong> Tiene cuotas bajas y, en algunos proveedores, los datos se pueden usar para entrenar modelos. Sirve para probar, no para datos reales de usuarios: cargá una clave de un proyecto con facturación activa.
          </p>
        </div>
      )}

      <section className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          ["Gasto de hoy", usd(spend.day), p.daily_cap_usd ? `tope ${usd(Number(p.daily_cap_usd))}` : "sin tope"],
          ["Gasto del mes", usd(spend.month), p.monthly_cap_usd ? `tope ${usd(Number(p.monthly_cap_usd))}` : "sin tope"],
          ["Mensajes hoy", int(spend.dayMessages), "de usuarios"],
          ["Mensajes del mes", int(spend.monthMessages), "de usuarios"],
        ].map(([t, v, s]) => (
          <div key={t} className="rounded-md border border-line bg-surface p-4">
            <p className="text-caption text-muted">{t}</p>
            <p className="num text-[26px]">{v}</p>
            <p className="text-caption text-muted">{s}</p>
          </div>
        ))}
      </section>

      <form action={savePlatformAiAction} className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <section className="rounded-md border border-line bg-surface p-5">
          <h2 className="text-title font-semibold">Proveedor y clave</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Proveedor
              <select name="provider" defaultValue={p.provider} disabled={!owner} className={input}>
                {Object.entries(PLATFORM_PROVIDERS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Clave de API {p.key_hint ? <span>(cargada: ••••{p.key_hint})</span> : <span>(sin cargar)</span>}
              <input name="api_key" type="password" autoComplete="off" placeholder={p.key_hint ? "Dejala vacía para no cambiarla" : "Pegá la clave"} disabled={!owner} className={input} />
            </label>
            <label className={cn(label, "sm:col-span-2")}>
              URL base (solo para “Compatible con OpenAI” o un proxy; vacío = la del proveedor)
              <input name="base_url" defaultValue={p.base_url ?? ""} placeholder="https://…/v1" disabled={!owner} className={input} />
            </label>
            <label className={label}>
              Modelo principal
              <input name="model_primary" defaultValue={p.model_primary} required disabled={!owner} className={input} />
            </label>
            <label className={label}>
              Modelo de respaldo (si el principal falla o no tiene cuota)
              <input name="model_fallback" defaultValue={p.model_fallback ?? ""} disabled={!owner} className={input} />
            </label>
            <label className="flex items-center gap-2 text-ui sm:col-span-2">
              <input type="checkbox" name="free_tier" defaultChecked={p.free_tier} disabled={!owner} className="size-4 accent-navy" /> Es una clave del plan gratis del proveedor
            </label>
          </div>
        </section>

        <section className="rounded-md border border-line bg-surface p-5">
          <h2 className="text-title font-semibold">Audios</h2>
          <p className="text-ui text-muted">Con Gemini, el mismo modelo entiende el audio. La alternativa es un modelo de transcripción de OpenAI (Whisper o similar).</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className={label}>
              Transcripción
              <select name="transcription" defaultValue={p.transcription} disabled={!owner} className={input}>
                <option value="nativo">Audio nativo del modelo (Gemini)</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
            <label className={label}>
              Clave de OpenAI para audios (opcional)
              <input name="transcription_key" type="password" autoComplete="off" placeholder={p.transcription_key_enc ? "Cargada · vacía para no cambiarla" : "Vacía = usa la clave principal"} disabled={!owner} className={input} />
            </label>
            <label className={label}>
              Modelo de transcripción
              <input name="transcription_model" defaultValue={p.transcription_model} disabled={!owner} className={input} />
            </label>
          </div>
        </section>

        <section className="rounded-md border border-line bg-surface p-5">
          <h2 className="text-title font-semibold">Costos y topes</h2>
          <p className="text-ui text-muted">El costo estimado sale de los tokens × estos precios. Con un tope alcanzado, la IA se pausa para los planes gratis y sigue para los pagos, y el equipo de Faro recibe un aviso.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <label className={label}>
              USD por millón de tokens de entrada
              <input name="price_in" defaultValue={p.price_in_per_m} inputMode="decimal" disabled={!owner} className={input} />
            </label>
            <label className={label}>
              USD por millón de tokens de salida
              <input name="price_out" defaultValue={p.price_out_per_m} inputMode="decimal" disabled={!owner} className={input} />
            </label>
            <label className={label}>
              Tope diario (USD, vacío = sin tope)
              <input name="daily_cap" defaultValue={p.daily_cap_usd ?? ""} inputMode="decimal" disabled={!owner} className={input} />
            </label>
            <label className={label}>
              Tope mensual (USD, vacío = sin tope)
              <input name="monthly_cap" defaultValue={p.monthly_cap_usd ?? ""} inputMode="decimal" disabled={!owner} className={input} />
            </label>
          </div>
        </section>

        <section className="rounded-md border border-line bg-surface p-5">
          <h2 className="text-title font-semibold">Límites por plan (por usuario y por mes)</h2>
          <p className="text-ui text-muted">Vacío = sin límite. Al llegar, el chat lo avisa y ofrece cargar a mano.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-meta">
              <thead className="text-caption text-muted">
                <tr>
                  <th className="py-2 font-medium">Plan</th>
                  <th className="py-2 font-medium">Mensajes</th>
                  <th className="py-2 font-medium">Audios</th>
                </tr>
              </thead>
              <tbody>
                {PLANS.map((pl) => {
                  const l = limitsFor(p, pl.key);
                  return (
                    <tr key={pl.key} className="border-t border-line">
                      <td className="py-2 pr-3">{planFullName(pl)}</td>
                      <td className="py-2 pr-3">
                        <input name={`msg_${pl.key}`} aria-label={`Mensajes · ${pl.name}`} defaultValue={l.messages ?? ""} inputMode="numeric" disabled={!owner} className={cn(input, "w-28")} />
                      </td>
                      <td className="py-2">
                        <input name={`aud_${pl.key}`} aria-label={`Audios · ${pl.name}`} defaultValue={l.audios ?? ""} inputMode="numeric" disabled={!owner} className={cn(input, "w-28")} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {owner && (
          <div>
            <SubmitButton pendingText="Guardando…">Guardar configuración</SubmitButton>
          </div>
        )}
      </form>

      {owner && p.key_hint && (
        <form action={forgetPlatformKeyAction} className="mt-3">
          <button type="submit" className="text-meta text-danger underline underline-offset-2">
            Borrar la clave (el Vigía vuelve al modo básico)
          </button>
        </form>
      )}

      <section className="mt-8">
        <h2 className="text-section font-semibold">Consumo del mes por usuario</h2>
        <p className="mb-3 text-ui text-muted">Solo cantidades: el Faro Manager no ve el contenido de los chats.</p>
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full min-w-[720px] text-left text-meta">
            <thead className="border-b border-line text-caption text-muted">
              <tr>
                {["Usuario", "Plan", "Mensajes", "Audios", "Imágenes", "Tokens entrada", "Tokens salida", "Costo estimado"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byUser.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted">
                    Todavía no hay consumo este mes.
                  </td>
                </tr>
              )}
              {byUser.map((r) => (
                <tr key={r.userId} className="border-t border-line tabular-nums">
                  <td className="px-3 py-2">{r.email}</td>
                  <td className="px-3 py-2">{r.plan ?? "—"}</td>
                  <td className="px-3 py-2">{int(r.messages)}</td>
                  <td className="px-3 py-2">{int(r.audios)}</td>
                  <td className="px-3 py-2">{int(r.images)}</td>
                  <td className="px-3 py-2">{int(r.tokensIn)}</td>
                  <td className="px-3 py-2">{int(r.tokensOut)}</td>
                  <td className="px-3 py-2">{usd(Number(r.cost))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
