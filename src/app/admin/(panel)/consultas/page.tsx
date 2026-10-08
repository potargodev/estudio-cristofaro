import { and, desc, eq, ilike, or } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminField";
import { LeadBoard } from "@/components/admin/LeadBoard";

import { getDb } from "@/db";
import { leads } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { likeTerm } from "@/lib/search";
import { Input } from "@/components/ui/input";
import { adminButton } from "@/components/admin/styles";

export const metadata: Metadata = { title: "Consultas" };

export default async function ConsultasPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { studioId } = await requireStaff();

  const term = q ? likeTerm(q) : null;
  let rows: Parameters<typeof LeadBoard>[0]["leads"] = [];
  let error: string | null = null;
  try {
    rows = await getDb()
      .select({
        id: leads.id,
        name: leads.name,
        company: leads.company,
        contributor_type: leads.contributor_type,
        source: leads.source,
        status: leads.status,
        created_at: leads.created_at,
        next_action: leads.next_action,
        next_action_at: leads.next_action_at,
      })
      .from(leads)
      .where(
        and(
          eq(leads.studio_id, studioId),
          term
            ? or(ilike(leads.name, term), ilike(leads.email, term), ilike(leads.company, term), ilike(leads.phone, term))
            : undefined,
        ),
      )
      .orderBy(desc(leads.created_at))
      .limit(400);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <>
      <AdminPageHeader title="Consultas">
        <form className="flex gap-2" role="search">
          <label htmlFor="q" className="sr-only">
            Buscar
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="Buscar por nombre, email, empresa…" className="w-64" />
        </form>
        <Link href="/admin/consultas/nueva" className={adminButton.primary}>
          Cargar consulta
        </Link>
      </AdminPageHeader>
      <p className="mb-4 text-sm text-muted">Arrastrá las tarjetas entre columnas o usá el selector de cada una para cambiar el estado.</p>
      {error ? (
        <p className="text-danger">No se pudieron cargar las consultas: {error}</p>
      ) : (
        <LeadBoard leads={rows} />
      )}
    </>
  );
}
