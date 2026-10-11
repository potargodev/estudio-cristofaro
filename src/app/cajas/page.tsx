import { Briefcase, HeartHandshake, Lightbulb, NotebookPen, Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { money, monthOf } from "@/modules/bitacora/catalog";
import { monthSummary } from "@/modules/bitacora/server";
import { requireUser } from "@/modules/bitacora/session";
import { templateOf } from "@/modules/cajas/catalog";
import { businessHints, businessSummary, myBoxes } from "@/modules/cajas/server";
import { dismissHintAction, moveToBusinessAction, openBusinessAction } from "./actions";

export const metadata: Metadata = { title: { absolute: "Mis cajas · Faro" } };

const ICON = { personal: NotebookPen, negocio: Briefcase, compartida: Users } as const;
const PURPOSE = { personal: "Tu plata de todos los días. Es tu Bitácora.", negocio: "Lo de tu actividad, separado de lo personal." } as const;

/**
 * Mis cajas (§17): todas las cajas de la persona juntas, cada una con su
 * gente, su plata y su propósito. Cada caja es un mundo cerrado: entre cajas
 * solo pasa plata con un movimiento explícito (sueldo o aporte).
 */
export default async function MisCajasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const month = monthOf();
  const list = await myBoxes(me.id);
  const business = list.find((b) => b.kind === "negocio");
  const [personal, biz, hints] = await Promise.all([monthSummary(me.id, month), business ? businessSummary(me, business.id, month) : null, businessHints(me.id)]);
  const autonomo = me.role === "titular" && me.tenantKind === "personal";
  return (
    <div className="grid gap-6 pb-10 [&>*]:min-w-0">
      <PageHeader title="Mis cajas" description="Una sola cuenta, cada plata en su caja: la personal, la del negocio y las que compartís. Entre cajas solo pasa plata con un movimiento a la vista." className="mb-0" />
      <Feedback sp={sp} />

      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Tus cajas">
        {list.map((b) => {
          const Icon = ICON[b.kind];
          const t = b.kind === "compartida" ? templateOf(b.purpose) : null;
          const href = b.kind === "personal" ? "/bitacora" : `/cajas/${b.id}`;
          return (
            <li key={b.id}>
              <Link href={href} data-caja={b.kind} className="flex h-full flex-col gap-3 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-navy">
                <span className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-navy text-gold" aria-hidden>
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[16px] font-medium text-ink">{b.kind === "personal" ? "Personal" : b.name}</span>
                    <span className="block text-[13px] text-muted">{b.kind === "compartida" ? `${t?.name ?? "Compartida"} · ${b.members.length} ${b.members.length === 1 ? "persona" : "personas"}` : b.kind === "negocio" ? "Negocio · solo vos" : "Personal · solo vos"}</span>
                  </span>
                </span>
                <span className="text-[14px] text-muted">{b.kind === "compartida" ? t?.description : PURPOSE[b.kind]}</span>
                {b.kind === "personal" && (
                  <span className="num text-[14px] text-ink">
                    Este mes: entró {money(personal.byCurrency.ARS.now.in)} · salió {money(personal.byCurrency.ARS.now.out)}
                  </span>
                )}
                {b.kind === "negocio" && biz && (
                  <span className="num text-[14px] text-ink">
                    Este mes: resultado {money(biz.result)} · sueldo {money(biz.salary)}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
        {!business && (
          <li className="flex flex-col gap-3 rounded-lg border border-dashed border-line bg-surface p-5">
            <span className="flex items-center gap-2 text-[16px] font-medium text-ink">
              <Briefcase className="size-5 text-rose-deep" aria-hidden /> Caja de negocio
            </span>
            <span className="text-[14px] text-muted">
              {autonomo ? "Tenés una actividad: abrí tu caja de negocio para separar lo del trabajo de lo personal." : "¿Hacés una changa, un freelance o vendés algo? Aunque sea chico, separalo de lo personal: así ves si ganás o perdés."}
            </span>
            <form action={openBusinessAction}>
              <SubmitButton pendingText="Abriendo…">Abrir caja de negocio</SubmitButton>
            </form>
          </li>
        )}
        <li>
          <Link href="/cajas/nueva" className="flex h-full min-h-28 items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface p-5 text-[15px] font-medium text-rose-deep hover:border-navy">
            <Plus className="size-5" aria-hidden /> Caja compartida
            <HeartHandshake className="size-5" aria-hidden />
          </Link>
        </li>
      </ul>

      {hints.length > 0 && (
        <section aria-labelledby="parece" className="rounded-lg border border-rose/40 bg-rose-soft p-5">
          <h2 id="parece" className="flex items-center gap-2 text-[16px] font-semibold text-ink">
            <Lightbulb className="size-5 text-rose-deep" aria-hidden /> Esto parece de tu negocio
          </h2>
          <p className="mt-1 text-[14px] text-muted">Lo cargaste en lo personal, pero parece del trabajo. Si es del negocio, movelo: no se duplica.</p>
          <ul className="mt-3 divide-y divide-line">
            {hints.map(({ entry, hint }) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="block text-[15px] text-ink">{entry.description}</span>
                  <span className="num block text-[13px] text-muted">
                    {money(entry.amount, entry.currency)} · {entry.date} · por «{hint}»
                  </span>
                </span>
                <span className="flex gap-2">
                  <form action={moveToBusinessAction}>
                    <input type="hidden" name="id" value={entry.id} />
                    <input type="hidden" name="volver" value="/cajas" />
                    <SubmitButton variant="secondary" pendingText="…">Mover al negocio</SubmitButton>
                  </form>
                  <form action={dismissHintAction}>
                    <input type="hidden" name="id" value={entry.id} />
                    <button type="submit" className="h-10 rounded-md px-3 text-[13px] text-muted hover:text-ink">
                      Es personal
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[13px] text-muted">
        Cada caja es un mundo cerrado: la plata y la gente de una no se mezclan con las de otra. Lo único que pasa entre cajas es un movimiento a la vista: el sueldo que te pagás desde el negocio o un aporte. Ver{" "}
        <Link href="/ayuda/bitacora/mis-cajas" className="underline underline-offset-4">
          cómo funcionan las cajas
        </Link>
        .
      </p>
    </div>
  );
}
