import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { Paperclip } from "lucide-react";
import Link from "next/link";
import { assignStaff, removeStaff } from "@/app/admin/organization-actions";
import {
  deleteDocument,
  deleteObligation,
  replyRequest,
  saveObligation,
  uploadStudioDocument,
} from "@/app/admin/portal-actions";
import { AdminField } from "@/components/admin/AdminField";
import { adminButton } from "@/components/admin/styles";
import { FormSelect, SubmitButton } from "@/components/admin/ui";
import { Badge, obligationTone, requestTone } from "@/components/portal/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getDb } from "@/db";
import { documents, legal_entities, obligations, request_messages, requests, tango_companies, tango_records, users } from "@/db/schema";
import { getOrgStaff, getStudioStaff } from "@/lib/organizations";
import { formatCuit } from "@/lib/types";
import {
  DOCUMENT_CATEGORIES,
  OBLIGATION_STATUS,
  REQUEST_STATUS,
  REQUEST_TYPES,
  categoryLabel,
  dateLabel,
  moneyLabel,
  periodLabel,
  todayISO,
  type DocumentRow,
} from "@/lib/portal-types";
import { ACCEPT_ATTR, ALLOWED_LABEL, formatBytes } from "@/lib/uploads-shared";
import { cn } from "@/lib/utils";

// Pestañas de la ficha de la organización en el backoffice. La página ya validó
// que la organización es del estudio; igual cada query filtra también por studio_id.

export const ORG_TABS = [
  { key: "general", label: "General y razones sociales" },
  { key: "plan", label: "Plan y módulos" },
  { key: "miembros", label: "Miembros e invitaciones" },
  { key: "equipo", label: "Equipo del estudio" },
  { key: "vencimientos", label: "Vencimientos" },
  { key: "documentos", label: "Documentos" },
  { key: "solicitudes", label: "Solicitudes" },
  { key: "integraciones", label: "Integraciones" },
  { key: "actividad", label: "Actividad" },
] as const;

export type OrgTabKey = (typeof ORG_TABS)[number]["key"];

/** Pestañas viejas de la ficha de cliente → nuevas */
export const LEGACY_TABS: Record<string, OrgTabKey> = { datos: "general", portal: "miembros" };

export function TabNav({ orgId, active, counts }: { orgId: string; active: OrgTabKey; counts: Partial<Record<OrgTabKey, number>> }) {
  return (
    <nav aria-label="Secciones de la organización" className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {ORG_TABS.map((t) => (
          <li key={t.key}>
            <Link
              href={`/admin/organizaciones/${orgId}?tab=${t.key}`}
              aria-current={active === t.key ? "page" : undefined}
              className={cn(
                "relative inline-flex items-center gap-1.5 px-3 py-2.5 text-[15px] transition-colors",
                active === t.key
                  ? "font-medium text-navy after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-rose"
                  : "text-muted hover:text-ink",
              )}
            >
              {t.label}
              {!!counts[t.key] && <span className="rounded-full bg-rose-soft px-1.5 text-xs font-semibold text-rose-deep">{counts[t.key]}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const STATUS_OPTIONS = Object.entries(OBLIGATION_STATUS).map(([value, label]) => ({ value, label }));

export interface EntityOption {
  value: string;
  label: string;
}

/** Selector de razón social: solo aparece si la organización tiene más de una */
function EntityField({ id, entities, defaultValue }: { id: string; entities: EntityOption[]; defaultValue?: string | null }) {
  if (entities.length < 2) return null;
  return (
    <AdminField label="Razón social" htmlFor={id}>
      <FormSelect id={id} name="legal_entity_id" defaultValue={defaultValue ?? ""} options={[{ value: "", label: "Toda la organización" }, ...entities]} />
    </AdminField>
  );
}

function ObligationFields({ o, k, entities }: { o?: typeof obligations.$inferSelect; k: string; entities: EntityOption[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <EntityField id={`le-${k}`} entities={entities} defaultValue={o?.legal_entity_id} />
      <AdminField label="Impuesto" htmlFor={`tax-${k}`}>
        <Input id={`tax-${k}`} name="tax" required defaultValue={o?.tax} placeholder="IVA, IIBB, F.931…" />
      </AdminField>
      <AdminField label="Período" htmlFor={`period-${k}`}>
        <Input id={`period-${k}`} name="period" type="month" required defaultValue={o?.period} />
      </AdminField>
      <AdminField label="Vencimiento" htmlFor={`due-${k}`}>
        <Input id={`due-${k}`} name="due_date" type="date" required defaultValue={o?.due_date} />
      </AdminField>
      <AdminField label="Monto ($)" htmlFor={`amount-${k}`}>
        <Input id={`amount-${k}`} name="amount" inputMode="decimal" defaultValue={o?.amount ?? ""} placeholder="125.400,50" />
      </AdminField>
      <AdminField label="Estado" htmlFor={`status-${k}`}>
        <FormSelect id={`status-${k}`} name="status" defaultValue={o?.status ?? "pendiente"} options={STATUS_OPTIONS} />
      </AdminField>
      <AdminField label="Link de pago o VEP" htmlFor={`url-${k}`}>
        <Input id={`url-${k}`} name="payment_url" type="url" defaultValue={o?.payment_url ?? ""} placeholder="https://…" />
      </AdminField>
    </div>
  );
}

export async function ObligationsTab({ orgId, studioId, entities }: { orgId: string; studioId: string; entities: EntityOption[] }) {
  const rows = await getDb()
    .select()
    .from(obligations)
    .where(and(eq(obligations.organization_id, orgId), eq(obligations.studio_id, studioId)))
    .orderBy(desc(obligations.due_date));
  const today = todayISO();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">Los miembros de la organización los ven en su portal. Al cargar uno nuevo les llega un aviso por mail.</p>
        <Link href="/admin/vencimientos/importar" className={adminButton.secondary}>
          Importar desde CSV o Excel
        </Link>
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <p className="rounded-md border border-dashed border-line p-5 text-muted">Todavía no hay vencimientos.</p>}
        {rows.map((o) => (
          <details key={o.id} className="group rounded-md border border-line bg-surface">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="font-medium">{o.tax}</span>
                <span className="ml-2 text-sm text-muted">
                  {periodLabel(o.period)} · vence {dateLabel(o.due_date)}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums">{moneyLabel(o.amount)}</span>
                <Badge tone={obligationTone(o.status, o.due_date, today)}>{OBLIGATION_STATUS[o.status]}</Badge>
                <span className="text-sm text-rose-deep group-open:hidden">Editar</span>
              </span>
            </summary>
            <div className="border-t border-line p-4">
              <form action={saveObligation} className="grid gap-3">
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="organization_id" value={orgId} />
                <ObligationFields o={o} k={o.id} entities={entities} />
                <div>
                  <SubmitButton>Guardar</SubmitButton>
                </div>
              </form>
              <form action={deleteObligation} className="mt-3">
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="organization_id" value={orgId} />
                <SubmitButton variant="danger" pendingText="Eliminando…" confirm="¿Eliminar este vencimiento?">
                  Eliminar
                </SubmitButton>
              </form>
            </div>
          </details>
        ))}
      </div>

      <section className="rounded-md border border-dashed border-line p-5">
        <h2 className="mb-3 font-semibold">Cargar vencimiento</h2>
        <form action={saveObligation} className="grid gap-3">
          <input type="hidden" name="organization_id" value={orgId} />
          <ObligationFields k="nuevo" entities={entities} />
          <div>
            <SubmitButton>Cargar vencimiento</SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}

const dateFmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });
const CATEGORY_OPTIONS = Object.entries(DOCUMENT_CATEGORIES)
  .filter(([v]) => v !== "solicitud")
  .map(([value, label]) => ({ value, label }));

function DocList({ docs, orgId, highlightNew }: { docs: DocumentRow[]; orgId: string; highlightNew?: Set<string> }) {
  if (docs.length === 0) return <p className="rounded-md border border-dashed border-line p-5 text-muted">Sin documentos.</p>;
  return (
    <ul className="divide-y divide-line rounded-md border border-line bg-surface">
      {docs.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <a href={`/api/archivos/${d.id}`} className="font-medium hover:text-rose-deep">
              {d.name}
            </a>
            {highlightNew?.has(d.id) && (
              <span className="ml-2">
                <Badge tone="warn">Nuevo</Badge>
              </span>
            )}
            <p className="text-sm text-muted">
              {categoryLabel(d.category)} · {periodLabel(d.period)} · {dateFmt.format(d.created_at)} · {formatBytes(d.size_bytes)}
            </p>
          </div>
          <form action={deleteDocument}>
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="organization_id" value={orgId} />
            <SubmitButton variant="danger" pendingText="…" confirm={`¿Eliminar "${d.name}"?`} confirmLabel="Eliminar">
              Eliminar
            </SubmitButton>
          </form>
        </li>
      ))}
    </ul>
  );
}

export async function DocumentsTab({ orgId, studioId, error, entities }: { orgId: string; studioId: string; error?: string; entities: EntityOption[] }) {
  const db = getDb();
  const docs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.organization_id, orgId), eq(documents.studio_id, studioId)))
    .orderBy(desc(documents.created_at));
  const fromClient = docs.filter((d) => d.source === "cliente");
  const unseen = new Set(fromClient.filter((d) => !d.reviewed_at).map((d) => d.id));
  // Al abrir la pestaña, los documentos nuevos del cliente quedan como vistos
  if (unseen.size) {
    await db
      .update(documents)
      .set({ reviewed_at: new Date() })
      .where(and(eq(documents.organization_id, orgId), eq(documents.studio_id, studioId), eq(documents.source, "cliente"), isNull(documents.reviewed_at)));
  }
  return (
    <div className="space-y-8">
      <section className="rounded-md border border-line bg-surface p-5">
        <h2 className="font-semibold">Subir documento para la organización</h2>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error === "archivo" ? "Elegí un archivo." : error}
          </p>
        )}
        <form action={uploadStudioDocument} className="mt-3 grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr]">
          <input type="hidden" name="organization_id" value={orgId} />
          <AdminField label="Archivo" htmlFor="doc-file" hint={`${ALLOWED_LABEL}.`}>
            <Input id="doc-file" name="file" type="file" accept={ACCEPT_ATTR} required className="h-auto py-1.5" />
          </AdminField>
          <AdminField label="Categoría" htmlFor="doc-category">
            <FormSelect id="doc-category" name="category" defaultValue="ddjj" options={CATEGORY_OPTIONS} />
          </AdminField>
          <AdminField label="Período" htmlFor="doc-period">
            <Input id="doc-period" name="period" type="month" />
          </AdminField>
          <EntityField id="doc-le" entities={entities} />
          <div className="sm:col-span-3">
            <SubmitButton pendingText="Subiendo…">Subir y avisar al cliente</SubmitButton>
          </div>
        </form>
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Subidos por la organización</h2>
        <DocList docs={fromClient} orgId={orgId} highlightNew={unseen} />
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Subidos por el estudio</h2>
        <DocList docs={docs.filter((d) => d.source === "estudio")} orgId={orgId} />
      </section>
    </div>
  );
}

const msgDate = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const REQUEST_STATUS_OPTIONS = Object.entries(REQUEST_STATUS).map(([value, label]) => ({ value, label }));

/** Hilo de una solicitud con el formulario de respuesta (lo usan la ficha y /admin/solicitudes) */
export async function RequestThread({
  request: r,
  back,
  clientName,
}: {
  request: typeof requests.$inferSelect;
  back: "ficha" | "solicitudes";
  clientName?: string;
}) {
  const messages = await getDb()
    .select({
      id: request_messages.id,
      body: request_messages.body,
      from_client: request_messages.from_client,
      created_at: request_messages.created_at,
      author: users.name,
      document_id: documents.id,
      document_name: documents.name,
    })
    .from(request_messages)
    .leftJoin(users, eq(users.id, request_messages.author_id))
    .leftJoin(documents, eq(documents.id, request_messages.document_id))
    .where(eq(request_messages.request_id, r.id))
    .orderBy(asc(request_messages.created_at));
  return (
    <article id={r.id} className="scroll-mt-6 rounded-md border border-line bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h3 className="font-semibold">{r.subject}</h3>
          <p className="text-sm text-muted">
            {clientName && (
              <>
                <Link href={`/admin/organizaciones/${r.organization_id}?tab=solicitudes#${r.id}`} className="text-rose-deep hover:underline">
                  {clientName}
                </Link>{" "}
                ·{" "}
              </>
            )}
            {REQUEST_TYPES[r.type]} · {msgDate.format(r.created_at)}
          </p>
        </div>
        <Badge tone={requestTone(r.status)}>{REQUEST_STATUS[r.status]}</Badge>
      </header>
      <ol className="space-y-3 px-4 py-4">
        {messages.map((m) => (
          <li key={m.id} className={cn("rounded-md px-3 py-2.5", m.from_client ? "bg-paper" : "ml-6 bg-navy-soft")}>
            <p className="text-xs text-muted">
              {m.from_client ? (m.author ?? "Cliente") : `${m.author ?? "Estudio"} (estudio)`} · {msgDate.format(m.created_at)}
            </p>
            <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{m.body}</p>
            {m.document_id && (
              <a href={`/api/archivos/${m.document_id}`} className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-rose-deep hover:underline">
                <Paperclip className="size-4" aria-hidden />
                {m.document_name}
              </a>
            )}
          </li>
        ))}
      </ol>
      <form action={replyRequest} className="grid gap-3 border-t border-line px-4 py-4 sm:grid-cols-[1fr_200px]">
        <input type="hidden" name="request_id" value={r.id} />
        <input type="hidden" name="back" value={back} />
        <AdminField label="Respuesta" htmlFor={`reply-${r.id}`} className="sm:col-span-2">
          <Textarea id={`reply-${r.id}`} name="body" rows={3} />
        </AdminField>
        <AdminField label="Adjunto (opcional)" htmlFor={`file-${r.id}`}>
          <Input id={`file-${r.id}`} name="file" type="file" accept={ACCEPT_ATTR} className="h-auto py-1.5" />
        </AdminField>
        <AdminField label="Estado" htmlFor={`status-${r.id}`}>
          <FormSelect id={`status-${r.id}`} name="status" defaultValue={r.status === "abierta" ? "en_curso" : r.status} options={REQUEST_STATUS_OPTIONS} />
        </AdminField>
        <div className="sm:col-span-2">
          <SubmitButton pendingText="Enviando…">Responder y guardar</SubmitButton>
        </div>
      </form>
    </article>
  );
}

export async function RequestsTab({ orgId, studioId }: { orgId: string; studioId: string }) {
  const rows = await getDb()
    .select()
    .from(requests)
    .where(and(eq(requests.organization_id, orgId), eq(requests.studio_id, studioId)))
    .orderBy(asc(requests.status), desc(requests.updated_at));
  if (rows.length === 0) return <p className="rounded-md border border-dashed border-line p-5 text-muted">La organización todavía no hizo solicitudes.</p>;
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <RequestThread key={r.id} request={r} back="ficha" />
      ))}
    </div>
  );
}

// ───────────── equipo del estudio ─────────────

export async function StaffTab({ orgId, studioId }: { orgId: string; studioId: string }) {
  const [team, staff] = await Promise.all([getOrgStaff(orgId), getStudioStaff(studioId)]);
  const lead = team.find((t) => t.assignment === "responsable");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section>
        <p className="mb-4 max-w-2xl text-muted">
          El responsable principal es la cara visible del estudio para la organización: aparece en el inicio de su portal con sus datos de
          contacto. Los colaboradores participan del día a día.
        </p>
        {!lead && (
          <div className="mb-4">
            <Badge tone="warn">Sin responsable principal</Badge>
          </div>
        )}
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {team.length === 0 && <li className="px-4 py-5 text-muted">Todavía no hay nadie del estudio asignado.</li>}
          {team.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium">
                  {t.name} {t.assignment === "responsable" && <Badge tone="ok">Responsable principal</Badge>}
                </p>
                <p className="text-sm text-muted">{t.email}</p>
              </div>
              <div className="flex gap-2">
                {t.assignment !== "responsable" && (
                  <form action={assignStaff}>
                    <input type="hidden" name="organization_id" value={orgId} />
                    <input type="hidden" name="user_id" value={t.id} />
                    <input type="hidden" name="assignment" value="responsable" />
                    <SubmitButton variant="secondary" pendingText="…">
                      Hacer responsable
                    </SubmitButton>
                  </form>
                )}
                <form action={removeStaff}>
                  <input type="hidden" name="organization_id" value={orgId} />
                  <input type="hidden" name="user_id" value={t.id} />
                  <SubmitButton variant="danger" pendingText="…" confirm={`¿Quitar a ${t.name} del equipo de esta organización?`} confirmLabel="Quitar">
                    Quitar
                  </SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-md border border-dashed border-line p-5">
        <h2 className="mb-3 font-semibold">Asignar a alguien del estudio</h2>
        <form action={assignStaff} className="grid gap-3">
          <input type="hidden" name="organization_id" value={orgId} />
          <AdminField label="Persona" htmlFor="staff-user">
            <FormSelect id="staff-user" name="user_id" options={staff.map((u) => ({ value: u.id, label: u.name }))} />
          </AdminField>
          <AdminField label="Rol en la organización" htmlFor="staff-assignment">
            <FormSelect
              id="staff-assignment"
              name="assignment"
              defaultValue={lead ? "colaborador" : "responsable"}
              options={[
                { value: "responsable", label: "Responsable principal" },
                { value: "colaborador", label: "Colaborador" },
              ]}
            />
          </AdminField>
          <div>
            <SubmitButton>Asignar</SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}

// ───────────── integraciones ─────────────

const syncFmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export async function IntegrationsTab({ orgId, studioId }: { orgId: string; studioId: string }) {
  const db = getDb();
  const [companies, records] = await Promise.all([
    db
      .select()
      .from(tango_companies)
      .where(and(eq(tango_companies.organization_id, orgId), eq(tango_companies.studio_id, studioId))),
    db
      .select({ id: tango_records.id, company: tango_records.company_id, external: tango_records.external_id, synced: tango_records.synced_at, entity: legal_entities.business_name, cuit: legal_entities.cuit })
      .from(tango_records)
      .leftJoin(legal_entities, eq(legal_entities.id, tango_records.legal_entity_id))
      .where(and(eq(tango_records.organization_id, orgId), eq(tango_records.studio_id, studioId)))
      .orderBy(desc(tango_records.synced_at)),
  ]);
  if (companies.length === 0 && records.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line p-6 text-muted">
        <p>Esta organización no está vinculada con Tango.</p>
        <p className="mt-2">
          Podés vincular sus razones sociales desde{" "}
          <Link href="/admin/integraciones/tango/clientes" className="text-rose-deep hover:underline">
            Clientes en Tango
          </Link>{" "}
          o asignarle una empresa de Tango en{" "}
          <Link href="/admin/integraciones#empresas" className="text-rose-deep hover:underline">
            Integraciones
          </Link>
          . Sin Tango, todo funciona igual con importación de archivos.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {companies.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Empresas de Tango asignadas</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {companies.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="font-medium">
                  Empresa {c.company_id}
                  {c.name ? ` · ${c.name}` : ""}
                </span>
                <span className="text-sm text-muted">Última sincronización: {c.last_sync_at ? syncFmt.format(c.last_sync_at) : "pendiente"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {records.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Clientes de Tango vinculados</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {records.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="font-medium">{r.entity ?? "Sin razón social"}</span>
                  <span className="ml-2 text-sm text-muted">
                    {formatCuit(r.cuit, "Sin CUIT")} · Tango: empresa {r.company}, id {r.external}
                  </span>
                </span>
                <span className="text-sm text-muted">
                  <Badge tone="ok">Fuente: Tango</Badge> sincronizado {syncFmt.format(r.synced)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
