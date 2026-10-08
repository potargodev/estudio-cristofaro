import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminField";
import { LeadBoard } from "@/components/admin/LeadBoard";
import { adminInput } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Consultas" };

export default async function ConsultasPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase } = await requireStaff();

  let query = supabase
    .from("leads")
    .select("id, name, company, contributor_type, source, status, created_at, next_action, next_action_at")
    .order("created_at", { ascending: false })
    .limit(400);
  if (q) {
    const term = q.replace(/[%,()]/g, " ").trim();
    query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  const { data: leads, error } = await query;

  return (
    <>
      <AdminPageHeader title="Consultas">
        <form className="flex gap-2" role="search">
          <label htmlFor="q" className="sr-only">
            Buscar
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Buscar por nombre, email, empresa…" className={`${adminInput} mt-0 w-64`} />
        </form>
        <Link href="/admin/consultas/nueva" className="rounded-md bg-green px-4 py-2 text-[15px] font-medium text-paper hover:bg-green-deep">
          Cargar consulta
        </Link>
      </AdminPageHeader>
      <p className="mb-4 text-sm text-muted">Arrastrá las tarjetas entre columnas o usá el selector de cada una para cambiar el estado.</p>
      {error ? (
        <p className="text-danger">No se pudieron cargar las consultas: {error.message}</p>
      ) : (
        <LeadBoard leads={leads ?? []} />
      )}
    </>
  );
}
