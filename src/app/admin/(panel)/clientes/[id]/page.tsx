import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateClientRecord } from "@/app/admin/actions";
import { Notice } from "@/components/admin/AdminField";
import { ClientForm } from "@/components/admin/ClientForm";
import { requireStaff } from "@/lib/auth";
import type { Client } from "@/lib/types";

export const metadata: Metadata = { title: "Cliente" };

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardado?: string; nuevo?: string; error?: string }>;
}) {
  const { id } = await params;
  const { guardado, nuevo, error } = await searchParams;
  const { supabase } = await requireStaff();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const client = data as Client;

  return (
    <div className="grid max-w-6xl gap-6 xl:grid-cols-[1fr_320px]">
      <div>
        <Link href="/admin/clientes" className="text-sm text-green underline-offset-4 hover:underline">
          Clientes
        </Link>
        <h1 className="mb-6 mt-2 text-2xl font-semibold tracking-tight">{client.business_name}</h1>
        {(guardado || nuevo) && (
          <div className="mb-4">
            <Notice>{nuevo ? "Cliente creado." : "Cambios guardados."}</Notice>
          </div>
        )}
        {error && (
          <div className="mb-4">
            <Notice tone="error">{error === "cuit" ? "Ya hay un cliente con ese CUIT." : "No se pudo guardar. Probá de nuevo."}</Notice>
          </div>
        )}
        <ClientForm action={updateClientRecord} client={client} submitLabel="Guardar cambios" />
      </div>

      <aside className="space-y-4 xl:pt-14">
        {client.lead_id && (
          <div className="rounded-md border border-line bg-surface p-5">
            <h2 className="font-semibold">Origen</h2>
            <p className="mt-1 text-[15px] text-muted">Llegó como consulta.</p>
            <Link href={`/admin/consultas/${client.lead_id}`} className="mt-2 inline-block text-green underline-offset-4 hover:underline">
              Ver consulta original
            </Link>
          </div>
        )}
        <div className="rounded-md border border-dashed border-line p-5">
          <h2 className="font-semibold">Próximamente</h2>
          <ul className="mt-2 space-y-1.5 text-[15px] text-muted">
            <li>Calendario de vencimientos según CUIT</li>
            <li>Documentos y comprobantes</li>
            <li>Acceso del cliente al portal</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
