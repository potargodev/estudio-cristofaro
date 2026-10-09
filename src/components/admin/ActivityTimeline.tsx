import { and, desc, eq, lt } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/portal/ui";
import { getDb } from "@/db";
import { audit_log } from "@/db/schema";
import { auditLabel } from "@/lib/audit";

const fmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const PAGE = 50;

/** Detalle legible de los metadatos más comunes */
function detail(meta: Record<string, unknown>) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    parts.push(`${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  }
  return parts.join(" · ");
}

/** Línea de tiempo de la organización, desde la auditoría (más reciente primero) */
export async function ActivityTimeline({ orgId, studioId, before }: { orgId: string; studioId: string; before?: string }) {
  const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null;
  const rows = await getDb()
    .select()
    .from(audit_log)
    .where(
      and(eq(audit_log.organization_id, orgId), eq(audit_log.studio_id, studioId), beforeDate ? lt(audit_log.created_at, beforeDate) : undefined),
    )
    .orderBy(desc(audit_log.created_at))
    .limit(PAGE + 1);
  const more = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  if (list.length === 0) return <p className="rounded-md border border-dashed border-line p-6 text-muted">Todavía no hay actividad registrada.</p>;
  return (
    <div>
      <ol className="relative space-y-4 border-l border-line pl-6">
        {list.map((e) => (
          <li key={e.id} className="relative">
            <span
              aria-hidden
              className={`absolute -left-[29px] top-1.5 size-2.5 rounded-full ring-4 ring-paper ${e.result === "ok" ? "bg-rose" : "bg-danger"}`}
            />
            <p className="text-[15px]">
              <span className="font-medium">{auditLabel(e.action)}</span>
              {e.result !== "ok" && (
                <span className="ml-2">
                  <Badge tone="danger">{e.result === "denegado" ? "Denegado" : "Error"}</Badge>
                </span>
              )}
            </p>
            <p className="text-sm text-muted">
              {fmt.format(e.created_at)} · {e.actor_label ?? "sistema"}
              {e.ip ? ` · IP ${e.ip}` : ""}
            </p>
            {Object.keys(e.metadata ?? {}).length > 0 && <p className="mt-0.5 text-sm text-ink/70">{detail(e.metadata)}</p>}
          </li>
        ))}
      </ol>
      {more && (
        <Link
          href={`/admin/organizaciones/${orgId}?tab=actividad&antes=${encodeURIComponent(list.at(-1)!.created_at.toISOString())}`}
          className="mt-6 inline-block text-rose-deep hover:underline"
        >
          Ver actividad anterior
        </Link>
      )}
    </div>
  );
}
