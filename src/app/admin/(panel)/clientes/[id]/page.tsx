import { and, count, eq, inArray, isNull, max } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateClientRecord } from "@/app/admin/actions";
import { Notice } from "@/components/admin/AdminField";
import { ClientForm } from "@/components/admin/ClientForm";
import {
  CLIENT_TABS,
  DocumentsTab,
  ObligationsTab,
  PortalTab,
  RequestsTab,
  TabNav,
  type ClientTabKey,
} from "@/components/admin/ClientTabs";
import { getDb } from "@/db";
import { clients, documents, requests, tango_companies, tango_records } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "Cliente" };

const NOTICES: Record<string, string> = {
  guardado: "Cambios guardados.",
  nuevo: "Cliente creado.",
  activado: "Acceso al portal reactivado.",
  desactivado: "Acceso al portal quitado. Se cerraron sus sesiones.",
};

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { studioId } = await requireStaff();
  if (!isUuid(id)) notFound();
  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.studio_id, studioId)));
  if (!client) notFound();

  const tab: ClientTabKey = CLIENT_TABS.some((t) => t.key === sp.tab) ? (sp.tab as ClientTabKey) : "datos";

  // Contadores de las pestañas: documentos nuevos del cliente y solicitudes abiertas
  const [[newDocs], [openReqs], [tango], [tangoCompany]] = await Promise.all([
    db
      .select({ n: count() })
      .from(documents)
      .where(and(eq(documents.client_id, id), eq(documents.studio_id, studioId), eq(documents.source, "cliente"), isNull(documents.reviewed_at))),
    db
      .select({ n: count() })
      .from(requests)
      .where(and(eq(requests.client_id, id), eq(requests.studio_id, studioId), inArray(requests.status, ["abierta", "en_curso"]))),
    // Vínculo con Tango: como cliente de Tango o como empresa de Tango asignada
    db
      .select({ n: count(), lastSync: max(tango_records.synced_at) })
      .from(tango_records)
      .where(and(eq(tango_records.client_id, id), eq(tango_records.studio_id, studioId))),
    db
      .select({ companyId: tango_companies.company_id, lastSync: tango_companies.last_sync_at })
      .from(tango_companies)
      .where(and(eq(tango_companies.client_id, id), eq(tango_companies.studio_id, studioId)))
      .limit(1),
  ]);
  const tangoSync = tango.n > 0 ? tango.lastSync : (tangoCompany?.lastSync ?? null);
  const tangoLinked = tango.n > 0 || Boolean(tangoCompany);

  const notice = Object.keys(NOTICES).find((k) => sp[k]);
  const errorText =
    tab === "datos" && sp.error
      ? sp.error === "cuit"
        ? "Ya hay un cliente con ese CUIT."
        : "No se pudo guardar. Probá de nuevo."
      : tab === "vencimientos" && sp.error
        ? "Revisá los datos del vencimiento: impuesto, período, fecha, monto y un link que empiece con https://."
        : tab === "solicitudes" && sp.error
          ? sp.error
          : null;

  return (
    <div className="max-w-6xl">
      <Link href="/admin/clientes" className="text-sm text-rose-deep underline-offset-4 hover:underline">
        Clientes
      </Link>
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{client.business_name}</h1>
        {!client.active && <span className="rounded-full bg-line/60 px-2.5 py-0.5 text-xs text-muted">Inactivo</span>}
        {tangoLinked && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e3efe6] px-2.5 py-0.5 text-xs font-medium text-[#24583a]">
            Vinculado con Tango
            {tangoCompany && !tango.n ? ` (empresa ${tangoCompany.companyId})` : ""}
            <span className="font-normal">
              · última sincronización{" "}
              {tangoSync
                ? new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(tangoSync))
                : "pendiente"}
            </span>
          </span>
        )}
      </div>
      {notice && <Notice>{sp.nuevo && tab === "datos" ? NOTICES.nuevo : NOTICES[notice]}</Notice>}
      {errorText && (
        <div className="mb-4">
          <Notice tone="error">{errorText}</Notice>
        </div>
      )}

      <TabNav clientId={client.id} active={tab} counts={{ documentos: newDocs.n, solicitudes: openReqs.n }} />

      {tab === "datos" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <ClientForm action={updateClientRecord} client={client} submitLabel="Guardar cambios" />
          <aside className="space-y-4">
            {client.lead_id && (
              <div className="rounded-md border border-line bg-surface p-5">
                <h2 className="font-semibold">Origen</h2>
                <p className="mt-1 text-[15px] text-muted">Llegó como consulta.</p>
                <Link href={`/admin/consultas/${client.lead_id}`} className="mt-2 inline-block text-rose-deep underline-offset-4 hover:underline">
                  Ver consulta original
                </Link>
              </div>
            )}
          </aside>
        </div>
      )}
      {tab === "vencimientos" && <ObligationsTab clientId={client.id} studioId={studioId} />}
      {tab === "documentos" && <DocumentsTab clientId={client.id} studioId={studioId} error={sp.error} />}
      {tab === "solicitudes" && <RequestsTab clientId={client.id} studioId={studioId} />}
      {tab === "portal" && (
        <PortalTab clientId={client.id} studioId={studioId} defaultName={client.contact_name ?? client.business_name} defaultEmail={client.email ?? ""} />
      )}
    </div>
  );
}
