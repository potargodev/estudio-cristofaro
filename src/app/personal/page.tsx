import { and, desc, eq, isNull, or } from "drizzle-orm";
import { CalendarClock, FileText, Gauge, LifeBuoy, ShieldCheck, Ship, Wallet } from "lucide-react";
import Link from "next/link";
import { FirstSteps } from "@/components/app/FirstSteps";
import { getDb } from "@/db";
import { accounting_expenses, studios } from "@/db/schema";
import { categoryName, formatMoney } from "@/modules/gastos/constants";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { VigiaPrompt } from "@/components/copiloto/VigiaPrompt";
import { money, monthLabel, monthOf } from "@/modules/bitacora/catalog";
import { monthSummary } from "@/modules/bitacora/server";
import { requireUser } from "@/modules/bitacora/session";
import { getPlan, planFullName } from "@/lib/faro/plans";
import { ownOrganization } from "@/lib/faro/tenants";

export const metadata = { title: { absolute: "Inicio · Faro" } };

const SOON = [
  { icon: FileText, title: "Facturación electrónica", text: "Facturas A, B, C y E con ARCA, con tu logo y link de pago." },
  { icon: Gauge, title: "Semáforo de monotributo", text: "Cuánto podés facturar sin pasarte y aviso de recategorización." },
  { icon: ShieldCheck, title: "Tu situación con ARCA", text: "Constancia y datos del padrón por web service oficial." },
  { icon: CalendarClock, title: "Calendario personal", text: "Tus vencimientos según tu CUIT, con el importe y alertas." },
];

const cuitFmt = (c: string | null) => (c ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : "—");

export default async function PersonalHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const titular = me.role === "titular" && me.tenantKind !== "studio";
  const month = monthOf();
  const [summary, t, own] = await Promise.all([
    monthSummary(me.id, month),
    titular ? getDb().select().from(studios).where(eq(studios.id, me.studioId)).then((r) => r[0]) : null,
    titular ? ownOrganization(me.studioId) : null,
  ]);
  // Gastos de la actividad: lo que marcó "de la empresa" o "deducible" en grupos conectados a su contabilidad
  const activity = titular
    ? await getDb()
        .select()
        .from(accounting_expenses)
        .where(and(eq(accounting_expenses.studio_id, me.studioId), own ? or(isNull(accounting_expenses.organization_id), eq(accounting_expenses.organization_id, own.id)) : isNull(accounting_expenses.organization_id)))
        .orderBy(desc(accounting_expenses.date))
        .limit(8)
    : [];
  const first = me.name.split(" ")[0];
  const ars = summary.byCurrency.ARS.now;
  const context = !titular
    ? "Tu espacio personal: tu Bitácora y tus grupos. Es privado."
    : `${t?.kind === "persona" ? (sp.bienvenida ? "Te damos la bienvenida a Faro" : "Tu espacio en Faro") : sp.bienvenida ? "Te damos la bienvenida a Faro Personal" : "Faro Personal"} · plan ${getPlan(t?.plan_key) ? planFullName(getPlan(t?.plan_key)!) : ""}${t?.kind !== "persona" ? ` · CUIT ${cuitFmt(t?.cuit ?? null)}` : ""}`;
  return (
    <div className="grid gap-6 pb-10">
      <PageHeader title={`Hola, ${first}.`} description={context} className="mb-0" />

      <VigiaPrompt />

      <section aria-labelledby="mes" className="rounded-md border border-line bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="mes" className="text-[17px] font-medium text-ink">
            Tu mes · {monthLabel(month)}
          </h2>
          <Link href="/bitacora" className="text-[14px] font-medium text-rose-deep underline-offset-4 hover:underline">
            Abrir la Bitácora
          </Link>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3">
          {[
            { k: "Entró", v: ars.in },
            { k: "Salió", v: ars.out },
            { k: "Queda", v: ars.left },
          ].map((x) => (
            <div key={x.k} className="min-w-0">
              <dt className="text-[13px] text-muted">{x.k}</dt>
              <dd className="num truncate text-[20px] text-ink sm:text-[24px]">{money(x.v)}</dd>
            </div>
          ))}
        </dl>
        {summary.byCategory.length > 0 && (
          <p className="mt-3 text-[13px] text-muted">
            En lo que más gastaste: {summary.byCategory.slice(0, 3).map((c) => c.name).join(", ")}.
          </p>
        )}
      </section>

      <Link href="/grupos" data-tour="grupos" className="group flex items-center gap-4 rounded-md border border-line bg-surface p-5 transition-colors hover:border-muted">
        <span className="grid size-12 shrink-0 place-items-center rounded-md bg-navy text-gold">
          <Wallet className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-medium text-ink">Grupos de gastos</span>
          <span className="block text-[14px] text-muted">Dividí gastos con socios, clientes o amigos. {titular ? "Lo deducible queda marcado para tu contabilidad." : "Faro calcula quién le debe a quién."}</span>
        </span>
        <span className="text-[14px] font-medium text-ink underline-offset-4 group-hover:underline">Abrir</span>
      </Link>

      {!titular ? null : (
        <>
      <FirstSteps />

      {activity.length > 0 && (
        <section aria-labelledby="actividad" className="border border-line bg-surface p-5">
          <h2 id="actividad" className="text-[17px] font-medium text-ink">
            Gastos de tu actividad
          </h2>
          <p className="mt-1 text-[14px] text-muted">Los que marcaste como de la actividad o deducibles, con su comprobante. Quedan listos para tu contabilidad.</p>
          <ul className="mt-3 divide-y divide-line">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 py-2.5 text-[14px]">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{a.description}</span>
                  <span className="block text-muted">
                    {a.date} · {categoryName(a.category)}
                    {a.deductible && " · deducible"}
                    {a.receipt_path && (
                      <>
                        {" · "}
                        <a href={`/api/gastos/archivo/contable/${a.id}`} target="_blank" className="text-rose-deep underline-offset-4 hover:underline">
                          comprobante
                        </a>
                      </>
                    )}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatMoney(a.amount, a.currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="pronto">
        <h2 id="pronto" className="text-[13px] font-medium uppercase tracking-wide text-muted">
          Próximamente
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {(t?.kind === "persona" ? [] : SOON).map((s) => (
            <li key={s.title} className="flex gap-3 border border-dashed border-line bg-surface/60 p-4">
              <s.icon className="mt-0.5 size-5 shrink-0 text-gold-ink" strokeWidth={1.5} aria-hidden />
              <span>
                <span className="block font-medium text-ink">{s.title}</span>
                <span className="block text-[14px] text-muted">{s.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Link href="/flotas" className="group flex items-center gap-4 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-muted">
        <span className="grid size-12 shrink-0 place-items-center rounded-md bg-navy text-gold">
          <Ship className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-medium text-ink">Flotas</span>
          <span className="block text-[14px] text-muted">Entre 3 y 20 personas piden juntas una propuesta a un estudio. Cada uno firma su acuerdo y paga solo lo suyo.</span>
        </span>
        <span className="text-[14px] font-medium text-ink underline-offset-4 group-hover:underline">Abrir</span>
      </Link>

      <Link href="/red" className="group flex items-center gap-4 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-muted">
        <span className="grid size-12 shrink-0 place-items-center rounded-md bg-navy text-gold">
          <LifeBuoy className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-medium text-ink">Necesito un contador</span>
          <span className="block text-[14px] text-muted">Compará estudios de la Red: matrícula verificada, reseñas de clientes reales y un orden sin posiciones pagas. Tus números no se comparten hasta que vos lo autorices.</span>
        </span>
        <span className="text-[14px] font-medium text-ink underline-offset-4 group-hover:underline">Ver la Red</span>
      </Link>
        </>
      )}
    </div>
  );
}
