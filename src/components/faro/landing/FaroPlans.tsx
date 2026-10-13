"use client";

import { useState } from "react";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, CtaLink, GhostLink, SectionIndex } from "@/components/web/ui";
import { PERSONA_ROWS, PERSONAL_ROWS, STUDIO_ROWS } from "@/lib/faro/plan-rows";
import { ANNUAL_FREE_MONTHS, PLANS, type FaroPlan, type TenantKind } from "@/lib/faro/plans";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/format";

const TABS: { kind: TenantKind; label: string; intro: string }[] = [
  { kind: "persona", label: "Para personas", intro: "Bitácora gratis para tus finanzas, tus grupos de gastos y para encontrar un contador cuando lo necesites." },
  { kind: "personal", label: "Para autónomos", intro: "Faro Personal para monotributistas y responsables inscriptos que llevan sus números solos." },
  { kind: "studio", label: "Para estudios", intro: "Inicial es gratis, para el contador que arranca. Profesional y Avanzado suman automatización, módulos, equipo y la Red Contable, con 30 días de prueba." },
];

/** "$ 68.600 / mes" (lo que ve la persona) y la referencia "USD 49 · anual …" */
function Price({ p, usdArs }: { p: FaroPlan; usdArs: number }) {
  if (p.free || !p.priceUsd) return <span className="tabular mt-4 block text-title text-paper">Gratis</span>;
  return (
    <span className="mt-4 block">
      <span className="tabular block text-title text-paper">{formatAmount(p.priceUsd * usdArs, "ARS", { decimals: "none" })} / mes</span>
      <span className="tabular block text-meta text-paper/55">
        Referencia {formatAmount(p.priceUsd, "USD", { decimals: "auto" })} · anual {formatAmount(p.priceUsd * (12 - ANNUAL_FREE_MONTHS) * usdArs, "ARS", { decimals: "none" })}{p.trialDays ? ` · ${p.trialDays} días gratis` : ""}
      </span>
    </span>
  );
}

function Cell({ v }: { v: string }) {
  if (v === "✓") return <span className="text-gold" aria-label="Incluido">✓</span>;
  if (v === "—") return <span className="text-paper/60" aria-label="No incluido">—</span>;
  return <>{v}</>;
}

/** Planes en pestañas: personas (Gratis, Plus), autónomos (Gratis, Pro) y estudios (Inicial, Profesional, Avanzado) */
export function FaroPlans({ kinds = ["persona", "personal", "studio"], plans: allPlans = PLANS, usdArs = 1400 }: { kinds?: TenantKind[]; plans?: FaroPlan[]; usdArs?: number }) {
  const tabs = TABS.filter((t) => kinds.includes(t.kind));
  const [kind, setKind] = useState<TenantKind>(tabs[0].kind);
  const plans = allPlans.filter((p) => p.kind === kind);
  const rows = kind === "studio" ? STUDIO_ROWS : kind === "personal" ? PERSONAL_ROWS : PERSONA_ROWS;
  const tab = tabs.find((t) => t.kind === kind)!;
  const cta = (key: string, free: boolean) =>
    free ? (
      <CtaLink tone="gold" href={`/faro/registro?tipo=${kind}`} magnetic={false} className="h-11 w-full justify-center">
        Empezá gratis
      </CtaLink>
    ) : (
      <GhostLink href={`/faro/registro?tipo=${kind}&interes=${key}`} className="h-11 w-full justify-center">
        Probar {plans.find((p) => p.key === key)?.name} 30 días gratis, sin tarjeta
      </GhostLink>
    );
  return (
    <section id="planes" aria-labelledby="planes-titulo" className="scroll-mt-16 border-t border-hair bg-night py-16 lg:py-32">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <SectionIndex n="13">Planes</SectionIndex>
            <SplitHeading id="planes-titulo" className="display-md mt-8 text-paper">
              Empezá gratis. Crecé cuando quieras.
            </SplitHeading>
          </div>
          <p className="self-end text-body leading-relaxed text-paper/65 lg:col-span-4 lg:col-start-9">{tab.intro}</p>
        </div>
        {tabs.length > 1 && (
          <div role="tablist" aria-label="Tipo de cuenta" className="mt-12 inline-flex border border-hair-strong p-1">
            {tabs.map((t) => (
              <button
                key={t.kind}
                role="tab"
                type="button"
                id={`tab-${t.kind}`}
                aria-selected={kind === t.kind}
                aria-controls="planes-panel"
                onClick={() => setKind(t.kind)}
                className={cn("h-10 px-5 text-ui transition-colors duration-300", kind === t.kind ? "bg-paper text-night" : "text-paper/75 hover:text-paper")}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <p className="mt-6 text-meta text-paper/55">Precios de referencia en USD, convertidos a pesos al tipo de cambio que publica Faro. Pago anual: {ANNUAL_FREE_MONTHS} meses de regalo.</p>
        <div id="planes-panel" role="tabpanel" aria-labelledby={`tab-${kind}`} className="mt-8">
          {/* Escritorio: tabla */}
          <table className="hidden w-full table-fixed border-collapse text-left text-ui text-paper/80 lg:table">
            <caption className="sr-only">Comparación de planes {tab.label.toLowerCase()}</caption>
            <thead>
              <tr>
                <th className="w-[30%]" />
                {plans.map((p) => (
                  <th key={p.key} scope="col" className={cn("border-t px-5 pb-6 pt-6 align-top font-normal", p.recommended ? "border-x border-t-2 border-gold bg-gold/[0.04]" : "border-hair")}>
                    <span className="flex items-center gap-2 text-caption text-gold">{p.recommended ? "Recomendado" : " "}</span>
                    <span className="mt-1 block font-display text-[36px] leading-none text-paper">{p.name}</span>
                    <span className="mt-3 block text-ui text-paper/65">{p.tagline}</span>
                    <Price p={p} usdArs={usdArs} />
                    <span className="mt-5 block">{cta(p.key, p.free)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, ...vals]) => (
                <tr key={label} className="border-t border-hair">
                  <th scope="row" className="py-4 pr-6 align-top font-normal text-paper/60">
                    {label}
                  </th>
                  {vals.map((v, i) => (
                    <td key={i} className={cn("px-5 py-4 align-top", plans[i]?.recommended && "border-x border-gold bg-gold/[0.04]")}>
                      <Cell v={v} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {/* Celular: un bloque por plan */}
          <ul className="grid gap-4 lg:hidden">
            {plans.map((p, i) => (
              <li key={p.key} className={cn("border p-5", p.recommended ? "border-gold bg-gold/[0.04]" : "border-hair-strong")}>
                {p.recommended && <p className="text-caption text-gold">Recomendado</p>}
                <h3 className="font-display text-[32px] leading-none text-paper">{p.name}</h3>
                <p className="mt-2 text-ui text-paper/65">{p.tagline}</p>
                <Price p={p} usdArs={usdArs} />
                <dl className="mt-4 divide-y divide-hair border-y border-hair text-ui">
                  {rows.map(([label, ...vals]) => (
                    <div key={label} className="flex justify-between gap-4 py-2.5">
                      <dt className="text-paper/55">{label}</dt>
                      <dd className="text-right text-paper/85">
                        <Cell v={vals[i]} />
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-5">{cta(p.key, p.free)}</div>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
