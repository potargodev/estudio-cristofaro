import { and, desc, eq, inArray } from "drizzle-orm";
import { Bot, Building2, CheckCircle2, ShieldCheck, Waypoints, Workflow, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { decideApprovalAction } from "@/app/admin/approval-actions";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { EmptyState } from "@/components/admin/kit/Panel";
import { StatusBadge, Tag } from "@/components/admin/kit/StatusBadge";
import { SubmitButton } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getDb } from "@/db";
import { approvals, mcp_accesses, organizations, users } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { getTool } from "@/modules/tools";

export const metadata: Metadata = { title: "Aprobaciones" };

const ORIGIN = {
  asistente: { label: "Asistente", icon: Bot },
  mcp: { label: "MCP", icon: Waypoints },
  flujo: { label: "Flujos", icon: Workflow },
} as const;

const fmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" });

const LABELS: Record<string, string> = {
  organizacion_id: "Organización",
  solicitud_id: "Solicitud",
  mensaje: "Mensaje para el cliente",
  estado: "Estado",
  impuesto: "Impuesto",
  periodo: "Período",
  vencimiento: "Vencimiento",
  importe: "Importe",
  link_pago: "Link de pago",
  notas: "Notas",
  cuit: "CUIT",
  avisar_al_cliente: "Avisar al cliente",
};

const typeOf = (v: unknown) => (typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : typeof v === "string" ? "string" : "json");
const show = (v: unknown) => (typeof v === "boolean" ? (v ? "Sí" : "No") : typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v));

/** Campo editable del borrador (los IDs no se editan: la organización no puede cambiar) */
function DraftField({ id, k, v }: { id: string; k: string; v: unknown }) {
  const t = typeOf(v);
  const fid = `${id}-${k}`;
  const locked = k.endsWith("_id");
  return (
    <div className={t === "string" && String(v).length > 60 ? "sm:col-span-2" : ""}>
      <label htmlFor={fid} className="text-[13px] font-medium text-ink/80">
        {LABELS[k] ?? k}
      </label>
      <input type="hidden" name={`t:${k}`} value={t} />
      {locked ? (
        <>
          <input type="hidden" name={`f:${k}`} value={String(v)} />
          <p id={fid} className="mt-1 font-mono text-[12px] text-muted">
            {String(v)}
          </p>
        </>
      ) : t === "boolean" ? (
        <select id={fid} name={`f:${k}`} defaultValue={String(v)} className="mt-1 h-9 w-full border border-line bg-surface px-2 text-[15px]">
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      ) : t === "string" && String(v).length > 60 ? (
        <Textarea id={fid} name={`f:${k}`} defaultValue={String(v)} rows={5} className="mt-1" />
      ) : t === "json" ? (
        <Textarea id={fid} name={`f:${k}`} defaultValue={JSON.stringify(v, null, 2)} rows={3} className="mt-1 font-mono text-[13px]" />
      ) : (
        <Input id={fid} name={`f:${k}`} defaultValue={String(v)} inputMode={t === "number" ? "decimal" : undefined} className="mt-1" />
      )}
    </div>
  );
}

export default async function AprobacionesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireStaff();
  const tab = sp.ver === "historial" ? "historial" : "pendientes";
  const rows = await getDb()
    .select({ a: approvals, org: organizations.name, requester: users.name, access: mcp_accesses.name })
    .from(approvals)
    .leftJoin(organizations, eq(organizations.id, approvals.organization_id))
    .leftJoin(users, eq(users.id, approvals.requested_by))
    .leftJoin(mcp_accesses, eq(mcp_accesses.id, approvals.mcp_access_id))
    .where(
      and(
        eq(approvals.studio_id, user.studioId),
        eq(approvals.level, "sensible"),
        tab === "pendientes" ? eq(approvals.status, "pendiente") : inArray(approvals.status, ["ejecutada", "rechazada", "error"]),
      ),
    )
    .orderBy(desc(approvals.created_at))
    .limit(tab === "pendientes" ? 200 : 60);
  const deciders = new Map(
    (await getDb().select({ id: users.id, name: users.name }).from(users).where(eq(users.studioId, user.studioId))).map((u) => [u.id, u.name]),
  );
  const pendingCount = tab === "pendientes" ? rows.length : undefined;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Aprobaciones"
        description="Lo que propone la IA (desde el Asistente, un cliente MCP o los Flujos) y no se ejecuta sin una persona: comunicaciones a clientes, pagos y datos fiscales. Revisá el borrador, editalo si hace falta y aprobá o rechazá."
        tabs={[
          { href: "/admin/aprobaciones", label: "Pendientes", icon: ShieldCheck, active: tab === "pendientes", count: pendingCount },
          { href: "/admin/aprobaciones?ver=historial", label: "Historial", icon: CheckCircle2, active: tab === "historial" },
        ]}
      />
      {sp.aprobada && <Notice>Aprobada y ejecutada.</Notice>}
      {sp.rechazada && <Notice>Propuesta rechazada.</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}

      {rows.length === 0 ? (
        <div className="border border-line bg-surface">
          <EmptyState icon={ShieldCheck} title={tab === "pendientes" ? "No hay nada para aprobar" : "Todavía no hay historial"} text="Cuando el Asistente o un cliente MCP propongan una acción sensible, aparece acá." />
        </div>
      ) : (
        <ul className="grid gap-4">
          {rows.map(({ a, org, requester, access }) => {
            const tool = getTool(a.tool);
            const O = ORIGIN[a.origin];
            const input = a.input as Record<string, unknown>;
            return (
              <li key={a.id} id={a.id} className="scroll-mt-24 border border-line bg-surface">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-[16px] font-medium text-ink">{a.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                      <Tag icon={O.icon}>
                        {O.label}
                        {access ? ` · ${access}` : ""}
                      </Tag>
                      <Tag>{tool?.title ?? a.tool}</Tag>
                      {org && a.organization_id && (
                        <Link href={`/admin/organizaciones/${a.organization_id}`} className="inline-flex items-center gap-1 text-ink underline-offset-4 hover:underline">
                          <Building2 className="size-3.5" strokeWidth={1.5} aria-hidden />
                          {org}
                        </Link>
                      )}
                      <span>
                        Pedido por {requester ?? a.requested_label ?? "—"} · {fmt.format(a.created_at)}
                      </span>
                    </p>
                  </div>
                  {a.status !== "pendiente" && (
                    <StatusBadge
                      status={a.status === "ejecutada" ? "resuelta" : a.status === "rechazada" ? "cancelada" : "vencido"}
                      label={a.status === "ejecutada" ? "Aprobada" : a.status === "rechazada" ? "Rechazada" : "Falló"}
                    />
                  )}
                </div>
                <div className="px-5 py-4">
                  <p className="text-[13px] font-medium uppercase tracking-wide text-muted">Borrador completo</p>
                  <dl className="mt-2 grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-2">
                    {Object.entries(input).map(([k, v]) => (
                      <div key={k} className={typeof v === "string" && v.length > 60 ? "sm:col-span-2" : ""}>
                        <dt className="text-[12px] text-muted">{LABELS[k] ?? k}</dt>
                        <dd className="whitespace-pre-wrap break-words text-ink">{show(v)}</dd>
                      </div>
                    ))}
                  </dl>
                  {a.status !== "pendiente" && (
                    <p className="mt-3 text-[13px] text-muted">
                      {a.status === "rechazada" ? `Rechazada por ${deciders.get(a.decided_by ?? "") ?? "—"}: ${a.reason}` : `Aprobada por ${deciders.get(a.decided_by ?? "") ?? "—"}${a.edited ? " (con cambios)" : ""}`}
                      {a.decided_at ? ` · ${fmt.format(a.decided_at)}` : ""}
                      {a.status === "error" && a.result ? ` · ${String((a.result as { message?: string }).message ?? "")}` : ""}
                    </p>
                  )}
                </div>
                {a.status === "pendiente" && (
                  <div className="grid gap-3 border-t border-line bg-paper px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <form action={decideApprovalAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="mode" value="aprobar" />
                        <SubmitButton pendingText="Ejecutando…" confirm={`¿Aprobar y ejecutar? ${a.title}`} confirmLabel="Aprobar y ejecutar">
                          Aprobar
                        </SubmitButton>
                      </form>
                    </div>
                    <details>
                      <summary className="cursor-pointer text-[14px] font-medium text-ink">Editar y aprobar</summary>
                      <form action={decideApprovalAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="mode" value="editar" />
                        {Object.entries(input).map(([k, v]) => (
                          <DraftField key={k} id={a.id} k={k} v={v} />
                        ))}
                        <div className="sm:col-span-2">
                          <SubmitButton pendingText="Ejecutando…">Guardar cambios y aprobar</SubmitButton>
                        </div>
                      </form>
                    </details>
                    <details>
                      <summary className="cursor-pointer text-[14px] font-medium text-ink">Rechazar</summary>
                      <form action={decideApprovalAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="mode" value="rechazar" />
                        <div className="flex-1">
                          <label htmlFor={`${a.id}-reason`} className="text-[13px] font-medium text-ink/80">
                            Motivo
                          </label>
                          <Input id={`${a.id}-reason`} name="reason" required minLength={3} maxLength={500} placeholder="Ej.: el importe no coincide con la DDJJ" className="mt-1" />
                        </div>
                        <SubmitButton variant="danger" pendingText="…">
                          <span className="inline-flex items-center gap-1.5">
                            <XCircle className="size-4" aria-hidden />
                            Rechazar
                          </span>
                        </SubmitButton>
                      </form>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
