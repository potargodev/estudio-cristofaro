import { and, asc, desc, eq, gte, inArray, or } from "drizzle-orm";
import { ArrowLeft, Clock, Flag, Inbox, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/admin/AdminField";
import { RequestThread } from "@/components/admin/OrganizationTabs";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { EmptyState } from "@/components/admin/kit/Panel";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { getDb } from "@/db";
import { organization_staff, organizations, request_messages, requests, users } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { REQUEST_TYPES } from "@/lib/portal-types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Solicitudes" };

const HOUR = 3600000;
const SLA_HOURS = 24;
const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
const shortDate = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" });

type Priority = "alta" | "media" | "baja";
const PRIORITY: Record<Priority, { label: string; className: string }> = {
  alta: { label: "Prioridad alta", className: "text-[#8f2a1c]" },
  media: { label: "Prioridad media", className: "text-[#7a5a12]" },
  baja: { label: "Prioridad baja", className: "text-muted" },
};

/** Tiempo de respuesta: cuenta desde el primer mensaje del cliente que todavía no tiene respuesta */
function sla(status: string, msgs: { from_client: boolean; at: Date }[], created: Date, now: number) {
  if (status === "resuelta") return { waiting: false, remaining: null as number | null, priority: "baja" as Priority, text: "Resuelta" };
  let since: Date | null = msgs.length ? null : created;
  for (const m of msgs) {
    if (!m.from_client) since = null;
    else if (!since) since = m.at;
  }
  if (!since) return { waiting: false, remaining: null, priority: "baja" as Priority, text: "Esperando al cliente" };
  const remaining = SLA_HOURS * HOUR - (now - since.getTime());
  const h = Math.round(Math.abs(remaining) / HOUR);
  const text = remaining < 0 ? `Vencida hace ${h} h` : h < 1 ? "Queda menos de 1 h" : `Quedan ${h} h`;
  const priority: Priority = remaining < 4 * HOUR ? "alta" : remaining < 12 * HOUR ? "media" : "baja";
  return { waiting: true, remaining, priority, text };
}

function SlaChip({ s }: { s: ReturnType<typeof sla> }) {
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1 text-[12px]",
        !s.waiting ? "text-muted" : s.remaining! < 0 ? "font-medium text-[#8f2a1c]" : s.priority === "alta" ? "font-medium text-[#7a5a12]" : "text-ink",
      )}
    >
      <Clock className="size-3.5" strokeWidth={1.5} aria-hidden />
      {s.text}
    </span>
  );
}

export default async function SolicitudesAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { studioId } = await requireStaff();
  const db = getDb();
  const estado = sp.estado === "resueltas" || sp.estado === "todas" ? sp.estado : "abiertas";
  const prioridad = sp.prioridad === "alta" || sp.prioridad === "media" || sp.prioridad === "baja" ? sp.prioridad : null;
  const resp = sp.resp === "sin" || isUuid(sp.resp) ? sp.resp! : null;
  const now = Date.now();

  const statusWhere =
    estado === "abiertas"
      ? inArray(requests.status, ["abierta", "en_curso"])
      : estado === "resueltas"
        ? and(eq(requests.status, "resuelta"), gte(requests.updated_at, new Date(now - 90 * 24 * HOUR)))
        : or(inArray(requests.status, ["abierta", "en_curso"]), gte(requests.updated_at, new Date(now - 90 * 24 * HOUR)));

  const rows = await db
    .select({ request: requests, clientName: organizations.name, ownerId: organization_staff.user_id, owner: users.name })
    .from(requests)
    .innerJoin(organizations, and(eq(organizations.id, requests.organization_id), eq(organizations.studio_id, studioId)))
    .leftJoin(organization_staff, and(eq(organization_staff.organization_id, organizations.id), eq(organization_staff.assignment, "responsable")))
    .leftJoin(users, eq(users.id, organization_staff.user_id))
    .where(and(eq(requests.studio_id, studioId), isUuid(sp.id) ? or(statusWhere, eq(requests.id, sp.id!)) : statusWhere, isUuid(sp.org) ? eq(requests.organization_id, sp.org!) : undefined))
    .orderBy(desc(requests.updated_at))
    .limit(300);

  const ids = rows.map((r) => r.request.id);
  const msgs = ids.length
    ? await db
        .select({ request: request_messages.request_id, from_client: request_messages.from_client, at: request_messages.created_at, body: request_messages.body })
        .from(request_messages)
        .where(inArray(request_messages.request_id, ids))
        .orderBy(asc(request_messages.created_at))
    : [];
  const byReq = new Map<string, typeof msgs>();
  for (const m of msgs) byReq.set(m.request, [...(byReq.get(m.request) ?? []), m]);

  const items = rows
    .map((r) => {
      const list = byReq.get(r.request.id) ?? [];
      const last = list.at(-1);
      return { ...r, s: sla(r.request.status, list, r.request.created_at, now), last, count: list.length };
    })
    .sort((a, b) => {
      // Primero lo que espera respuesta, por SLA restante; después el resto por fecha
      if (a.s.waiting !== b.s.waiting) return a.s.waiting ? -1 : 1;
      if (a.s.waiting && b.s.waiting) return a.s.remaining! - b.s.remaining!;
      return b.request.updated_at.getTime() - a.request.updated_at.getTime();
    });
  const owners = [...new Map(items.filter((i) => i.ownerId).map((i) => [i.ownerId!, i.owner ?? "—"])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  const visible = items.filter((i) => (!prioridad || i.s.priority === prioridad) && (!resp || (resp === "sin" ? !i.ownerId : i.ownerId === resp)));
  const selected = visible.find((i) => i.request.id === sp.id) ?? items.find((i) => i.request.id === sp.id) ?? visible[0] ?? null;
  const overdue = items.filter((i) => i.s.waiting && i.s.remaining! < 0).length;

  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const base: Record<string, string | null> = { estado: estado === "abiertas" ? null : estado, prioridad, resp, org: isUuid(sp.org) ? sp.org! : null, ...patch };
    for (const [k, v] of Object.entries(base)) if (v) q.set(k, v);
    const s = q.toString();
    return `/admin/solicitudes${s ? `?${s}` : ""}`;
  };
  const chip = (on: boolean) =>
    cn("inline-flex h-7 items-center rounded-[2px] border px-2.5 text-[13px] transition-colors", on ? "border-navy bg-navy text-paper" : "border-line bg-surface text-ink hover:border-muted");

  return (
    <>
      <PageHeader
        title="Solicitudes"
        description={`Lo que pidieron los clientes desde el portal. Objetivo: primera respuesta en menos de ${SLA_HOURS} h. Al responder, al cliente le llega un aviso por mail.`}
      />
      {sp.guardado && <Notice>Respuesta guardada.</Notice>}
      {sp.error && (
        <div className="mb-4">
          <Notice tone="error">{sp.error}</Notice>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(320px,400px)_1fr] lg:gap-6">
        {/* Bandeja */}
        <section aria-label="Bandeja de solicitudes" className={cn("border border-line bg-surface", sp.id && "hidden lg:block")}>
          <div className="space-y-2.5 border-b border-line p-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Estado">
              {(
                [
                  ["abiertas", "Abiertas"],
                  ["resueltas", "Resueltas"],
                  ["todas", "Todas"],
                ] as const
              ).map(([v, l]) => (
                <Link key={v} href={href({ estado: v === "abiertas" ? null : v, prioridad: null })} aria-current={estado === v ? "true" : undefined} className={chip(estado === v)}>
                  {l}
                </Link>
              ))}
              <span className="tabular ml-auto text-[13px] text-muted">
                {visible.length}
                {overdue > 0 && estado !== "resueltas" && <span className="ml-2 font-medium text-[#8f2a1c]">{overdue} fuera de término</span>}
              </span>
            </div>
            {estado !== "resueltas" && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Prioridad">
                <span className="mr-1 text-[13px] text-muted">Prioridad</span>
                {(["alta", "media", "baja"] as const).map((p) => (
                  <Link key={p} href={href({ prioridad: prioridad === p ? null : p })} aria-current={prioridad === p ? "true" : undefined} className={chip(prioridad === p)}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </Link>
                ))}
              </div>
            )}
            {owners.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Responsable">
                <span className="mr-1 text-[13px] text-muted">Responsable</span>
                {owners.map(([id, name]) => (
                  <Link key={id} href={href({ resp: resp === id ? null : id })} aria-current={resp === id ? "true" : undefined} className={chip(resp === id)}>
                    {name}
                  </Link>
                ))}
                <Link href={href({ resp: resp === "sin" ? null : "sin" })} aria-current={resp === "sin" ? "true" : undefined} className={chip(resp === "sin")}>
                  Sin responsable
                </Link>
              </div>
            )}
          </div>
          {visible.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={estado === "abiertas" ? "No hay solicitudes abiertas" : "No hay solicitudes con estos filtros"}
              text={estado === "abiertas" ? "Cuando un cliente pida algo desde el portal, aparece acá." : "Probá con otros filtros."}
            />
          ) : (
            <ul className="divide-y divide-line lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto">
              {visible.map((i) => {
                const on = selected?.request.id === i.request.id;
                return (
                  <li key={i.request.id}>
                    <Link
                      href={href({ id: i.request.id })}
                      aria-current={on ? "true" : undefined}
                      className={cn("relative block px-4 py-3 transition-colors hover:bg-paper", on && "bg-navy-soft/70")}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-medium text-ink">{i.request.subject}</span>
                          <span className="block truncate text-[13px] text-muted">
                            {i.clientName} · {REQUEST_TYPES[i.request.type]}
                          </span>
                        </span>
                        <span className="tabular shrink-0 text-[12px] text-muted">{shortDate.format(i.request.updated_at)}</span>
                      </span>
                      {i.last && <span className="mt-1 line-clamp-1 text-[13px] text-muted">{i.last.from_client ? "" : "Vos: "}{i.last.body}</span>}
                      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <StatusBadge status={i.request.status} />
                        <SlaChip s={i.s} />
                        {i.s.waiting && i.s.priority !== "baja" && (
                          <span className={cn("inline-flex items-center gap-1 text-[12px]", PRIORITY[i.s.priority].className)}>
                            <Flag className="size-3.5" strokeWidth={1.5} aria-hidden />
                            {PRIORITY[i.s.priority].label}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Conversación */}
        <div className={cn("min-w-0", !sp.id && "hidden lg:block")}>
          {sp.id && (
            <Link href={href({})} className="mb-3 inline-flex items-center gap-1.5 text-[14px] text-ink underline-offset-4 hover:underline lg:hidden">
              <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden /> Volver a la bandeja
            </Link>
          )}
          {selected ? (
            <RequestThread
              key={selected.request.id}
              request={selected.request}
              back="solicitudes"
              clientName={selected.clientName}
              meta={
                <>
                  <SlaChip s={selected.s} />
                  <span className={cn("inline-flex items-center gap-1 text-[12px]", PRIORITY[selected.s.priority].className)}>
                    <Flag className="size-3.5" strokeWidth={1.5} aria-hidden />
                    {PRIORITY[selected.s.priority].label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[12px]">
                    <UserRound className="size-3.5" strokeWidth={1.5} aria-hidden />
                    {selected.owner ?? "Sin responsable"}
                  </span>
                  <span className="tabular text-[12px]">{selected.count === 1 ? "1 mensaje" : `${selected.count} mensajes`}</span>
                </>
              }
            />
          ) : (
            <div className="border border-line bg-surface">
              <EmptyState icon={Inbox} title="Elegí una solicitud" text="La conversación aparece acá." />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
