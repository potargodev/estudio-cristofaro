import { AGENT_NAME } from "@/modules/agent/name";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Bot, BrainCircuit, Building2, ShieldCheck, Waypoints, Workflow, XCircle } from "lucide-react";
import Link from "next/link";
import { decideApprovalAction } from "@/app/admin/approval-actions";
import { Notice } from "@/components/admin/AdminField";
import { EmptyState } from "@/components/admin/kit/Panel";
import { StatusBadge, Tag } from "@/components/admin/kit/StatusBadge";
import { SubmitButton } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getDb } from "@/db";
import { approvals, documents, leads, mcp_accesses, organizations, requests, users } from "@/db/schema";
import type { StaffUser } from "@/lib/auth";
import { getTool } from "@/modules/tools";
import { formatDate } from "@/lib/format";

const ORIGIN = {
  asistente: { label: "Asistente", icon: Bot },
  mcp: { label: "MCP", icon: Waypoints },
  flujo: { label: "Flujos", icon: Workflow },
  agente: { label: AGENT_NAME, icon: BrainCircuit },
} as const;


const LABELS: Record<string, string> = {
  organizacion_id: "Organización",
  solicitud_id: "Solicitud",
  documento_id: "Documento",
  consulta_id: "Consulta",
  asunto: "Asunto",
  detalle: "Detalle",
  tipo: "Tipo",
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
      <label htmlFor={fid} className="text-meta font-medium text-ink/80">
        {LABELS[k] ?? k}
      </label>
      <input type="hidden" name={`t:${k}`} value={t} />
      {locked ? (
        <>
          <input type="hidden" name={`f:${k}`} value={String(v)} />
          <p id={fid} className="mt-1 font-mono text-caption text-muted">
            {String(v)}
          </p>
        </>
      ) : t === "boolean" ? (
        <select id={fid} name={`f:${k}`} defaultValue={String(v)} className="mt-1 h-(--control-h) w-full border border-line bg-surface px-2 text-body">
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      ) : t === "string" && String(v).length > 60 ? (
        <Textarea id={fid} name={`f:${k}`} defaultValue={String(v)} rows={5} className="mt-1" />
      ) : t === "json" ? (
        <Textarea id={fid} name={`f:${k}`} defaultValue={JSON.stringify(v, null, 2)} rows={3} className="mt-1 font-mono text-meta" />
      ) : (
        <Input id={fid} name={`f:${k}`} defaultValue={String(v)} inputMode={t === "number" ? "decimal" : undefined} className="mt-1" />
      )}
    </div>
  );
}

/**
 * Propuestas para aprobar (pestaña del Vigía): lo que propone la IA y no se
 * ejecuta sin una persona. Todo filtrado por el tenant de la sesión.
 */
export async function ApprovalsInbox({ user, sp, back, embedded }: { user: StaffUser; sp: Record<string, string | undefined>; back: string; embedded: boolean }) {
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
  // Nombres legibles de los IDs del borrador (siempre dentro del estudio)
  const idsOf = (key: string) => [...new Set(rows.map((r) => (r.a.input as Record<string, unknown>)[key]).filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)))];
  const db = getDb();
  const [reqNames, orgNames, docNames, leadNames] = await Promise.all([
    idsOf("solicitud_id").length ? db.select({ id: requests.id, name: requests.subject }).from(requests).where(and(eq(requests.studio_id, user.studioId), inArray(requests.id, idsOf("solicitud_id")))) : [],
    idsOf("organizacion_id").length ? db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(and(eq(organizations.studio_id, user.studioId), inArray(organizations.id, idsOf("organizacion_id")))) : [],
    idsOf("documento_id").length ? db.select({ id: documents.id, name: documents.name }).from(documents).where(and(eq(documents.studio_id, user.studioId), inArray(documents.id, idsOf("documento_id")))) : [],
    idsOf("consulta_id").length ? db.select({ id: leads.id, name: leads.name }).from(leads).where(and(eq(leads.studio_id, user.studioId), inArray(leads.id, idsOf("consulta_id")))) : [],
  ]);
  const names = new Map([...reqNames, ...orgNames, ...docNames, ...leadNames].map((r) => [r.id, r.name]));
  const display = (k: string, v: unknown) => (k.endsWith("_id") && typeof v === "string" && names.has(v) ? names.get(v)! : show(v));

  return (
    <div className={embedded ? "pb-6" : "max-w-4xl pb-6"}>
      <p className="mb-3 text-ui text-muted">
        Lo que propone la IA (desde el Asistente, un cliente MCP o los Flujos) y no se ejecuta sin una persona: comunicaciones a clientes, pagos y datos fiscales. Revisá el borrador, editalo si hace falta y aprobá o rechazá.
      </p>
      <div className="mb-4 flex gap-1.5" role="group" aria-label="Ver">
        {[
          { href: back, label: "Pendientes", on: tab === "pendientes", n: pendingCount },
          { href: `${back}&ver=historial`, label: "Historial", on: tab === "historial" },
        ].map((v) => (
          <Link key={v.label} href={v.href} aria-current={v.on ? "page" : undefined} className={v.on ? "inline-flex h-8 items-center gap-1.5 rounded-full bg-navy px-3 text-meta font-medium text-paper" : "inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-meta text-ink hover:border-muted"}>
            {v.label}
            {!!v.n && <span className="num">{v.n}</span>}
          </Link>
        ))}
      </div>
      {sp.aprobada && <Notice>Aprobada y ejecutada.</Notice>}
      {sp.rechazada && <Notice>Propuesta rechazada.</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}

      {rows.length === 0 ? (
        <div className="rounded-md border border-line bg-surface">
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
                    <p className="text-lead font-medium text-ink">{a.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-meta text-muted">
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
                        Pedido por {requester ?? a.requested_label ?? "—"} · {formatDate(a.created_at, "shortTime")}
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
                  <p className="text-meta font-medium uppercase tracking-wide text-muted">Borrador completo</p>
                  <dl className="mt-2 grid gap-x-6 gap-y-2 text-ui sm:grid-cols-2">
                    {Object.entries(input).map(([k, v]) => (
                      <div key={k} className={typeof v === "string" && v.length > 60 ? "sm:col-span-2" : ""}>
                        <dt className="text-caption text-muted">{LABELS[k] ?? k}</dt>
                        <dd className="whitespace-pre-wrap break-words text-ink">{display(k, v)}</dd>
                      </div>
                    ))}
                  </dl>
                  {a.status !== "pendiente" && (
                    <p className="mt-3 text-meta text-muted">
                      {a.status === "rechazada" ? `Rechazada por ${deciders.get(a.decided_by ?? "") ?? "—"}: ${a.reason}` : `Aprobada por ${deciders.get(a.decided_by ?? "") ?? "—"}${a.edited ? " (con cambios)" : ""}`}
                      {a.decided_at ? ` · ${formatDate(a.decided_at, "shortTime")}` : ""}
                      {a.status === "error" && a.result ? ` · ${String((a.result as { message?: string }).message ?? "")}` : ""}
                    </p>
                  )}
                </div>
                {a.status === "pendiente" && (
                  <div className="grid gap-3 border-t border-line bg-canvas px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <form action={decideApprovalAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="volver" value={back} />
                        <input type="hidden" name="mode" value="aprobar" />
                        <SubmitButton pendingText="Ejecutando…" confirm={`¿Aprobar y ejecutar? ${a.title}`} confirmLabel="Aprobar y ejecutar">
                          Aprobar
                        </SubmitButton>
                      </form>
                    </div>
                    <details>
                      <summary className="cursor-pointer text-ui font-medium text-ink">Editar y aprobar</summary>
                      <form action={decideApprovalAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="volver" value={back} />
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
                      <summary className="cursor-pointer text-ui font-medium text-ink">Rechazar</summary>
                      <form action={decideApprovalAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="volver" value={back} />
                        <input type="hidden" name="mode" value="rechazar" />
                        <div className="flex-1">
                          <label htmlFor={`${a.id}-reason`} className="text-meta font-medium text-ink/80">
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
