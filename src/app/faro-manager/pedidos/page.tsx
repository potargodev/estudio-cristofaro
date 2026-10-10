import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { getDb } from "@/db";
import { plan_requests, studios, users } from "@/db/schema";
import { requireFaro } from "@/lib/auth";
import { getPlans } from "@/lib/faro/entitlements";
import { planFullName } from "@/lib/faro/plans";
import { resolvePlanRequestAction } from "../catalog-actions";

export const metadata: Metadata = { title: "Pedidos de plan" };

const when = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** "Quiero mejorar mi plan": pedidos de los tenants (el cobro llega en la F7) */
export default async function PedidosPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireFaro();
  const [rows, plans] = await Promise.all([
    getDb()
      .select({ r: plan_requests, tenant: studios.name, email: users.email })
      .from(plan_requests)
      .innerJoin(studios, eq(studios.id, plan_requests.studio_id))
      .leftJoin(users, eq(users.id, plan_requests.requested_by))
      .orderBy(desc(plan_requests.created_at))
      .limit(200),
    getPlans(),
  ]);
  const name = (k: string) => {
    const p = plans.find((x) => x.key === k);
    return p ? planFullName(p) : k;
  };
  return (
    <>
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      <PageHeader title="Pedidos de plan" description="Tenants que pidieron mejorar su plan. Aplicarlo cambia el plan ahora (los planes pagos arrancan con su prueba)." />
      <ul className="grid gap-3">
        {rows.length === 0 && <li className="text-muted">No hay pedidos.</li>}
        {rows.map(({ r, tenant, email }) => (
          <li key={r.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-4" data-testid="pedido">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                <Link href={`/faro-manager/${r.studio_id}`} className="hover:underline">
                  {tenant}
                </Link>{" "}
                <span className="font-normal text-muted">
                  · {name(r.from_plan)} → <strong className="text-ink">{name(r.to_plan)}</strong>
                </span>
              </p>
              <p className="text-[13px] text-muted">
                {when.format(r.created_at)} · {email ?? "—"}
                {r.module_key && ` · por el módulo ${r.module_key}`}
                {r.message && ` · “${r.message}”`}
              </p>
            </div>
            {r.status === "pendiente" && me.faroRole === "faro_owner" ? (
              <div className="flex gap-2">
                <form action={resolvePlanRequestAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="aplicar" />
                  <button className="h-9 rounded-md bg-navy px-4 text-[13px] text-paper hover:bg-navy-deep">Aplicar el cambio</button>
                </form>
                <form action={resolvePlanRequestAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="descartar" />
                  <button className="h-9 rounded-md border border-line px-4 text-[13px] hover:border-muted">Descartar</button>
                </form>
              </div>
            ) : (
              <span className="rounded-md bg-navy-soft px-2 py-1 text-[12px] text-muted">{r.status === "pendiente" ? "Pendiente" : r.status === "aplicado" ? "Aplicado" : "Descartado"}</span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
