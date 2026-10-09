import "server-only";
import { and, asc, desc, eq, gte, inArray, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, obligations, request_messages, requests } from "@/db/schema";
import type { PortalUser } from "./auth";
import { isUuid } from "./ids";
import { todayISO } from "./portal-types";

// Lecturas del portal. TODAS filtran por el cliente y el estudio de la sesión
// (PortalUser sale de requireClient), así un cliente nunca ve datos de otro
// aunque fuerce un id en la URL.

const own = (me: PortalUser) => ({ clientId: me.clientId, studioId: me.studioId });

export async function getObligations(me: PortalUser) {
  const { clientId, studioId } = own(me);
  return getDb()
    .select()
    .from(obligations)
    .where(and(eq(obligations.client_id, clientId), eq(obligations.studio_id, studioId)))
    .orderBy(desc(obligations.due_date));
}

export async function getUpcomingObligations(me: PortalUser, limit = 5) {
  const { clientId, studioId } = own(me);
  return getDb()
    .select()
    .from(obligations)
    .where(
      and(
        eq(obligations.client_id, clientId),
        eq(obligations.studio_id, studioId),
        gte(obligations.due_date, todayISO()),
        notInArray(obligations.status, ["presentado", "pagado"]),
      ),
    )
    .orderBy(asc(obligations.due_date))
    .limit(limit);
}

export async function getDocuments(me: PortalUser) {
  const { clientId, studioId } = own(me);
  return getDb()
    .select()
    .from(documents)
    .where(and(eq(documents.client_id, clientId), eq(documents.studio_id, studioId)))
    .orderBy(desc(documents.created_at));
}

export async function getLatestStudioDocument(me: PortalUser) {
  const { clientId, studioId } = own(me);
  const [doc] = await getDb()
    .select()
    .from(documents)
    .where(and(eq(documents.client_id, clientId), eq(documents.studio_id, studioId), eq(documents.source, "estudio")))
    .orderBy(desc(documents.created_at))
    .limit(1);
  return doc ?? null;
}

export async function getRequests(me: PortalUser, onlyOpen = false) {
  const { clientId, studioId } = own(me);
  return getDb()
    .select()
    .from(requests)
    .where(
      and(
        eq(requests.client_id, clientId),
        eq(requests.studio_id, studioId),
        onlyOpen ? inArray(requests.status, ["abierta", "en_curso"]) : undefined,
      ),
    )
    .orderBy(desc(requests.updated_at));
}

/** Una solicitud del cliente con sus mensajes y adjuntos, o null si no es suya */
export async function getRequestThread(me: PortalUser, requestId: string) {
  if (!isUuid(requestId)) return null;
  const { clientId, studioId } = own(me);
  const db = getDb();
  const [req] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.client_id, clientId), eq(requests.studio_id, studioId)));
  if (!req) return null;
  const messages = await db
    .select({
      id: request_messages.id,
      body: request_messages.body,
      from_client: request_messages.from_client,
      created_at: request_messages.created_at,
      document_id: documents.id,
      document_name: documents.name,
    })
    .from(request_messages)
    .leftJoin(documents, eq(documents.id, request_messages.document_id))
    .where(eq(request_messages.request_id, req.id))
    .orderBy(asc(request_messages.created_at));
  return { request: req, messages };
}
