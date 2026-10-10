import type { Metadata } from "next";
import Link from "next/link";
import { AdminField, AdminPageHeader, Notice } from "@/components/admin/AdminField";
import { SubmitButton, FormSelect } from "@/components/admin/ui";
import { CONTRIBUTOR_TYPES } from "@/lib/types";
import { createLead } from "../../../actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminButton } from "@/components/admin/styles";

export const metadata: Metadata = { title: "Cargar consulta" };

export default async function NuevaConsultaPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="max-w-2xl">
      <AdminPageHeader title="Cargar consulta" />
      <p className="mb-6 text-muted">Para consultas que llegan por WhatsApp, teléfono o en persona.</p>
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error === "nombre" ? "El nombre es obligatorio." : "No se pudo guardar. Probá de nuevo."}</Notice>
        </div>
      )}
      <form action={createLead} className="grid gap-4 border border-line bg-surface p-6 sm:grid-cols-2">
        <AdminField label="Nombre" htmlFor="name" className="sm:col-span-2">
          <Input id="name" name="name" required />
        </AdminField>
        <AdminField label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" />
        </AdminField>
        <AdminField label="Teléfono" htmlFor="phone">
          <Input id="phone" name="phone" />
        </AdminField>
        <AdminField label="Empresa" htmlFor="company">
          <Input id="company" name="company" />
        </AdminField>
        <AdminField label="Tipo de contribuyente" htmlFor="contributor_type">
          <FormSelect
            id="contributor_type"
            name="contributor_type"
            options={[{ value: "", label: "Sin definir" }, ...Object.entries(CONTRIBUTOR_TYPES).map(([value, label]) => ({ value, label }))]}
          />
        </AdminField>
        <AdminField label="Actividad" htmlFor="activity">
          <Input id="activity" name="activity" />
        </AdminField>
        <AdminField label="Origen" htmlFor="source">
          <FormSelect
            id="source"
            name="source"
            defaultValue="whatsapp"
            options={[
              { value: "whatsapp", label: "WhatsApp" },
              { value: "manual", label: "Teléfono o en persona" },
              { value: "otro", label: "Otro" },
            ]}
          />
        </AdminField>
        <AdminField label="Qué necesita" htmlFor="message" className="sm:col-span-2">
          <Textarea id="message" name="message" rows={4} />
        </AdminField>
        <div className="flex gap-3 sm:col-span-2">
          <SubmitButton>Guardar consulta</SubmitButton>
          <Link href="/admin/consultas" className={adminButton.ghost}>
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
