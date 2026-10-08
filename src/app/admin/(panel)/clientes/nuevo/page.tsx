import type { Metadata } from "next";
import Link from "next/link";
import { createClientRecord } from "@/app/admin/actions";
import { AdminPageHeader, Notice } from "@/components/admin/AdminField";
import { ClientForm } from "@/components/admin/ClientForm";

export const metadata: Metadata = { title: "Nuevo cliente" };

const errors: Record<string, string> = {
  nombre: "La razón social es obligatoria.",
  cuit: "Ya hay un cliente con ese CUIT.",
  guardar: "No se pudo guardar. Probá de nuevo.",
};

export default async function NuevoClientePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="max-w-3xl">
      <Link href="/admin/clientes" className="text-sm text-green underline-offset-4 hover:underline">
        Clientes
      </Link>
      <div className="mt-2">
        <AdminPageHeader title="Nuevo cliente" />
      </div>
      {error && (
        <div className="mb-4">
          <Notice tone="error">{errors[error] ?? errors.guardar}</Notice>
        </div>
      )}
      <ClientForm action={createClientRecord} submitLabel="Crear cliente" />
    </div>
  );
}
