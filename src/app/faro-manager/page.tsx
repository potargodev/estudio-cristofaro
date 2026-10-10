import { and, count, eq, gte, isNull, gt, or, sql } from "drizzle-orm";
import { Building2, ClipboardList, Factory, NotebookPen, Sparkles, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { getDb } from "@/db";
import { ai_usage, organization_industries, organizations, plan_requests, studios, tenant_modules, users } from "@/db/schema";
import { requireFaro } from "@/lib/auth";
import { getPlans } from "@/lib/faro/entitlements";
import { KIND_PLANS_LABEL, type TenantKind } from "@/lib/faro/plans";
import { FARO_MODULES } from "@/modules/registry";
import { INDUSTRY_NAMES } from "@/modules/industries/catalog";

export const metadata: Metadata = { title: "Resumen" };

const usd = (n: number) => `USD ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

function Metric({ label, value, hint, icon: Icon, href }: { label: string; value: string | number; hint?: string; icon: typeof Building2; href?: string }) {
  const body = (
    <>
      <span className="grid size-10 place-items-center rounded-md bg-navy text-gold">
        <Icon className="size-5" strokeWidth={1.6} aria-hidden />
      </span>
      <p className="mt-4 text-[14px] font-medium text-muted">{label}</p>
      <p className="mt-1 font-display text-[44px] leading-none text-ink">{value}</p>
      {hint && <p className="mt-2 text-[13px] text-muted">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-lg border border-line bg-surface p-5 transition-colors hover:border-muted">
      {body}
    </Link>
  ) : (
    <div className="rounded-lg border border-line bg-surface p-5">{body}</div>
  );
}

/**
 * Resumen de la plataforma: tenants por tipo y estado, organizaciones,
 * usuarios, altas del mes, uso de módulos y plantillas aplicadas. Solo
 * cantidades: ningún dato de clientes.
 */
export default async function FaroResumen() {
  await requireFaro();
  const db = getDb();
  const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [byKind, [orgs], userRows, plans, overrides, templates, [pending], [ai]] = await Promise.all([
    db
      .select({
        kind: studios.kind,
        plan: studios.plan_key,
        status: studios.status,
        n: count(),
        mes: sql<number>`count(*) filter (where ${studios.created_at} >= ${month.toISOString()})::int`,
      })
      .from(studios)
      .groupBy(studios.kind, studios.plan_key, studios.status),
    db.select({ n: count() }).from(organizations).innerJoin(studios, eq(studios.id, organizations.studio_id)).where(and(eq(studios.kind, "studio"), sql`${organizations.status} <> 'baja'`)),
    db.select({ role: users.role, n: count() }).from(users).where(eq(users.active, true)).groupBy(users.role),
    getPlans(),
    db
      .select({ module: tenant_modules.module_key, enabled: tenant_modules.enabled, n: count() })
      .from(tenant_modules)
      .where(or(isNull(tenant_modules.expires_at), gt(tenant_modules.expires_at, new Date())))
      .groupBy(tenant_modules.module_key, tenant_modules.enabled),
    db.select({ key: organization_industries.industry_key, n: count() }).from(organization_industries).groupBy(organization_industries.industry_key),
    db.select({ n: count() }).from(plan_requests).where(eq(plan_requests.status, "pendiente")),
    db.select({ usd: sql<string>`coalesce(sum(${ai_usage.cost_usd}), 0)` }).from(ai_usage).where(gte(ai_usage.created_at, month)),
  ]);
  const tenants = (k?: TenantKind, st?: string) => byKind.filter((r) => (!k || r.kind === k) && (!st || r.status === st)).reduce((s, r) => s + r.n, 0);
  const newThisMonth = byKind.reduce((s, r) => s + r.mes, 0);
  const people = (roles: string[]) => userRows.filter((u) => roles.includes(u.role)).reduce((s, u) => s + u.n, 0);
  // Uso de módulos: tenants cuyo plan lo incluye, más overrides vigentes
  const moduleUse = FARO_MODULES.filter((m) => !m.core)
    .map((m) => {
      const byPlan = byKind.filter((r) => plans.find((p) => p.key === r.plan)?.modules.includes(m.key)).reduce((s, r) => s + r.n, 0);
      const plus = overrides.filter((o) => o.module === m.key && o.enabled).reduce((s, o) => s + o.n, 0);
      const minus = overrides.filter((o) => o.module === m.key && !o.enabled).reduce((s, o) => s + o.n, 0);
      return { m, n: Math.max(0, byPlan + plus - minus), plus };
    })
    .sort((a, b) => b.n - a.n);
  const maxUse = Math.max(1, ...moduleUse.map((x) => x.n));
  return (
    <>
      <PageHeader title="Resumen" description="Cómo viene la plataforma. Solo cantidades: para ver adentro de un tenant hace falta un acceso asistido." />
      <section aria-label="Tenants" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Building2} label="Estudios" value={tenants("studio")} hint={`${tenants("studio", "prueba")} en prueba · ${tenants("studio", "suspendido")} suspendidos`} href="/faro-manager/tenants?tipo=studio" />
        <Metric icon={UserRound} label="Autónomos" value={tenants("personal")} hint={`${tenants("personal", "prueba")} en prueba`} href="/faro-manager/tenants?tipo=personal" />
        <Metric icon={NotebookPen} label="Personas" value={tenants("persona")} hint="Bitácora, grupos y Flotas" href="/faro-manager/tenants?tipo=persona" />
        <Metric icon={Sparkles} label="Altas del mes" value={newThisMonth} hint={`IA del mes: ${usd(Number(ai?.usd ?? 0))}`} />
      </section>
      <section aria-label="Uso" className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Building2} label="Organizaciones gestionadas" value={orgs?.n ?? 0} hint="De estudios, sin contar las propias de autónomos" />
        <Metric icon={Users} label="Usuarios activos" value={people(["dueno", "contador", "colaborador", "titular", "cliente"])} hint={`${people(["dueno", "contador", "colaborador"])} de estudios · ${people(["cliente"])} de organizaciones · ${people(["titular"])} titulares`} />
        <Metric icon={Factory} label="Plantillas aplicadas" value={templates.reduce((s, t) => s + t.n, 0)} hint={templates.length ? `Más usada: ${INDUSTRY_NAMES[templates.sort((a, b) => b.n - a.n)[0].key] ?? "—"}` : "Todavía ninguna"} href="/faro-manager/plantillas" />
        <Metric icon={ClipboardList} label="Pedidos de plan" value={pending?.n ?? 0} hint="Pendientes de responder" href="/faro-manager/pedidos" />
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-[17px] font-semibold">Tenants por plan</h2>
          <ul className="mt-4 grid gap-2 text-[14px]">
            {plans.map((p) => {
              const n = byKind.filter((r) => r.plan === p.key).reduce((s, r) => s + r.n, 0);
              return (
                <li key={p.key} className="flex items-center justify-between gap-3 border-b border-line pb-2">
                  <Link href={`/faro-manager/tenants?plan=${p.key}`} className="hover:underline">
                    {KIND_PLANS_LABEL[p.kind]} · <strong className="font-semibold">{p.name}</strong>
                  </Link>
                  <span className="tabular-nums">{n}</span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-[17px] font-semibold">Uso de módulos</h2>
          <p className="text-[13px] text-muted">Tenants que lo tienen activo (por plan u override).</p>
          <ul className="mt-4 grid gap-2.5 text-[14px]">
            {moduleUse.slice(0, 12).map(({ m, n, plus }) => (
              <li key={m.key}>
                <div className="flex justify-between gap-3">
                  <span>
                    {m.name}
                    {plus > 0 && <span className="ml-1 text-[12px] text-muted">· {plus} por override</span>}
                  </span>
                  <span className="tabular-nums">{n}</span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-navy-soft">
                  <div className="gastos-bar h-full rounded bg-navy" style={{ width: `${(n / maxUse) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
