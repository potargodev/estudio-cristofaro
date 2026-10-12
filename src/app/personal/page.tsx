import { and, desc, eq, isNull, or } from "drizzle-orm";
import { ArrowRight, Boxes, FileText, LifeBuoy, Ship, Wallet } from "lucide-react";
import Link from "next/link";
import { FirstSteps } from "@/components/app/FirstSteps";
import { getDb } from "@/db";
import { accounting_expenses, studios } from "@/db/schema";
import { categoryName } from "@/modules/gastos/constants";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { VigiaPrompt } from "@/components/copiloto/VigiaPrompt";
import { Derivaciones } from "@/components/escudo/Derivaciones";
import { ModeBadge } from "@/components/conexiones/ModeBadge";
import { monthOf } from "@/modules/bitacora/catalog";
import { monthSummary } from "@/modules/bitacora/server";
import { listInsights } from "@/modules/bitacora/recurring";
import { Insights } from "@/components/bitacora/Insights";
import { requireUser } from "@/modules/bitacora/session";
import { getPlan, planFullName } from "@/lib/faro/plans";
import { ownOrganization } from "@/lib/faro/tenants";
import { myBoxes } from "@/modules/cajas/server";
import { formatMoney, formatPeriod } from "@/lib/format";

export const metadata = { title: { absolute: "Inicio · Faro" } };


const cuitFmt = (c: string | null) => (c ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : "—");

export default async function PersonalHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const titular = me.role === "titular" && me.tenantKind !== "studio";
  const month = monthOf();
  const [summary, t, own, insights] = await Promise.all([
    monthSummary(me.id, month),
    titular ? getDb().select().from(studios).where(eq(studios.id, me.studioId)).then((r) => r[0]) : null,
    titular ? ownOrganization(me.studioId) : null,
    listInsights(me.id, 3),
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
  const boxesList = await myBoxes(me.id);
  const business = boxesList.find((b) => b.kind === "negocio");
  const shared = boxesList.filter((b) => b.kind === "compartida").length;
  const first = me.name.split(" ")[0];
  const ars = summary.byCurrency.ARS.now;
  const context = !titular
    ? "Tu espacio personal: tu Bitácora y tus grupos. Es privado."
    : `${t?.kind === "persona" ? (sp.bienvenida ? "Te damos la bienvenida a Faro" : "Tu espacio en Faro") : sp.bienvenida ? "Te damos la bienvenida a Faro Personal" : "Faro Personal"} · plan ${getPlan(t?.plan_key) ? planFullName(getPlan(t?.plan_key)!) : ""}${t?.kind !== "persona" ? ` · CUIT ${cuitFmt(t?.cuit ?? null)}` : ""}`;
  return (
    <div className="grid gap-6 pb-10 [&>*]:min-w-0">
      <PageHeader title={`Hola, ${first}.`} description={context} className="mb-0" />

      <VigiaPrompt />

      {titular && <ModeBadge userId={me.id} />}

      {titular && <Derivaciones me={me} volver="/personal" />}

      <Insights items={insights} volver="/personal" />

      <section aria-labelledby="mes" className="rounded-md border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="mes" className="text-title font-semibold text-ink">
            Tu mes · {formatPeriod(month)}
          </h2>
          <Link href="/bitacora" className="text-ui font-medium text-rose-deep underline-offset-4 hover:underline">
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
              <dt className="text-meta text-muted">{x.k}</dt>
              <dd className="num truncate text-section text-ink sm:text-headline">{formatMoney(x.v, "ARS", { decimals: "auto" })}</dd>
            </div>
          ))}
        </dl>
        {summary.byCategory.length > 0 && (
          <p className="mt-3 text-meta text-muted">
            En lo que más gastaste: {summary.byCategory.slice(0, 3).map((c) => c.name).join(", ")}.
          </p>
        )}
      </section>

      <section aria-labelledby="accesos">
        <h2 id="accesos" className="sr-only">
          Tus lugares en Faro
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2" data-tour="grupos">
          {[
            { href: "/cajas", icon: Boxes, title: "Mis cajas", text: business ? `Personal y ${business.name}${shared ? `, más ${shared} compartida${shared === 1 ? "" : "s"}` : ""}: cada plata en su caja.` : "Tu caja personal, la de tu negocio y las que compartís con otros." },
            { href: "/grupos", icon: Wallet, title: "Grupos de gastos", text: titular ? "Dividí gastos con socios, clientes o amigos. Lo deducible queda marcado." : "Dividí gastos y Faro calcula quién le debe a quién." },
            ...(titular && t?.kind === "personal" ? [{ href: "/facturacion", icon: FileText, title: "Facturación", text: "Comprobantes con ARCA, el semáforo de monotributo y tu calendario." }] : []),
            ...(titular ? [{ href: "/contador", icon: LifeBuoy, title: "Contador", text: "Buscá un estudio en la Red Contable o conectá el tuyo. Tus números no se comparten sin tu permiso." }] : []),
            ...(titular ? [{ href: "/flotas", icon: Ship, title: "Flotas", text: "Entre 3 y 20 personas piden juntas una propuesta a un estudio." }] : []),
          ].map((x) => (
            <li key={x.href}>
              <Link href={x.href} className="group flex h-full items-start gap-3 rounded-md border border-line bg-surface p-4 transition-colors hover:border-navy/40 sm:p-5">
                <x.icon className="mt-0.5 size-5 shrink-0 text-rose-deep" strokeWidth={1.6} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold text-ink group-hover:underline group-hover:underline-offset-4">{x.title}</span>
                  <span className="mt-0.5 block text-meta text-muted">{x.text}</span>
                </span>
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {titular && <FirstSteps />}

      {titular && activity.length > 0 && (
        <section aria-labelledby="actividad" className="rounded-md border border-line bg-surface p-4 sm:p-5">
          <h2 id="actividad" className="text-title font-semibold text-ink">
            Gastos de tu actividad
          </h2>
          <p className="mt-1 text-ui text-muted">Los que marcaste como de la actividad o deducibles, con su comprobante. Quedan listos para tu contabilidad.</p>
          <ul className="mt-3 divide-y divide-line">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 py-2.5 text-ui">
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
                <span className="num shrink-0">{formatMoney(a.amount, a.currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
