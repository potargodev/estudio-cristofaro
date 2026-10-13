import type { Metadata } from "next";
import Link from "next/link";
import { setModeAction } from "@/app/simuladores/actions";
import { Feedback } from "@/components/app/Feedback";
import { PageHeader, SectionTitle, SubmitButton, Table, ToneBadge, fieldClass } from "@/components/ds";
import { requireFaro } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { MODES, SERVICES, type Service } from "@/modules/simuladores/core";
import { modesOverview, simulatorsAllowed } from "@/modules/simuladores/server";

export const metadata: Metadata = { title: "Integraciones" };

const TONE = { real: "neutral", prueba: "info", simulador: "gold" } as const;
const KIND = { studio: "Estudio", personal: "Autónomo", persona: "Persona" } as const;

/** Parte C · Modo de cada servicio (Real, Prueba o Simulador) por espacio y por organización */
export default async function IntegracionesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireFaro();
  const sp = await searchParams;
  const owner = me.faroRole === "faro_owner";
  const all = await modesOverview();
  const space = all.find((s) => s.id === sp.espacio) ?? all.find((s) => s.demo) ?? all[0];
  const services = Object.keys(SERVICES) as Service[];
  const changed = all.filter((s) => Object.keys(s.explicit).length || s.orgOverrides.length);
  return (
    <div className="grid gap-5">
      <PageHeader
        level={2}
        title="Integraciones"
        description="Cada servicio externo funciona en Real (el de verdad), Prueba (el ambiente de prueba oficial: homologación de ARCA, credenciales de prueba de Mercado Pago, número de prueba de WhatsApp) o Simulador (dentro de Faro, sin salir a internet). La demo arranca en Simulador y nunca usa Real. Cada cambio queda en la auditoría."
        className="mb-0"
      />
      <Feedback sp={sp} />
      {!simulatorsAllowed() && <p className="text-ui text-muted">En este servidor los espacios reales no pueden usar el Simulador (ALLOW_SIMULATORS no está activo): solo la demo.</p>}
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="w-full min-w-0 text-meta text-muted sm:w-auto">
          Espacio
          <select name="espacio" defaultValue={space?.id} className={cn(fieldClass, "mt-1 w-full sm:w-auto")}>
            {all.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {KIND[s.kind as keyof typeof KIND] ?? s.kind}
                {s.demo ? " · demo" : ""}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton variant="secondary">Ver</SubmitButton>
      </form>

      {space && (
        <section aria-labelledby="modos-espacio">
          <SectionTitle id="modos-espacio">
            {space.name}
            {space.demo ? " (demo)" : ""}
          </SectionTitle>
          <Table label={`Modos de ${space.name}`} minWidth={560}>
            <thead>
              <tr className="border-b border-line text-meta text-muted">
                <th className="px-4 py-2 font-medium">Servicio</th>
                <th className="px-4 py-2 font-medium">Modo</th>
                {owner && <th className="px-4 py-2 font-medium">Cambiar</th>}
              </tr>
            </thead>
            <tbody>
              {services.map((k) => (
                <tr key={k} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">{SERVICES[k].label}</td>
                  <td className="px-4 py-2">
                    <ToneBadge tone={TONE[space.modes[k]]}>{MODES[space.modes[k]]}</ToneBadge>
                    {!space.explicit[k] && <span className="ml-2 text-meta text-muted">de siempre</span>}
                  </td>
                  {owner && (
                    <td className="px-4 py-2">
                      <form action={setModeAction} className="flex items-center gap-2">
                        <input type="hidden" name="studio" value={space.id} />
                        <input type="hidden" name="service" value={k} />
                        <select name="mode" defaultValue={space.explicit[k] ?? "heredar"} aria-label={`Modo de ${SERVICES[k].label}`} className={cn(fieldClass, "w-auto")}>
                          <option value="heredar">De siempre</option>
                          {Object.entries(MODES).map(([m, l]) => (
                            <option key={m} value={m}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <SubmitButton variant="secondary">
                          Guardar
                        </SubmitButton>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>

          <SectionTitle className="mt-5">Excepciones por organización</SectionTitle>
          {space.orgOverrides.length === 0 ? (
            <p className="text-ui text-muted">Ninguna: todas las organizaciones usan el modo del espacio.</p>
          ) : (
            <ul className="grid gap-1 text-ui">
              {space.orgOverrides.map((o) => (
                <li key={`${o.organizationId}-${o.service}`}>
                  {o.organization} · {SERVICES[o.service as Service]?.label ?? o.service}: <strong>{MODES[o.mode as keyof typeof MODES] ?? o.mode}</strong>
                </li>
              ))}
            </ul>
          )}
          {owner && space.orgs.length > 0 && (
            <form action={setModeAction} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="studio" value={space.id} />
              <label className="w-full min-w-0 text-meta text-muted sm:w-auto">
                Organización
                <select name="org" className={cn(fieldClass, "mt-1 w-full sm:w-auto")}>
                  {space.orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-full min-w-0 text-meta text-muted sm:w-auto">
                Servicio
                <select name="service" className={cn(fieldClass, "mt-1 w-full sm:w-auto")}>
                  {services.map((k) => (
                    <option key={k} value={k}>
                      {SERVICES[k].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-meta text-muted">
                Modo
                <select name="mode" className={cn(fieldClass, "mt-1 w-auto")}>
                  <option value="heredar">El del espacio</option>
                  {Object.entries(MODES).map(([m, l]) => (
                    <option key={m} value={m}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <SubmitButton variant="secondary">Guardar</SubmitButton>
            </form>
          )}
        </section>
      )}

      <section aria-labelledby="cambiados">
        <SectionTitle id="cambiados">Espacios con modos elegidos a mano</SectionTitle>
        {changed.length === 0 ? (
          <p className="text-ui text-muted">Ninguno: la demo usa Simulador y el resto, Real.</p>
        ) : (
          <ul className="grid gap-1 text-ui">
            {changed.map((s) => (
              <li key={s.id}>
                <Link href={`/faro-manager/integraciones?espacio=${s.id}`} className="underline underline-offset-4">
                  {s.name}
                </Link>
                <span className="text-muted">
                  {" "}
                  · {Object.entries(s.explicit).map(([k, m]) => `${SERVICES[k as Service]?.label.split(" (")[0] ?? k}: ${MODES[m as keyof typeof MODES] ?? m}`).join(" · ")}
                  {s.orgOverrides.length ? ` · ${s.orgOverrides.length} excepciones por organización` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
