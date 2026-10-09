import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { Paperclip } from "lucide-react";
import Link from "next/link";
import {
  deleteDocument,
  deleteObligation,
  replyRequest,
  saveObligation,
  setClientUserActive,
  uploadStudioDocument,
} from "@/app/admin/portal-actions";
import { AdminField } from "@/components/admin/AdminField";
import { InviteClientForm, ResetPasswordButton } from "@/components/admin/PortalAccess";
import { adminButton } from "@/components/admin/styles";
import { FormSelect, SubmitButton } from "@/components/admin/ui";
import { Badge, obligationTone, requestTone } from "@/components/portal/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getDb } from "@/db";
import { client_users, documents, obligations, request_messages, requests, users } from "@/db/schema";
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

// Pestañas de la ficha del cliente en el backoffice. La página ya validó que el
// cliente es del estudio; igual cada query filtra también por studio_id.

export const CLIENT_TABS = [
  { key: "datos", label: "Datos" },
  { key: "vencimientos", label: "Vencimientos" },
  { key: "documentos", label: "Documentos" },
  { key: "solicitudes", label: "Solicitudes" },
  { key: "portal", label: "Acceso al portal" },
] as const;

export type ClientTabKey = (typeof CLIENT_TABS)[number]["key"];

export function TabNav({ clientId, active, counts }: { clientId: string; active: ClientTabKey; counts: Partial<Record<ClientTabKey, number>> }) {
  return (
    <nav aria-label="Secciones del cliente" className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {CLIENT_TABS.map((t) => (
          <li key={t.key}>
            <Link
              href={`/admin/clientes/${clientId}?tab=${t.key}`}
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

function ObligationFields({ o, k }: { o?: typeof obligations.$inferSelect; k: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
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

export async function ObligationsTab({ clientId, studioId }: { clientId: string; studioId: string }) {
  const rows = await getDb()
    .select()
    .from(obligations)
    .where(and(eq(obligations.client_id, clientId), eq(obligations.studio_id, studioId)))
    .orderBy(desc(obligations.due_date));
  const today = todayISO();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">El cliente los ve en su portal. Al cargar uno nuevo le llega un aviso por mail.</p>
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
                <input type="hidden" name="client_id" value={clientId} />
                <ObligationFields o={o} k={o.id} />
                <div>
                  <SubmitButton>Guardar</SubmitButton>
                </div>
              </form>
              <form action={deleteObligation} className="mt-3">
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="client_id" value={clientId} />
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
          <input type="hidden" name="client_id" value={clientId} />
          <ObligationFields k="nuevo" />
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

function DocList({ docs, clientId, highlightNew }: { docs: DocumentRow[]; clientId: string; highlightNew?: Set<string> }) {
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
            <input type="hidden" name="client_id" value={clientId} />
            <SubmitButton variant="danger" pendingText="…" confirm={`¿Eliminar "${d.name}"?`} confirmLabel="Eliminar">
              Eliminar
            </SubmitButton>
          </form>
        </li>
      ))}
    </ul>
  );
}

export async function DocumentsTab({ clientId, studioId, error }: { clientId: string; studioId: string; error?: string }) {
  const db = getDb();
  const docs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.client_id, clientId), eq(documents.studio_id, studioId)))
    .orderBy(desc(documents.created_at));
  const fromClient = docs.filter((d) => d.source === "cliente");
  const unseen = new Set(fromClient.filter((d) => !d.reviewed_at).map((d) => d.id));
  // Al abrir la pestaña, los documentos nuevos del cliente quedan como vistos
  if (unseen.size) {
    await db
      .update(documents)
      .set({ reviewed_at: new Date() })
      .where(and(eq(documents.client_id, clientId), eq(documents.studio_id, studioId), eq(documents.source, "cliente"), isNull(documents.reviewed_at)));
  }
  return (
    <div className="space-y-8">
      <section className="rounded-md border border-line bg-surface p-5">
        <h2 className="font-semibold">Subir documento para el cliente</h2>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error === "archivo" ? "Elegí un archivo." : error}
          </p>
        )}
        <form action={uploadStudioDocument} className="mt-3 grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr]">
          <input type="hidden" name="client_id" value={clientId} />
          <AdminField label="Archivo" htmlFor="doc-file" hint={`${ALLOWED_LABEL}.`}>
            <Input id="doc-file" name="file" type="file" accept={ACCEPT_ATTR} required className="h-auto py-1.5" />
          </AdminField>
          <AdminField label="Categoría" htmlFor="doc-category">
            <FormSelect id="doc-category" name="category" defaultValue="ddjj" options={CATEGORY_OPTIONS} />
          </AdminField>
          <AdminField label="Período" htmlFor="doc-period">
            <Input id="doc-period" name="period" type="month" />
          </AdminField>
          <div className="sm:col-span-3">
            <SubmitButton pendingText="Subiendo…">Subir y avisar al cliente</SubmitButton>
          </div>
        </form>
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Subidos por el cliente</h2>
        <DocList docs={fromClient} clientId={clientId} highlightNew={unseen} />
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Subidos por el estudio</h2>
        <DocList docs={docs.filter((d) => d.source === "estudio")} clientId={clientId} />
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
                <Link href={`/admin/clientes/${r.client_id}?tab=solicitudes#${r.id}`} className="text-rose-deep hover:underline">
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

export async function RequestsTab({ clientId, studioId }: { clientId: string; studioId: string }) {
  const rows = await getDb()
    .select()
    .from(requests)
    .where(and(eq(requests.client_id, clientId), eq(requests.studio_id, studioId)))
    .orderBy(asc(requests.status), desc(requests.updated_at));
  if (rows.length === 0) return <p className="rounded-md border border-dashed border-line p-5 text-muted">El cliente todavía no hizo solicitudes.</p>;
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <RequestThread key={r.id} request={r} back="ficha" />
      ))}
    </div>
  );
}

export async function PortalTab({
  clientId,
  studioId,
  defaultName,
  defaultEmail,
}: {
  clientId: string;
  studioId: string;
  defaultName: string;
  defaultEmail: string;
}) {
  const access = await getDb()
    .select({ id: users.id, name: users.name, email: users.email, active: users.active, createdAt: users.createdAt })
    .from(client_users)
    .innerJoin(users, eq(users.id, client_users.user_id))
    .where(and(eq(client_users.client_id, clientId), eq(users.studioId, studioId)))
    .orderBy(asc(users.createdAt));
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-muted">
        Con su usuario el cliente entra a <strong>/portal</strong> y ve sus vencimientos, documentos y solicitudes. Nunca ve datos de otros clientes.
      </p>
      {access.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {access.map((u) => (
            <li key={u.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium">
                  {u.name} {!u.active && <Badge tone="danger">Desactivado</Badge>}
                </p>
                <p className="text-sm text-muted">{u.email}</p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                {u.active && <ResetPasswordButton clientId={clientId} userId={u.id} />}
                <form action={setClientUserActive}>
                  <input type="hidden" name="client_id" value={clientId} />
                  <input type="hidden" name="user_id" value={u.id} />
                  <input type="hidden" name="active" value={u.active ? "0" : "1"} />
                  {u.active ? (
                    <SubmitButton variant="danger" pendingText="…" confirm={`¿Quitarle el acceso al portal a ${u.email}?`} confirmLabel="Quitar acceso">
                      Quitar acceso
                    </SubmitButton>
                  ) : (
                    <SubmitButton variant="secondary" pendingText="…">
                      Reactivar
                    </SubmitButton>
                  )}
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      <section className="rounded-md border border-dashed border-line p-5">
        <h2 className="mb-3 font-semibold">{access.length ? "Invitar a otra persona" : "Invitar al cliente al portal"}</h2>
        <InviteClientForm clientId={clientId} defaultName={defaultName} defaultEmail={defaultEmail} />
      </section>
    </div>
  );
}
