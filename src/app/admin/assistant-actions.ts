"use server";

import { and, desc, eq, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { ai_conversations, documents, organizations, requests } from "@/db/schema";
import { ownConversation } from "@/lib/ai/assistant";
import type { ContextItem, ContextKind } from "@/lib/ai/context";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth";
import { likeTerm } from "@/lib/search";
import { decideApproval } from "@/modules/tools";

// Acciones del Asistente. Todo se valida contra la sesión: estudio y persona.

/** Confirmar o cancelar una acción de escritura que pidió el Asistente (solo quien la pidió) */
export async function decideInlineAction(approvalId: string, approve: boolean): Promise<{ ok: boolean; status?: string; message?: string }> {
  const user = await requireStaff();
  const r = await decideApproval(
    approvalId,
    { id: user.id, email: user.email, name: user.name, role: user.role === "admin" ? "admin" : "contador", studioId: user.studioId },
    approve ? { approve: true } : { approve: false, reason: "Cancelada en el Asistente" },
  );
  revalidatePath("/admin/aprobaciones");
  return r.ok ? { ok: true, status: r.status } : { ok: false, message: r.message };
}

/** Búsqueda para adjuntar contexto (organización, documento o solicitud) */
export async function searchContextAction(kind: ContextKind, q: string): Promise<ContextItem[]> {
  const user = await requireStaff();
  const db = getDb();
  const term = q.trim().slice(0, 80);
  if (kind === "organizacion") {
    const rows = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(and(eq(organizations.studio_id, user.studioId), term ? ilike(organizations.name, likeTerm(term)) : undefined))
      .orderBy(organizations.name)
      .limit(12);
    return rows.map((r) => ({ kind, id: r.id, label: r.name }));
  }
  if (kind === "documento") {
    const rows = await db
      .select({ id: documents.id, name: documents.name, org: organizations.name })
      .from(documents)
      .innerJoin(organizations, eq(organizations.id, documents.organization_id))
      .where(and(eq(documents.studio_id, user.studioId), term ? or(ilike(documents.name, likeTerm(term)), ilike(organizations.name, likeTerm(term))) : undefined))
      .orderBy(desc(documents.created_at))
      .limit(12);
    return rows.map((r) => ({ kind, id: r.id, label: r.name, hint: r.org }));
  }
  const rows = await db
    .select({ id: requests.id, subject: requests.subject, org: organizations.name })
    .from(requests)
    .innerJoin(organizations, eq(organizations.id, requests.organization_id))
    .where(and(eq(requests.studio_id, user.studioId), term ? or(ilike(requests.subject, likeTerm(term)), ilike(organizations.name, likeTerm(term))) : undefined))
    .orderBy(desc(requests.updated_at))
    .limit(12);
  return rows.map((r) => ({ kind: "solicitud" as const, id: r.id, label: r.subject, hint: r.org }));
}

export async function deleteConversation(fd: FormData) {
  const user = await requireStaff();
  const c = await ownConversation(user, String(fd.get("id") ?? ""));
  if (c) {
    await getDb().delete(ai_conversations).where(and(eq(ai_conversations.id, c.id), eq(ai_conversations.user_id, user.id)));
    await audit({ studioId: user.studioId, actor: user, action: "asistente.borrar_conversacion", entityType: "conversacion", entityId: c.id });
  }
  revalidatePath("/admin/asistente");
  redirect("/admin/asistente");
}
