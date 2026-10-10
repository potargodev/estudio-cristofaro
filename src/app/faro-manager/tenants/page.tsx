import { and, desc, eq, gte, ilike, sql } from "drizzle-orm";
import { Building2, Compass, Sparkles, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { StatusBadge, Tag } from "@/components/admin/kit/StatusBadge";
import { getDb } from "@/db";
import { ai_usage, organizations, studios, users } from "@/db/schema";
import { requireFaro } from "@/lib/auth";
import { getPlan, KIND_LABEL, PLANS, planFullName, type TenantKind } from "@/lib/faro/plans";
import { likeTerm } from "@/lib/search";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tenants" };


const day = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });
const usd = (n: number) => `US$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

function Metric({ label, value, hint, icon: Icon }: { label: string; value: string | number; hint?: string; icon: typeof Building2 }) {
  return (
    <div className="border border-line bg-surface px-5 py-4">
      <p className="flex items-center gap-2 text-[13px] text-muted">
        <Icon className="size-4 text-rose-deep" strokeWidth={1.5} aria-hidden /> {label}
      </p>
      <p className="mt-1 font-display text-[34px] leading-none text-ink">{value}</p>
      {hint && <p className="mt-1.5 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

/**
 * Faro Manager: métricas de uso por tipo de tenant y la lista de tenants. No
 * muestra datos de clientes (solo cantidades): para ver adentro de un estudio
 * hace falta un acceso asistido.
 */
export default async function FaroManagerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requireFaro();
  const kind = sp.tipo === "studio" || sp.tipo === "personal" || sp.tipo === "persona" ? (sp.tipo as TenantKind) : null;
  const plan = getPlan(sp.plan)?.key ?? null;
  const status = sp.estado === "activo" || sp.estado === "prueba" || sp.estado === "suspendido" ? sp.estado : null;
  const db = getDb();
  const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const orgCount = sql<number>`(select count(*)::int from ${organizations} o where o.studio_id = "studios"."id" and o.status <> 'baja')`;
  const staffCount = sql<number>`(select count(*)::int from ${users} u where u.studio_id = "studios"."id" and u.active and u.role in ('dueno','contador','colaborador','titular'))`;
  const aiMonth = sql<string>`(select coalesce(sum(a.cost_usd), 0) from ${ai_usage} a where a.studio_id = "studios"."id" and a.created_at >= ${month.toISOString()})`;
  const [rows, byKind] = await Promise.all([
    db
      .select({ t: studios, orgs: orgCount, staff: staffCount, ai: aiMonth })
      .from(studios)
      .where(
        and(
          kind ? eq(studios.kind, kind) : undefined,
          plan ? eq(studios.plan_key, plan) : undefined,
          status ? eq(studios.status, status) : undefined,
          sp.q?.trim() ? ilike(studios.name, likeTerm(sp.q)) : undefined,
        ),
      )
      .orderBy(desc(studios.created_at))
      .limit(500),
    db
      .select({
        kind: studios.kind,
        plan: studios.plan_key,
        n: sql<number>`count(*)::int`,
        nuevos: sql<number>`count(*) filter (where ${studios.created_at} >= now() - interval '30 days')::int`,
        registro: sql<number>`count(*) filter (where ${studios.created_via} = 'registro')::int`,
        suspendidos: sql<number>`count(*) filter (where ${studios.status} = 'suspendido')::int`,
        orgs: sql<number>`coalesce(sum(${orgCount}), 0)::int`,
        ai: sql<string>`coalesce(sum(${aiMonth}), 0)`,
      })
      .from(studios)
      .where(gte(studios.created_at, new Date(0)))
      .groupBy(studios.kind, studios.plan_key),
  ]);
  const sum = (k: TenantKind | null, f: (r: (typeof byKind)[number]) => number) => byKind.filter((r) => !k || r.kind === k).reduce((s, r) => s + f(r), 0);
  const filters: [string, string | null, [string | null, string][]][] = [
    ["tipo", kind, [[null, "Todos"], ["studio", "Estudios"], ["personal", "Autónomos"], ["persona", "Personas"]]],
    ["estado", status, [[null, "Todos"], ["activo", "Activos"], ["prueba", "En prueba"], ["suspendido", "Suspendidos"]]],
  ];
  const href = (k: string, v: string | null) => {
    const q = new URLSearchParams(Object.entries({ tipo: kind, plan, estado: status, q: sp.q ?? null, [k]: v }).filter((e): e is [string, string] => !!e[1]));
    return `/faro-manager/tenants${q.size ? `?${q}` : ""}`;
  };

  return (
    <div>
      <PageHeader title="Tenants" description="Estudios, autónomos y personas que usan Faro, con su plan, estado y uso. Sin datos de clientes: para entrar a un tenant, pedí un acceso asistido desde su ficha." actions={<Link href="/faro-manager/nuevo" className="inline-flex h-9 items-center rounded-md bg-navy px-4 text-[13px] text-paper hover:bg-navy-deep">Alta manual</Link>} />
      <section aria-label="Por plan" className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {PLANS.map((p) => (
          <Link key={p.key} href={href("plan", plan === p.key ? null : p.key)} className={cn("border bg-surface px-4 py-3 hover:border-muted", plan === p.key ? "border-navy" : "border-line")}>
            <p className="text-[12px] text-muted">{KIND_LABEL[p.kind]}</p>
            <p className="font-medium text-ink">{p.name}</p>
            <p className="font-display text-[26px] leading-tight text-ink">{byKind.find((r) => r.plan === p.key)?.n ?? 0}</p>
          </Link>
        ))}
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {filters.map(([k, cur, opts]) => (
          <div key={k} className="flex items-center gap-1" role="group" aria-label={k === "tipo" ? "Tipo de tenant" : "Estado"}>
            {opts.map(([v, label]) => (
              <Link key={label} href={href(k, v)} aria-current={cur === v ? "true" : undefined} className={cn("border px-3 py-1.5 text-[13px]", cur === v ? "border-navy bg-navy text-paper" : "border-line bg-surface text-ink hover:border-muted")}>
                {label}
              </Link>
            ))}
          </div>
        ))}
        <form className="ml-auto flex gap-2" action="/faro-manager/tenants">
          {kind && <input type="hidden" name="tipo" value={kind} />}
          <label htmlFor="q" className="sr-only">
            Buscar
          </label>
          <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por nombre" className="h-9 w-56 border border-line bg-surface px-2 text-[14px]" />
        </form>
      </div>

      <div className="mt-4 overflow-x-auto border border-line bg-surface">
        <table className="w-full min-w-[760px] text-left text-[14px]">
          <thead className="text-[12px] uppercase tracking-wide text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-2 font-medium">Tenant</th>
              <th className="py-2 font-medium">Tipo</th>
              <th className="py-2 font-medium">Plan</th>
              <th className="py-2 font-medium">Estado</th>
              <th className="py-2 text-right font-medium">Organizaciones</th>
              <th className="py-2 text-right font-medium">Usuarios</th>
              <th className="py-2 text-right font-medium">IA del mes</th>
              <th className="px-4 py-2 font-medium">Alta</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-muted">
                  No hay tenants con esos filtros.
                </td>
              </tr>
            )}
            {rows.map(({ t, orgs, staff, ai }) => (
              <tr key={t.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5">
                  <Link href={`/faro-manager/${t.id}`} className="font-medium text-ink underline-offset-4 hover:underline">
                    {t.name}
                  </Link>
                  <span className="block text-[12px] text-muted">{t.slug}</span>
                </td>
                <td className="py-2.5">{KIND_LABEL[t.kind]}</td>
                <td className="py-2.5">
                  <Tag>{getPlan(t.plan_key) ? planFullName(getPlan(t.plan_key)!) : t.plan_key}</Tag>
                </td>
                <td className="py-2.5">
                  <StatusBadge status={t.status === "activo" ? "activa" : t.status === "prueba" ? "onboarding" : "pausada"} label={t.status === "activo" ? "Activo" : t.status === "prueba" ? `Prueba${t.trial_ends_at ? ` hasta ${day.format(t.trial_ends_at)}` : ""}` : "Suspendido"} />
                </td>
                <td className="py-2.5 text-right">{t.kind === "studio" ? orgs : "—"}</td>
                <td className="py-2.5 text-right">{staff}</td>
                <td className="py-2.5 text-right">{usd(Number(ai))}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {day.format(t.created_at)} <span className="text-[12px] text-muted">· {t.created_via === "registro" ? "autoregistro" : t.created_via}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
