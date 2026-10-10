import type { Metadata } from "next";
import { Ship } from "lucide-react";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Panel } from "@/components/admin/kit/Panel";
import { Tag } from "@/components/admin/kit/StatusBadge";
import { SubmitButton } from "@/components/admin/ui";
import { requireTenant } from "@/lib/auth";
import { formatArs } from "@/lib/faro/plans";
import { requireModule } from "@/lib/faro/require-module";
import { FLEET_MAX, FLEET_MIN, MAX_NOTICE_DAYS, PROFILES, profileLabel } from "@/modules/flotas/catalog";
import { openRequestsForStudio, studioAgreements } from "@/modules/flotas/server";
import { labelOf, RED_SERVICES } from "@/modules/red/catalog";
import { registerPaymentAction, submitProposalAction } from "../../../fleet-actions";

export const metadata: Metadata = { title: "Flotas" };

const input = "mt-1 h-9 w-full rounded-md border border-line bg-surface px-2 text-[14px]";
const STATUS = { activo: "Activo", baja_solicitada: "Baja pedida", finalizado: "Finalizado" } as const;

/** Pedidos grupales de Flotas (anónimos) y los acuerdos individuales del estudio */
export default async function RedFlotasPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireTenant("studio", ["dueno", "contador"]);
  await requireModule(me.studioId, "red_estudios");
  const [requests, agreements] = await Promise.all([openRequestsForStudio(me.studioId), studioAgreements(me.studioId)]);
  const thisMonth = new Date().toISOString().slice(0, 7);
  return (
    <div className="max-w-5xl">
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      <PageHeader title="Flotas" description={`Grupos informales de ${FLEET_MIN} a ${FLEET_MAX} personas que piden una propuesta en la Red. Ves cuántos son por perfil y la zona, sin datos personales. Cada integrante que acepta firma su propio acuerdo y paga solo su abono.`} />
      <div className="grid gap-6 [&>*]:min-w-0">
        <Panel title={`Pedidos publicados (${requests.length})`} icon={Ship} bodyClassName="p-0">
          {requests.length === 0 ? (
            <p className="px-5 py-4 text-[14px] text-muted">No hay pedidos abiertos, o tu ficha todavía no está visible en la Red.</p>
          ) : (
            <ul className="divide-y divide-line">
              {requests.map((r) => (
                <li key={r.id} id={`f-${r.id}`} className="scroll-mt-20 px-5 py-4">
                  <p className="text-[16px] font-semibold">
                    {r.name} <Tag>Flota · grupo informal</Tag>
                  </p>
                  <p className="text-[13px] text-muted">
                    {PROFILES.filter((p) => r.composition[p.key]).map((p) => `${r.composition[p.key]} ${p.label.toLowerCase()}`).join(" · ") || "Sin perfiles declarados"}
                    {r.zone && ` · zona ${r.zone}`}
                  </p>
                  {r.services.length > 0 && <p className="mt-1 text-[13px]">Necesitan: {r.services.map((x) => labelOf(RED_SERVICES, x)).join(", ")}</p>}
                  {r.message && <p className="mt-1 text-[14px]">{r.message}</p>}
                  <form action={submitProposalAction} className="mt-3 grid gap-3 rounded-md border border-line bg-canvas p-4">
                    <input type="hidden" name="fleet" value={r.id} />
                    <p className="text-[14px] font-medium">{r.proposal ? "Tu propuesta (podés actualizarla)" : "Enviar propuesta"} · precio mensual por integrante, en pesos</p>
                    <div className="grid gap-3 sm:grid-cols-4">
                      {PROFILES.map((p) => (
                        <label key={p.key} className="text-[12px] text-muted">
                          {p.label}
                          <input name={`price_${p.key}`} inputMode="numeric" defaultValue={r.proposal?.prices[p.key] ?? ""} placeholder="—" className={input} />
                        </label>
                      ))}
                    </div>
                    <label className="text-[12px] text-muted">
                      Qué incluye por perfil
                      <textarea name="includes" required rows={3} maxLength={2000} defaultValue={r.proposal?.includes ?? ""} className={`${input} h-auto py-2`} />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-[12px] text-muted">
                        Mínimo de integrantes ({FLEET_MIN} a {FLEET_MAX})
                        <input name="min_members" inputMode="numeric" defaultValue={r.proposal?.min_members ?? FLEET_MIN} className={input} />
                      </label>
                      <label className="text-[12px] text-muted">
                        Preaviso de baja (hasta {MAX_NOTICE_DAYS} días, sin penalidades)
                        <input name="notice_days" inputMode="numeric" defaultValue={r.proposal?.notice_days ?? MAX_NOTICE_DAYS} className={input} />
                      </label>
                    </div>
                    <p className="text-[12px] text-muted">Si la Flota queda debajo del mínimo, avisás con 30 días antes de pasar a tu tarifa normal (Faro lo avisa solo). Pago mensual por adelantado.</p>
                    <div>
                      <SubmitButton pendingText="…">{r.proposal ? "Actualizar propuesta" : "Enviar propuesta"}</SubmitButton>
                    </div>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Acuerdos de servicio (${agreements.length})`} bodyClassName="p-0">
          {agreements.length === 0 ? (
            <p className="px-5 py-4 text-[14px] text-muted">Cuando un integrante acepte tu propuesta, su acuerdo aparece acá y queda como organización del estudio.</p>
          ) : (
            <ul className="divide-y divide-line">
              {agreements.map(({ a, account }) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium">
                      {a.member_name} <span className="text-[13px] font-normal text-muted">· {a.member_email}</span>
                    </p>
                    <p className="text-[13px] text-muted">
                      Flota «{a.terms.fleetName}» · {profileLabel(a.profile)} · {formatArs(a.monthly_price)} / mes · {STATUS[a.status]}
                      {a.ends_on && ` · termina ${a.ends_on}`}
                      {a.group_price_until && ` · precio grupal hasta ${a.group_price_until}`}
                    </p>
                    <p className="text-[13px]">
                      {account.state === "al_dia" ? "Al día" : `Pendiente: ${account.pendingPeriods.join(", ")}`}
                    </p>
                  </div>
                  {a.status !== "finalizado" && (
                    <form action={registerPaymentAction} className="flex items-end gap-2">
                      <input type="hidden" name="agreement" value={a.id} />
                      <label className="text-[12px] text-muted">
                        Período
                        <input name="period" type="month" defaultValue={account.pendingPeriods[0] ?? thisMonth} className={`${input} w-36`} />
                      </label>
                      <label className="text-[12px] text-muted">
                        Medio
                        <input name="method" placeholder="Transferencia" className={`${input} w-32`} />
                      </label>
                      <SubmitButton pendingText="…">Registrar pago</SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
