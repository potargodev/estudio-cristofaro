"use server";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { leads, legal_entities, organizations, requests } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { likeTerm } from "@/lib/search";

export interface SearchHit {
  group: "Organizaciones" | "Razones sociales" | "Consultas" | "Solicitudes";
  id: string;
  title: string;
  detail: string;
  href: string;
}

/**
 * Buscador global del backoffice (Cmd/Ctrl+K). Siempre dentro del estudio de la
 * sesión: el estudio sale del servidor, nunca del navegador.
 */
export async function adminSearch(q: string): Promise<SearchHit[]> {
  const { studioId } = await requireStaff();
  const term = String(q ?? "").trim().slice(0, 80);
  if (term.length < 2) return [];
  const db = getDb();
  const like = likeTerm(term);
  const digits = term.replace(/\D/g, "");
  const cuitLike = digits.length >= 3 ? `%${digits}%` : null;

  const [orgs, entities, leadRows, reqRows] = await Promise.all([
    db
      .select({ id: organizations.id, name: organizations.name, status: organizations.status })
      .from(organizations)
      .where(and(eq(organizations.studio_id, studioId), ilike(organizations.name, like)))
      .orderBy(organizations.name)
      .limit(5),
    db
      .select({ id: legal_entities.id, org: legal_entities.organization_id, name: legal_entities.business_name, cuit: legal_entities.cuit, orgName: organizations.name })
      .from(legal_entities)
      .innerJoin(organizations, eq(organizations.id, legal_entities.organization_id))
      .where(
        and(
          eq(legal_entities.studio_id, studioId),
          eq(organizations.studio_id, studioId),
          or(ilike(legal_entities.business_name, like), cuitLike ? sql`regexp_replace(coalesce(${legal_entities.cuit}, ''), '\\D', '', 'g') like ${cuitLike}` : undefined),
        ),
      )
      .limit(5),
    db
      .select({ id: leads.id, name: leads.name, company: leads.company, email: leads.email })
      .from(leads)
      .where(and(eq(leads.studio_id, studioId), or(ilike(leads.name, like), ilike(leads.company, like), ilike(leads.email, like))))
      .orderBy(desc(leads.created_at))
      .limit(5),
    db
      .select({ id: requests.id, subject: requests.subject, orgName: organizations.name })
      .from(requests)
      .innerJoin(organizations, eq(organizations.id, requests.organization_id))
      .where(and(eq(requests.studio_id, studioId), eq(organizations.studio_id, studioId), ilike(requests.subject, like)))
      .orderBy(desc(requests.updated_at))
      .limit(5),
  ]);

  return [
    ...orgs.map((o) => ({ group: "Organizaciones" as const, id: o.id, title: o.name, detail: "Organización", href: `/admin/organizaciones/${o.id}` })),
    ...entities.map((e) => ({
      group: "Razones sociales" as const,
      id: e.id,
      title: e.name,
      detail: [e.cuit ? `CUIT ${e.cuit}` : null, e.orgName].filter(Boolean).join(" · "),
      href: `/admin/organizaciones/${e.org}`,
    })),
    ...leadRows.map((l) => ({
      group: "Consultas" as const,
      id: l.id,
      title: l.name,
      detail: [l.company, l.email].filter(Boolean).join(" · ") || "Consulta",
      href: `/admin/consultas/${l.id}`,
    })),
    ...reqRows.map((r) => ({ group: "Solicitudes" as const, id: r.id, title: r.subject, detail: r.orgName, href: `/admin/solicitudes?id=${r.id}` })),
  ];
}
