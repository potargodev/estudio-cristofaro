import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, obligations, request_messages, requests } from "@/db/schema";
import type { PortalUser } from "./auth";
import { isUuid } from "./ids";
import { can, canSeeRequests } from "./permissions";
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

const monthRange = () => {
  const now = new Date();
  const ar = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const y = ar.getFullYear();
  const m = ar.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${y}-${pad(m + 1)}-01`, to: `${m === 11 ? y + 1 : y}-${pad(m === 11 ? 1 : m + 2)}-01`, start: new Date(Date.UTC(y, m, 1, 3)) };
};

/** "Este mes": vencimientos del mes, documentos y solicitudes (según lo que el rol puede ver) */
export async function getMonthSummary(me: PortalUser) {
  const { orgId, studioId } = own(me);
  const { from, to, start } = monthRange();
  const db = getDb();
  const [obl, docs, reqs] = await Promise.all([
    can(me.orgRole, "vencimientos.ver")
      ? db
          .select({ status: obligations.status })
          .from(obligations)
          .where(
            and(
              eq(obligations.organization_id, orgId),
              eq(obligations.studio_id, studioId),
              gte(obligations.due_date, from),
              lt(obligations.due_date, to),
            ),
          )
      : null,
    can(me.orgRole, "documentos.ver")
      ? db
          .select({ source: documents.source })
          .from(documents)
          .where(and(eq(documents.organization_id, orgId), eq(documents.studio_id, studioId), gte(documents.created_at, start)))
      : null,
    canSeeRequests(me.orgRole)
      ? db
          .select({ status: requests.status })
          .from(requests)
          .where(and(eq(requests.organization_id, orgId), eq(requests.studio_id, studioId), gte(requests.updated_at, start), requestScope(me)))
      : null,
  ]);
  return {
    obligations: obl && { total: obl.length, done: obl.filter((o) => o.status === "presentado" || o.status === "pagado").length },
    documents: docs && {
      fromStudio: docs.filter((d) => d.source === "estudio").length,
      fromClient: docs.filter((d) => d.source === "cliente").length,
    },
    requests: reqs && { resolved: reqs.filter((r) => r.status === "resuelta").length, open: reqs.filter((r) => r.status !== "resuelta").length },
  };
}

export interface TimelineItem {
  id: string;
  at: Date;
  kind: "documento" | "solicitud" | "vencimiento";
  title: string;
  detail: string;
  href: string;
}

/** Línea de tiempo del inicio: lo último que pasó en la organización */
export async function getTimeline(me: PortalUser, limit = 8): Promise<TimelineItem[]> {
  const { orgId, studioId } = own(me);
  const db = getDb();
  const [docs, reqs, obls] = await Promise.all([
    can(me.orgRole, "documentos.ver")
      ? db
          .select({ id: documents.id, at: documents.created_at, name: documents.name, source: documents.source })
          .from(documents)
          .where(and(eq(documents.organization_id, orgId), eq(documents.studio_id, studioId)))
          .orderBy(desc(documents.created_at))
          .limit(limit)
      : [],
    canSeeRequests(me.orgRole)
      ? db
          .select({ id: requests.id, at: requests.updated_at, subject: requests.subject, status: requests.status })
          .from(requests)
          .where(and(eq(requests.organization_id, orgId), eq(requests.studio_id, studioId), requestScope(me)))
          .orderBy(desc(requests.updated_at))
          .limit(limit)
      : [],
    can(me.orgRole, "vencimientos.ver")
      ? db
          .select({ id: obligations.id, at: obligations.updated_at, tax: obligations.tax, period: obligations.period, status: obligations.status })
          .from(obligations)
          .where(and(eq(obligations.organization_id, orgId), eq(obligations.studio_id, studioId)))
          .orderBy(desc(obligations.updated_at))
          .limit(limit)
      : [],
  ]);
  const items: TimelineItem[] = [
    ...docs.map((d) => ({
      id: d.id,
      at: d.at,
      kind: "documento" as const,
      title: d.source === "estudio" ? "El estudio subió un documento" : "Subieron un documento",
      detail: d.name,
      href: "/portal/documentos",
    })),
    ...reqs.map((r) => ({
      id: r.id,
      at: r.at,
      kind: "solicitud" as const,
      title:
        r.status === "resuelta"
          ? "Solicitud resuelta"
          : r.status === "en_curso"
            ? "El estudio está trabajando en una solicitud"
            : "Solicitud abierta",
      detail: r.subject,
      href: `/portal/solicitudes/${r.id}`,
    })),
    ...obls.map((o) => ({
      id: o.id,
      at: o.at,
      kind: "vencimiento" as const,
      title: o.status === "presentado" || o.status === "pagado" ? `Vencimiento ${o.status}` : "Vencimiento cargado",
      detail: `${o.tax} · ${o.period}`,
      href: "/portal/vencimientos",
    })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
