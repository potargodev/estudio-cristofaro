import "server-only";
import type { Db } from "@/db";
import { legal_entities, organization_staff, organizations } from "@/db/schema";
import type { TaxRegime } from "./types";

// Escrituras compartidas de organizaciones. Va fuera de los archivos "use
// server" a propósito: así no queda expuesta como action sin control de sesión.

interface NewOrganization {
  studioId: string;
  name: string;
  legalEntity: { business_name: string; cuit: string | null; regime: TaxRegime; category?: string | null; tax_address?: string | null };
  contact?: { contact_name?: string | null; email?: string | null; phone?: string | null };
  notes?: string | null;
  services?: string[];
  servicePlanId?: string | null;
  leadId?: string | null;
  responsableId?: string | null;
}

/**
 * Crea la organización con su primera razón social (y, si viene, su
 * responsable). La usan el alta manual, "Convertir consulta en cliente" y la
 * importación de un cliente de Tango.
 */
export async function insertOrganization(db: Db, input: NewOrganization) {
  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({
        studio_id: input.studioId,
        name: input.name,
        status: "onboarding",
        contact_name: input.contact?.contact_name ?? null,
        email: input.contact?.email ?? null,
        phone: input.contact?.phone ?? null,
        notes: input.notes ?? null,
        services: input.services ?? [],
        service_plan_id: input.servicePlanId ?? null,
        lead_id: input.leadId ?? null,
      })
      .returning({ id: organizations.id });
    const [le] = await tx
      .insert(legal_entities)
      .values({ studio_id: input.studioId, organization_id: org.id, ...input.legalEntity })
      .returning({ id: legal_entities.id });
    if (input.responsableId) {
      await tx.insert(organization_staff).values({ organization_id: org.id, user_id: input.responsableId, assignment: "responsable" });
    }
    return { organizationId: org.id, legalEntityId: le.id };
  });
}

