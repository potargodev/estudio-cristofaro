import { SubmitButton } from "@/components/admin/ui";
import { FILE_TEMPLATES } from "@/modules/industries/catalog";
import { PROVINCES, RED_SERVICES } from "@/modules/red/catalog";
import { SEEKER_KINDS, SEEKER_SIZES } from "@/modules/red/seekers";
import { fieldClass } from "@/components/ds/primitives";

const field = `mt-1 py-2 ${fieldClass}`;
const lbl = "block text-meta text-muted";

type Seeker = { active: boolean; kind: string; industry: string | null; size: string | null; province: string | null; city: string | null; needs: string[]; note: string | null } | null;

/** «Disponible, busco contador» (§15): qué mostrar, sin nombre ni contacto */
export function SeekerForm({ action, seeker, fleet, hidden }: { action: (fd: FormData) => void | Promise<void>; seeker: Seeker; fleet?: boolean; hidden?: Record<string, string> }) {
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="flex items-center gap-2 text-body font-medium sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked={!!seeker?.active} className="size-5 accent-navy" /> Disponible, busco contador
      </label>
      <p className="text-meta text-muted sm:col-span-2">Aparecés en el listado de los estudios solo con lo que elijas acá, sin {fleet ? "el nombre de la Flota ni de sus integrantes" : "tu nombre"} ni datos de contacto. Si un estudio te contacta, decidís vos; recién al aceptar ve tus datos.</p>
      {!fleet && (
        <label>
          <span className={lbl}>Sos</span>
          <select name="kind" defaultValue={seeker?.kind ?? "persona"} className={field}>
            {Object.entries(SEEKER_KINDS)
              .filter(([k]) => k !== "flota")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        </label>
      )}
      <label>
        <span className={lbl}>Rubro</span>
        <select name="industry" defaultValue={seeker?.industry ?? ""} className={field}>
          <option value="">Sin mostrar</option>
          {FILE_TEMPLATES.map((t) => (
            <option key={t.clave} value={t.clave}>
              {t.nombre}
            </option>
          ))}
        </select>
      </label>
      {!fleet && (
        <label>
          <span className={lbl}>Tamaño</span>
          <select name="size" defaultValue={seeker?.size ?? ""} className={field}>
            <option value="">Sin mostrar</option>
            {SEEKER_SIZES.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        <span className={lbl}>Provincia</span>
        <select name="province" defaultValue={seeker?.province ?? ""} className={field}>
          <option value="">Sin mostrar</option>
          {PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={lbl}>Localidad o barrio (opcional)</span>
        <input name="city" defaultValue={seeker?.city ?? ""} maxLength={60} className={field} />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className={lbl}>Qué necesitás</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-ui">
          {RED_SERVICES.map((x) => (
            <label key={x.key} className="flex items-center gap-1.5">
              <input type="checkbox" name="needs" value={x.key} defaultChecked={seeker?.needs.includes(x.key)} className="size-4 accent-navy" /> {x.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="sm:col-span-2">
        <span className={lbl}>Algo más (sin datos personales: se borran mails y teléfonos)</span>
        <input name="note" defaultValue={seeker?.note ?? ""} maxLength={280} className={field} />
      </label>
      <div className="sm:col-span-2">
        <SubmitButton pendingText="…">Guardar</SubmitButton>
      </div>
    </form>
  );
}
