import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { legal_acceptances } from "@/db/schema";
import { audit } from "@/lib/audit";
import { BASE_DOCS, legalVersion, type LegalKey } from "./catalog";

/** Registra la aceptación de la versión vigente de cada documento (una vez por versión) y la audita */
export async function recordAcceptance(user: { id: string; email: string; studioId?: string | null }, docs: LegalKey[], ip?: string | null) {
  const rows = docs.map((d) => ({ user_id: user.id, document: d, version: legalVersion(d), ip: ip ?? null }));
  const inserted = await getDb().insert(legal_acceptances).values(rows).onConflictDoNothing().returning({ document: legal_acceptances.document, version: legal_acceptances.version });
  if (inserted.length)
    await audit({ studioId: user.studioId ?? null, actor: { id: user.id, email: user.email }, action: "legal.aceptar", entityType: "texto_legal", metadata: { documentos: inserted.map((i) => `${i.document}@${i.version}`) } });
}

/** Documentos cuya versión vigente todavía no aceptó */
export async function pendingDocs(userId: string, docs: LegalKey[] = BASE_DOCS): Promise<LegalKey[]> {
  const rows = await getDb()
    .select({ document: legal_acceptances.document, version: legal_acceptances.version })
    .from(legal_acceptances)
    .where(and(eq(legal_acceptances.user_id, userId), inArray(legal_acceptances.document, docs)));
  return docs.filter((d) => !rows.some((r) => r.document === d && r.version === legalVersion(d)));
}

export async function acceptanceOf(userId: string, doc: LegalKey) {
  const [r] = await getDb()
    .select()
    .from(legal_acceptances)
    .where(and(eq(legal_acceptances.user_id, userId), eq(legal_acceptances.document, doc), eq(legal_acceptances.version, legalVersion(doc))));
  return r ?? null;
}
