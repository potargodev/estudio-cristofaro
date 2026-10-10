import { ArrowLeft, Check, Lock, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Notice } from "@/components/admin/AdminField";
import { ModuleIcon } from "@/components/admin/kit/ModuleIcon";
import { SubmitButton } from "@/components/admin/ui";
import { requireTenant, TENANT_OWNERS } from "@/lib/auth";
import { getEntitlements, moduleAvailability } from "@/lib/faro/entitlements";
import { AI_LEVEL_LABEL, priceLabel } from "@/lib/faro/plans";
import { getFaroModule, isFaroModuleKey } from "@/modules/registry";
import { requestPlanUpgrade } from "../../../plan-actions";

export const metadata: Metadata = { title: "Módulo" };

/** Un módulo que el tenant no tiene: "Disponible en el plan X" con CTA, o "Próximamente" */
export default async function ModuloGate({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ pedido?: string }> }) {
  const { key } = await params;
  const sp = await searchParams;
  if (!isFaroModuleKey(key)) notFound();
  const me = await requireTenant();
  const m = getFaroModule(key)!;
  const a = await moduleAvailability(me.studioId, key);
  if (a.state === "activo" && m.nav[0]) redirect(m.nav[0].href);
  const e = (await getEntitlements(me.studioId))!;
  const owner = TENANT_OWNERS.includes(me.role);
  const plan = a.state === "activo" ? null : a.plan;
  return (
    <div className="mx-auto max-w-2xl">
      {sp.pedido === "1" && <Notice>Listo: el equipo de Faro recibió tu pedido y te escribe para pasarte de plan.</Notice>}
      <Link href="/admin/modulos" className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Módulos
      </Link>
      <div className="mt-6 rounded-lg border border-line bg-surface p-7 sm:p-9">
        <span className="grid size-14 place-items-center rounded-lg bg-navy text-gold">
          <ModuleIcon name={m.icon} className="size-7" />
        </span>
        <p className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-rose-deep">
          {a.state === "proximamente" ? <Sparkles className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
          {a.state === "proximamente" ? "Próximamente" : `Disponible en el plan ${plan?.name ?? "superior"}`}
        </p>
        <h1 className="mt-2 font-display text-[40px] leading-tight">{m.name}</h1>
        <p className="mt-3 text-[16px] text-muted">{m.description}</p>
        {a.state === "proximamente" ? (
          <p className="mt-6 text-[15px] text-muted">Lo estamos construyendo. {plan ? `Va a estar incluido desde el plan ${plan.name}.` : ""} Te avisamos cuando esté listo.</p>
        ) : plan ? (
          <div className="mt-7 rounded-lg border border-line bg-canvas p-5">
            <p className="text-[15px] font-semibold text-ink">
              Plan {plan.name} · {priceLabel(plan)}
            </p>
            <ul className="mt-3 grid gap-1.5 text-[14px] text-muted">
              <li className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-[#1f5f36]" aria-hidden /> {m.name}
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-[#1f5f36]" aria-hidden /> IA: {AI_LEVEL_LABEL[plan.ai]}
              </li>
              {plan.limits.organizations !== e.limits.organizations && e.tenant.kind === "studio" && (
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-[#1f5f36]" aria-hidden /> {plan.limits.organizations == null ? "Organizaciones ilimitadas" : `Hasta ${plan.limits.organizations} organizaciones`}
                </li>
              )}
            </ul>
            {owner ? (
              <form action={requestPlanUpgrade} className="mt-5">
                <input type="hidden" name="plan" value={plan.key} />
                <input type="hidden" name="module" value={m.key} />
                <input type="hidden" name="back" value={`/admin/modulos/${m.key}`} />
                <SubmitButton pendingText="Enviando…">Quiero mejorar mi plan</SubmitButton>
              </form>
            ) : (
              <p className="mt-5 text-[14px] text-muted">Pedile al dueño del estudio que mejore el plan.</p>
            )}
          </div>
        ) : null}
        <p className="mt-6 text-[13px] text-muted">Tu plan actual: {e.plan.name}.</p>
      </div>
    </div>
  );
}
