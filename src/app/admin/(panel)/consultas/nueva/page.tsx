import type { Metadata } from "next";
import Link from "next/link";
import { AdminField, AdminPageHeader, Notice } from "@/components/admin/AdminField";
import { SubmitButton, adminInput } from "@/components/admin/ui";
import { CONTRIBUTOR_TYPES } from "@/lib/types";
import { createLead } from "../../../actions";

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
      <form action={createLead} className="grid gap-4 rounded-md border border-line bg-surface p-6 sm:grid-cols-2">
        <AdminField label="Nombre" htmlFor="name" className="sm:col-span-2">
          <input id="name" name="name" required className={adminInput} />
        </AdminField>
        <AdminField label="Email" htmlFor="email">
          <input id="email" name="email" type="email" className={adminInput} />
        </AdminField>
        <AdminField label="Teléfono" htmlFor="phone">
          <input id="phone" name="phone" className={adminInput} />
        </AdminField>
        <AdminField label="Empresa" htmlFor="company">
          <input id="company" name="company" className={adminInput} />
        </AdminField>
        <AdminField label="Tipo de contribuyente" htmlFor="contributor_type">
          <select id="contributor_type" name="contributor_type" className={adminInput} defaultValue="">
            <option value="">Sin definir</option>
            {Object.entries(CONTRIBUTOR_TYPES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField label="Actividad" htmlFor="activity">
          <input id="activity" name="activity" className={adminInput} />
        </AdminField>
        <AdminField label="Origen" htmlFor="source">
          <select id="source" name="source" className={adminInput} defaultValue="whatsapp">
            <option value="whatsapp">WhatsApp</option>
            <option value="manual">Teléfono o en persona</option>
            <option value="otro">Otro</option>
          </select>
        </AdminField>
        <AdminField label="Qué necesita" htmlFor="message" className="sm:col-span-2">
          <textarea id="message" name="message" rows={4} className={adminInput} />
        </AdminField>
        <div className="flex gap-3 sm:col-span-2">
          <SubmitButton>Guardar consulta</SubmitButton>
          <Link href="/admin/consultas" className="rounded-md px-4 py-2 text-[15px] text-muted hover:text-ink">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
