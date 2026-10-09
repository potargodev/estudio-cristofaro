import "server-only";
import { and, asc, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, obligations, request_messages, requests } from "@/db/schema";
import type { PortalUser } from "./auth";
import { isUuid } from "./ids";
import { can } from "./permissions";
import { todayISO } from "./portal-types";

// Lecturas del portal. TODAS filtran por la organización activa y el estudio de
// la sesión (PortalUser sale de requireMember), así un miembro nunca ve datos de
// otra organización aunque fuerce un id en la URL. Las solicitudes además se
// filtran según el rol (RRHH ve solo las laborales).

const own = (me: PortalUser) => ({
  orgId: me.organizationId,
  studioId: me.studioId,
});

/** Filtro de solicitudes según el rol: todas, solo laborales o ninguna */
function requestScope(me: PortalUser) {
  if (can(me.orgRole, "solicitudes.ver")) return undefined;
  if (can(me.orgRole, "solicitudes.laborales")) return eq(requests.type, "empleado");
  return sql`false`;
}

export async function getObligations(me: PortalUser) {
  const { orgId, studioId } = own(me);
  return getDb()
    .select()
    .from(obligations)
    .where(and(eq(obligations.organization_id, orgId), eq(obligations.studio_id, studioId)))
    .orderBy(desc(obligations.due_date));
}

export async function getUpcomingObligations(me: PortalUser, limit = 5) {
  const { orgId, studioId } = own(me);
  return getDb()
    .select()
    .from(obligations)
    .where(
      and(
        eq(obligations.organization_id, orgId),
        eq(obligations.studio_id, studioId),
        gte(obligations.due_date, todayISO()),
        notInArray(obligations.status, ["presentado", "pagado"]),
      ),
    )
    .orderBy(asc(obligations.due_date))
    .limit(limit);
}

export async function getDocuments(me: PortalUser) {
  const { orgId, studioId } = own(me);
  return getDb()
    .select()
    .from(documents)
    .where(and(eq(documents.organization_id, orgId), eq(documents.studio_id, studioId)))
    .orderBy(desc(documents.created_at));
}

export async function getLatestStudioDocument(me: PortalUser) {
  const { orgId, studioId } = own(me);
  const [doc] = await getDb()
    .select()
    .from(documents)
    .where(and(eq(documents.organization_id, orgId), eq(documents.studio_id, studioId), eq(documents.source, "estudio")))
    .orderBy(desc(documents.created_at))
    .limit(1);
  return doc ?? null;
}

export async function getRequests(me: PortalUser, onlyOpen = false) {
  const { orgId, studioId } = own(me);
  return getDb()
    .select()
    .from(requests)
    .where(
      and(
        eq(requests.organization_id, orgId),
        eq(requests.studio_id, studioId),
        onlyOpen ? inArray(requests.status, ["abierta", "en_curso"]) : undefined,
        requestScope(me),
      ),
    )
    .orderBy(desc(requests.updated_at));
}

/** Una solicitud de la organización con sus mensajes y adjuntos, o null si no es suya o no la puede ver */
export async function getRequestThread(me: PortalUser, requestId: string) {
  if (!isUuid(requestId)) return null;
  const { orgId, studioId } = own(me);
  const db = getDb();
  const [req] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.organization_id, orgId), eq(requests.studio_id, studioId), requestScope(me)));
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
