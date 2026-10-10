import { and, asc, desc, eq, gte, type SQL } from "drizzle-orm";
import { Video } from "lucide-react";
import { Badge } from "@/components/portal/ui";
import { getDb } from "@/db";
import { bookings, users } from "@/db/schema";
import { fmtDateTime } from "@/lib/agenda/time";

const ORIGIN: Record<string, string> = { web: "Web", portal: "Portal", estudio: "Estudio" };

/** Lista de llamadas (próximas del estudio, o historial de una consulta u organización) */
export async function CallsList({ studioId, where, upcoming = false, empty }: { studioId: string; where?: SQL; upcoming?: boolean; empty: string }) {
  const rows = await getDb()
    .select({ b: bookings, host: users.name })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.host_user_id))
    .where(
      and(
        eq(bookings.studio_id, studioId),
        where,
        upcoming ? and(gte(bookings.starts_at, new Date()), eq(bookings.status, "confirmada")) : undefined,
      ),
    )
    .orderBy(upcoming ? asc(bookings.starts_at) : desc(bookings.starts_at))
    .limit(upcoming ? 6 : 20);
  if (rows.length === 0) return <p className="border border-dashed border-line p-4 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line border border-line bg-surface">
      {rows.map(({ b, host }) => (
        <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="min-w-0">
            <span className="block text-[15px] font-medium first-letter:uppercase">{fmtDateTime(b.starts_at)}</span>
            <span className="block truncate text-sm text-muted">
              {b.name} · con {host} · {ORIGIN[b.origin]}
              {b.reason ? ` · ${b.reason}` : ""}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {b.status === "cancelada" ? (
              <Badge tone="neutral">Cancelada</Badge>
            ) : b.starts_at < new Date() ? (
              <Badge tone="ok">Realizada</Badge>
            ) : (
              <Badge tone="warn">Próxima</Badge>
            )}
            {b.meet_url && b.status === "confirmada" && b.starts_at >= new Date() && (
              <a href={b.meet_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-ink underline underline-offset-4 hover:text-rose-deep">
                <Video className="size-4" aria-hidden />
                Meet
              </a>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
