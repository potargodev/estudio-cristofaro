import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { getDb } from "@/db";
import { audit_log, studios } from "@/db/schema";
import { requireFaro } from "@/lib/auth";
import { auditLabel } from "@/lib/audit";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Auditoría de plataforma" };

const when = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

const FILTERS: [string, string][] = [
  ["", "Todo lo de Faro"],
  ["faro.", "Faro Manager"],
  ["faro.asistido", "Accesos asistidos"],
  ["plantilla.", "Plantillas"],
  ["plan.", "Pedidos de plan"],
  ["permiso.denegado", "Accesos denegados"],
];

/** Auditoría de plataforma: lo que hace el equipo de Faro y los eventos de nivel plataforma */
export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const sp = await searchParams;
  await requireFaro();
  const f = FILTERS.some(([k]) => k === sp.f) ? sp.f! : "";
  const platform = or(ilike(audit_log.action, "faro.%"), ilike(audit_log.action, "plantilla.%"), ilike(audit_log.action, "plan.%"), isNull(audit_log.studio_id));
  const rows = await getDb()
    .select({ a: audit_log, tenant: studios.name })
    .from(audit_log)
    .leftJoin(studios, eq(studios.id, audit_log.studio_id))
    .where(and(f ? ilike(audit_log.action, `${f}%`) : platform, sp.q ? ilike(audit_log.actor_label, `%${sp.q.replace(/[%_]/g, "")}%`) : undefined))
    .orderBy(desc(audit_log.created_at))
    .limit(300);
  return (
    <>
      <PageHeader title="Auditoría de plataforma" description="Cada acción del equipo de Faro (planes, módulos, accesos asistidos, plantillas) y los accesos denegados, con quién, cuándo y en qué tenant." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={`/faro-manager/auditoria${k ? `?f=${encodeURIComponent(k)}` : ""}`} className={cn("rounded-md border px-3 py-1.5 text-[13px]", f === k ? "border-navy bg-navy text-paper" : "border-line bg-surface hover:border-muted")}>
            {label}
          </Link>
        ))}
        <form className="ml-auto" action="/faro-manager/auditoria">
          {f && <input type="hidden" name="f" value={f} />}
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por persona" aria-label="Buscar por persona" className="h-9 w-56 rounded-md border border-line bg-surface px-2 text-[14px]" />
        </form>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[820px] text-left text-[13px]">
          <thead className="border-b border-line text-[12px] text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Cuándo</th>
              <th className="py-2 font-medium">Acción</th>
              <th className="py-2 font-medium">Quién</th>
              <th className="py-2 font-medium">Tenant</th>
              <th className="px-4 py-2 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ a, tenant }) => (
              <tr key={a.id} className={a.result === "denegado" ? "bg-[#fbecea]" : undefined}>
                <td className="whitespace-nowrap px-4 py-2 tabular-nums">{when.format(a.created_at)}</td>
                <td className="py-2">
                  {auditLabel(a.action)} <code className="ml-1 text-[11px] text-muted">{a.action}</code>
                </td>
                <td className="py-2">{a.actor_label ?? "—"}</td>
                <td className="py-2">{tenant ?? "Plataforma"}</td>
                <td className="max-w-[360px] truncate px-4 py-2 text-muted" title={JSON.stringify(a.metadata)}>
                  {JSON.stringify(a.metadata)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted">
                  Sin eventos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
