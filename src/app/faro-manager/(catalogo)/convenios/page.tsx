import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { fieldClass } from "@/components/ds/primitives";
import { requireFaro } from "@/lib/auth";
import { formatDate, todayAR } from "@/lib/format";
import { CCTS, scaleAt } from "@/modules/liquidacion/convenios";
import { LEGAL_PARAMS } from "@/modules/liquidacion/core";
import { FORMATS } from "@/modules/liquidacion/exportaciones";
import { scaleVersions } from "@/modules/liquidacion/server";
import { saveCctScaleAction } from "../../convenios-actions";

export const metadata: Metadata = { title: "Convenios de sueldos" };

const input = `mt-1 disabled:opacity-70 ${fieldClass}`;

/** Convenios colectivos y escalas versionadas para la liquidación de sueldos (§2.q etapa 6) */
export default async function ConveniosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireFaro();
  const owner = me.faroRole === "faro_owner";
  const versions = await scaleVersions();
  const today = todayAR();
  const toValidate = CCTS.filter((c) => scaleAt(c, today, versions).status === "a_validar").length;
  return (
    <div className="grid gap-6">
      <PageHeader
        level={2}
        title="Convenios de sueldos"
        description={`${CCTS.length} convenios con sus categorías y básicos. Cada escala nueva se carga como versión con su vigencia y su fuente; las liquidaciones usan la vigente a la fecha. ${toValidate} ${toValidate === 1 ? "convenio tiene" : "convenios tienen"} la escala a validar.`}
        className="mb-0"
      />
      <Feedback sp={sp} />
      <section aria-labelledby="parametros" className="grid gap-2 rounded-md border border-line bg-surface p-4">
        <h2 id="parametros" className="text-title font-semibold">
          Parámetros de seguridad social y formatos
        </h2>
        {LEGAL_PARAMS.map((p) => (
          <p key={p.validFrom} className="text-ui text-muted">
            Desde el {formatDate(p.validFrom, "numeric")} · <span className="text-[#7a5410]">{p.status === "validada" ? "validados" : "a validar"}</span>: aportes {p.retirementPct} % + {p.pamiPct} % + {p.healthPct} %, contribuciones {p.employerPct.general} % o {p.employerPct.grande} % y obra social {p.employerHealthPct} %, tope ${p.maxBase.toLocaleString("es-AR")}, detracción ${p.detraccion.toLocaleString("es-AR")}, SMVM ${p.smvm.toLocaleString("es-AR")}. {p.source}
          </p>
        ))}
        <ul className="grid gap-1 text-ui text-muted">
          {Object.values(FORMATS).map((f) => (
            <li key={f.label}>
              {f.label} · <span className="text-[#7a5410]">a validar</span>: {f.note}
            </li>
          ))}
        </ul>
      </section>
      {CCTS.map((c) => {
        const cur = scaleAt(c, today, versions);
        const own = versions.filter((v) => v.cctKey === c.key);
        return (
          <section key={c.key} id={`cct-${c.key}`} className="grid gap-3 rounded-md border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-body font-semibold">
                {c.name} <span className="font-normal text-muted">· {c.number} · {c.union}</span>
              </h2>
              <span className={`rounded-md px-2 py-0.5 text-caption ${cur.status === "validada" ? "bg-[#ecf6ef] text-[#1f5f36]" : "bg-[#fbf5e6] text-[#7a5410]"}`}>{cur.status === "validada" ? "Escala validada" : "Escala a validar"}</span>
            </div>
            <p className="text-meta text-muted">
              Vigente desde el {formatDate(cur.validFrom, "numeric")} · {cur.source} · {c.unit === "hora" ? "valor hora" : "básico mensual"}, antigüedad {c.seniorityPct} % por año
              {c.extras.length ? `, ${c.extras.map((x) => x.name.toLowerCase()).join(", ")}` : ""}
              {own.length ? ` · ${own.length} ${own.length === 1 ? "versión cargada" : "versiones cargadas"}` : ""}
            </p>
            <form action={saveCctScaleAction} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="cct_key" value={c.key} />
              <fieldset disabled={!owner} className="contents">
                <label className="text-meta text-muted">
                  Vigente desde
                  <input name="valid_from" type="date" required defaultValue={own[0]?.validFrom ?? today.slice(0, 8) + "01"} className={input} />
                </label>
                <label className="text-meta text-muted">
                  Estado
                  <select name="status" defaultValue={cur.status} className={input}>
                    <option value="a_validar">A validar</option>
                    <option value="validada">Validada con el acta</option>
                  </select>
                </label>
                <label className="text-meta text-muted">
                  Fuente (acta, resolución o publicación)
                  <input name="source" required defaultValue={own[0]?.source ?? ""} className={input} />
                </label>
                <label className="text-meta text-muted sm:col-span-3">
                  Categorías (una por línea: código; nombre; básico)
                  <textarea name="categories" rows={Math.min(8, cur.categories.length + 1)} defaultValue={cur.categories.map((x) => `${x.code};${x.name};${x.basic}`).join("\n")} className={`${input} py-2`} />
                </label>
              </fieldset>
              {owner && (
                <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
                  <label className="flex items-center gap-2 text-ui">
                    <input type="checkbox" name="notify" className="size-4 accent-navy" /> Avisar a los estudios con empleados en este convenio
                  </label>
                  <SubmitButton variant="secondary" pendingText="…">
                    Guardar versión
                  </SubmitButton>
                </div>
              )}
            </form>
          </section>
        );
      })}
    </div>
  );
}
