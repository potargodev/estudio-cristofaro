import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { requireFaro } from "@/lib/auth";
import { NO_REEMPLAZA } from "@/modules/escudo/catalog";
import { getDerivationRules, getProfessionalTasks } from "@/modules/escudo/server";
import { saveRuleAction, saveTaskAction } from "../../escudo-actions";

export const metadata: Metadata = { title: "Escudo de responsabilidad" };

const input = "mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-[14px] text-ink disabled:opacity-70";
const area = "mt-1 block w-full rounded-md border border-line bg-surface p-2 text-[14px] text-ink disabled:opacity-70";

function Validation({ state, by }: { state: string; by: string | null }) {
  return state === "validada" ? (
    <span className="rounded-md bg-[#ecf6ef] px-2 py-0.5 text-[12px] text-[#1f5f36]">Validada por {by}</span>
  ) : (
    <span className="rounded-md bg-[#fbf5e6] px-2 py-0.5 text-[12px] text-[#7a5410]">A validar por un contador</span>
  );
}

function ValidationFields({ state, by, disabled }: { state: string; by: string | null; disabled: boolean }) {
  return (
    <>
      <label className="text-[13px] text-muted">
        Validación
        <select name="validation" defaultValue={state} disabled={disabled} className={input}>
          <option value="a_validar">A validar por un contador</option>
          <option value="validada">Validada por un contador</option>
        </select>
      </label>
      <label className="text-[13px] text-muted">
        Contador que la validó (nombre y matrícula)
        <input name="validated_by" defaultValue={by ?? ""} disabled={disabled} placeholder="Ej.: C.P. Nombre Apellido · T. 1 F. 2" className={input} />
      </label>
    </>
  );
}

/** Lista de tareas que requieren un matriculado (§1.b) y reglas del disparador de derivación (§1.c) */
export default async function EscudoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireFaro();
  const owner = me.faroRole === "faro_owner";
  const [tasks, rules] = await Promise.all([getProfessionalTasks(), getDerivationRules()]);
  return (
    <div className="grid gap-8">
      <PageHeader
        level={2}
        title="Escudo de responsabilidad"
        description={`Faro ayuda a hacer y a ordenar, pero nunca dice que algo está bien. ${NO_REEMPLAZA} Esta lista y estos umbrales los tiene que validar un contador (Estudio Cristofaro, cliente cero).`}
        className="mb-0"
      />
      <Feedback sp={sp} />

      <section aria-labelledby="tareas" className="grid gap-3">
        <h2 id="tareas" className="text-[18px] font-semibold text-ink">
          Tareas que requieren un matriculado
        </h2>
        <p className="text-[14px] text-muted">Cuando la persona o el Vigía tocan una de estas tareas, Faro no la acompaña: explica que la tiene que hacer un profesional matriculado y ofrece sumar un contador. Las frases se buscan en lo que escribe la persona (sin tildes).</p>
        {[...tasks, null].map((t) => (
          <form key={t?.key ?? "nueva"} id={t ? `tarea-${t.key}` : "tarea-nueva"} action={saveTaskAction} className="grid gap-3 rounded-md border border-line bg-surface p-4 sm:grid-cols-2">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
              <p className="text-[15px] font-medium text-ink">{t ? t.title : "Nueva tarea"}</p>
              {t && <Validation state={t.validation} by={t.validatedBy} />}
            </div>
            {t ? <input type="hidden" name="key" value={t.key} /> : (
              <label className="text-[13px] text-muted">
                Clave
                <input name="key" required disabled={!owner} placeholder="ej.: sucesiones" className={input} />
              </label>
            )}
            <label className="text-[13px] text-muted">
              Título
              <input name="title" required defaultValue={t?.title} disabled={!owner} className={input} />
            </label>
            <label className="text-[13px] text-muted sm:col-span-2">
              Descripción
              <textarea name="description" rows={2} defaultValue={t?.description} disabled={!owner} className={area} />
            </label>
            <label className="text-[13px] text-muted sm:col-span-2">
              Frases que la identifican (separadas por coma)
              <textarea name="keywords" rows={2} defaultValue={t?.keywords.join(", ")} disabled={!owner} className={area} />
            </label>
            <ValidationFields state={t?.validation ?? "a_validar"} by={t?.validatedBy ?? null} disabled={!owner} />
            <label className="flex items-center gap-2 text-[14px] text-ink">
              <input type="checkbox" name="active" defaultChecked={t?.active ?? true} disabled={!owner} className="size-4 accent-navy" /> Activa
            </label>
            {owner && (
              <div className="sm:text-right">
                <SubmitButton variant="secondary" pendingText="…">{t ? "Guardar" : "Agregar tarea"}</SubmitButton>
              </div>
            )}
          </form>
        ))}
      </section>

      <section aria-labelledby="reglas" className="grid gap-3">
        <h2 id="reglas" className="text-[18px] font-semibold text-ink">
          Disparador de derivación
        </h2>
        <p className="text-[14px] text-muted">Cuando se cumple una regla, la persona ve una sugerencia amable de sumar un contador que lleva a la Red con el contexto armado. Si la descarta, vuelve a aparecer pasados los días indicados.</p>
        {rules.map((r) => (
          <form key={r.key} id={`regla-${r.key}`} action={saveRuleAction} className="grid gap-3 rounded-md border border-line bg-surface p-4 sm:grid-cols-2">
            <input type="hidden" name="key" value={r.key} />
            <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
              <p className="text-[15px] font-medium text-ink">{r.title}</p>
              <Validation state={r.validation} by={r.validatedBy} />
            </div>
            <p className="text-[13px] text-muted sm:col-span-2">{r.description}</p>
            <label className="text-[13px] text-muted">
              Título
              <input name="title" defaultValue={r.title} disabled={!owner} className={input} />
            </label>
            <label className="text-[13px] text-muted">
              Qué necesita (contexto para la Red)
              <input name="need" defaultValue={r.need} disabled={!owner} className={input} />
            </label>
            <label className="text-[13px] text-muted sm:col-span-2">
              Texto que ve la persona
              <textarea name="message" rows={2} defaultValue={r.message} disabled={!owner} className={area} />
            </label>
            {r.threshold != null ? (
              <label className="text-[13px] text-muted">
                Umbral · {r.thresholdLabel}
                <input name="threshold" inputMode="decimal" defaultValue={String(r.threshold)} disabled={!owner} className={input} />
              </label>
            ) : (
              <p className="self-end pb-2 text-[13px] text-muted">Se dispara por un momento, sin umbral.</p>
            )}
            <label className="text-[13px] text-muted">
              Vuelve a aparecer a los (días)
              <input name="snooze_days" type="number" min={1} max={365} defaultValue={r.snoozeDays} disabled={!owner} className={input} />
            </label>
            <ValidationFields state={r.validation} by={r.validatedBy} disabled={!owner} />
            <label className="flex items-center gap-2 text-[14px] text-ink">
              <input type="checkbox" name="active" defaultChecked={r.active} disabled={!owner} className="size-4 accent-navy" /> Activa
            </label>
            {owner && (
              <div className="sm:text-right">
                <SubmitButton variant="secondary" pendingText="…">Guardar</SubmitButton>
              </div>
            )}
          </form>
        ))}
      </section>
    </div>
  );
}
