import type { Metadata } from "next";
import Link from "next/link";
import { createOrganization } from "@/app/admin/organization-actions";
import { AdminField, AdminPageHeader, Notice } from "@/components/admin/AdminField";
import { LegalEntityFields } from "@/components/admin/OrganizationForms";
import { FormSelect, SubmitButton } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireOperator } from "@/lib/auth";
import { getServicePlans, getStudioStaff } from "@/lib/organizations";

export const metadata: Metadata = { title: "Nueva organización" };

const ERRORS: Record<string, string> = {
  nombre: "El nombre es obligatorio.",
  cuit: "Ya hay una razón social con ese CUIT en el estudio.",
  guardar: "No se pudo guardar. Probá de nuevo.",
};

export default async function NuevaOrganizacionPage({ searchParams }: { searchParams: Promise<{ error?: string; msg?: string }> }) {
  const { error, msg } = await searchParams;
  const staff = await requireOperator();
  const [plans, people] = await Promise.all([getServicePlans(staff.studioId), getStudioStaff(staff.studioId)]);
  return (
    <div className="max-w-3xl">
      <Link href="/admin/organizaciones" className="text-sm text-ink underline underline-offset-4 hover:text-rose-deep">
        Organizaciones
      </Link>
      <div className="mt-2">
        <AdminPageHeader title="Nueva organización" />
      </div>
      <p className="mb-6 text-muted">
        Cargá la empresa y su primera razón social. Después, desde la ficha, sumás más CUIT, módulos, el equipo del estudio y su primer
        administrador.
      </p>
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error === "limite" && msg ? msg : (ERRORS[error] ?? ERRORS.guardar)}</Notice>
        </div>
      )}
      <form action={createOrganization} className="grid gap-6">
        <fieldset className="grid gap-4 border border-line bg-surface p-6 sm:grid-cols-2">
          <legend className="px-1 font-semibold">Organización</legend>
          <AdminField label="Nombre de la organización" htmlFor="name" hint="Como la conocen en el estudio." className="sm:col-span-2">
            <Input id="name" name="name" required />
          </AdminField>
          <AdminField label="Plan" htmlFor="service_plan_id">
            <FormSelect
              id="service_plan_id"
              name="service_plan_id"
              defaultValue={plans[0]?.id ?? ""}
              options={[{ value: "", label: "Sin plan por ahora" }, ...plans.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </AdminField>
          <AdminField label="Responsable del estudio" htmlFor="responsable_id">
            <FormSelect
              id="responsable_id"
              name="responsable_id"
              defaultValue={staff.id}
              options={[{ value: "", label: "Sin asignar" }, ...people.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </AdminField>
          <AdminField label="Contacto principal" htmlFor="contact_name">
            <Input id="contact_name" name="contact_name" />
          </AdminField>
          <AdminField label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" />
          </AdminField>
          <AdminField label="Teléfono" htmlFor="phone">
            <Input id="phone" name="phone" />
          </AdminField>
          <AdminField label="Notas" htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" name="notes" rows={3} />
          </AdminField>
        </fieldset>
        <fieldset className="grid gap-4 border border-line bg-surface p-6 sm:grid-cols-2">
          <legend className="px-1 font-semibold">Primera razón social</legend>
          <LegalEntityFields k="alta" nameRequired={false} />
          <p className="text-sm text-muted sm:col-span-2">Si dejás la razón social vacía se usa el nombre de la organización.</p>
        </fieldset>
        <div>
          <SubmitButton>Crear organización</SubmitButton>
        </div>
      </form>
    </div>
  );
}
