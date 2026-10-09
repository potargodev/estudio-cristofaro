import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { AdminPageHeader, Notice } from "@/components/admin/AdminField";
import { RequestThread } from "@/components/admin/ClientTabs";
import { getDb } from "@/db";
import { clients, requests } from "@/db/schema";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Solicitudes" };

export default async function SolicitudesAdminPage({ searchParams }: { searchParams: Promise<{ guardado?: string; error?: string }> }) {
  const { guardado, error } = await searchParams;
  const { studioId } = await requireStaff();
  const rows = await getDb()
    .select({ request: requests, clientName: clients.business_name })
    .from(requests)
    .innerJoin(clients, eq(clients.id, requests.client_id))
    .where(and(eq(requests.studio_id, studioId), inArray(requests.status, ["abierta", "en_curso"])))
    .orderBy(asc(requests.status), desc(requests.updated_at));

  return (
    <div className="max-w-4xl">
      <AdminPageHeader title="Solicitudes abiertas" />
      <p className="mb-6 text-muted">Lo que pidieron los clientes desde el portal. Al responder, al cliente le llega un aviso por mail.</p>
      {guardado && <Notice>Respuesta guardada.</Notice>}
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-6 text-muted">No hay solicitudes abiertas.</p>
      ) : (
        <div className="space-y-4">
          {rows.map(({ request, clientName }) => (
            <RequestThread key={request.id} request={request} back="solicitudes" clientName={clientName} />
          ))}
        </div>
      )}
    </div>
  );
}
