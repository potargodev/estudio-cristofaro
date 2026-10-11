import { desc, eq, gte, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { getDb } from "@/db";
import { ai_usage, studios } from "@/db/schema";
import { requireFaro } from "@/lib/auth";

export const metadata: Metadata = { title: "Uso y costos de IA" };

const usd = (v: string | number) => `USD ${Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n = (v: number) => v.toLocaleString("es-AR");

/**
 * Uso y costos de IA del mes (Plataforma): llamadas, tokens y costo estimado
 * por tenant y por modelo. Solo cantidades: nunca el contenido de las
 * conversaciones.
 */
export default async function UsoIaPage() {
  await requireFaro();
  const now = new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const db = getDb();
  const cost = sql<string>`coalesce(sum(${ai_usage.cost_usd}), 0)`;
  const calls = sql<number>`count(*)::int`;
  const tokens = sql<number>`coalesce(sum(${ai_usage.input_tokens} + ${ai_usage.output_tokens}), 0)::int`;
  const [[total], byTenant, byModel] = await Promise.all([
    db.select({ cost, calls, tokens }).from(ai_usage).where(gte(ai_usage.created_at, month)),
    db
      .select({ id: studios.id, name: studios.name, kind: studios.kind, cost, calls, tokens })
      .from(ai_usage)
      .innerJoin(studios, eq(studios.id, ai_usage.studio_id))
      .where(gte(ai_usage.created_at, month))
      .groupBy(studios.id, studios.name, studios.kind)
      .orderBy(desc(cost))
      .limit(50),
    db
      .select({ provider: ai_usage.provider_kind, model: ai_usage.model, cost, calls, tokens })
      .from(ai_usage)
      .where(gte(ai_usage.created_at, month))
      .groupBy(ai_usage.provider_kind, ai_usage.model)
      .orderBy(desc(cost))
      .limit(30),
  ]);
  const monthName = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(month);
  return (
    <div className="grid gap-6">
      <PageHeader level={2} title="Uso y costos de IA" description={`Costo estimado de ${monthName} (tokens × precios del catálogo), por tenant y por modelo. Sin contenido de conversaciones.`} className="mb-0" />
      <dl className="grid grid-cols-3 gap-3">
        {[
          { k: "Costo estimado", v: usd(total?.cost ?? 0) },
          { k: "Llamadas", v: n(total?.calls ?? 0) },
          { k: "Tokens", v: n(total?.tokens ?? 0) },
        ].map((x) => (
          <div key={x.k} className="rounded-md border border-line bg-surface p-4">
            <dt className="text-meta text-muted">{x.k}</dt>
            <dd className="num mt-1 text-headline text-ink">{x.v}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="por-tenant" className="rounded-md border border-line bg-surface">
        <h3 id="por-tenant" className="border-b border-line px-4 py-3 text-body font-semibold">
          Por tenant
        </h3>
        {byTenant.length === 0 ? (
          <p className="px-4 py-4 text-ui text-muted">Todavía no hubo uso este mes.</p>
        ) : (
          <ul className="divide-y divide-line text-ui">
            {byTenant.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <Link href={`/faro-manager/${t.id}`} className="min-w-0 truncate text-ink underline-offset-4 hover:underline">
                  {t.name}
                </Link>
                <span className="num text-muted">
                  {n(t.calls)} llamadas · {n(t.tokens)} tokens · <span className="text-ink">{usd(t.cost)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="por-modelo" className="rounded-md border border-line bg-surface">
        <h3 id="por-modelo" className="border-b border-line px-4 py-3 text-body font-semibold">
          Por modelo
        </h3>
        {byModel.length === 0 ? (
          <p className="px-4 py-4 text-ui text-muted">Todavía no hubo uso este mes.</p>
        ) : (
          <ul className="divide-y divide-line text-ui">
            {byModel.map((m) => (
              <li key={`${m.provider}-${m.model}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="min-w-0 truncate text-ink">
                  {m.model} <span className="text-muted">· {m.provider}</span>
                </span>
                <span className="num text-muted">
                  {n(m.calls)} llamadas · {n(m.tokens)} tokens · <span className="text-ink">{usd(m.cost)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
