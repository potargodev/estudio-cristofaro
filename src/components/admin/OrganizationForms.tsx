import { deleteLegalEntity, saveLegalEntity, updateOrganization } from "@/app/admin/organization-actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ORGANIZATION_STATUSES, REGIMES, RISK_LEVELS, formatCuit, type LegalEntity, type Organization } from "@/lib/types";
import { AdminField } from "./AdminField";
import { FormCheckbox, FormSelect, SubmitButton } from "./ui";

const options = (record: Record<string, string>) => Object.entries(record).map(([value, label]) => ({ value, label }));

/** Campos de una razón social (alta de organización y pestaña General) */
export function LegalEntityFields({ le, k, nameRequired = true }: { le?: LegalEntity; k: string; nameRequired?: boolean }) {
  return (
    <>
      <AdminField label="Razón social" htmlFor={`le-name-${k}`} className="sm:col-span-2">
        <Input id={`le-name-${k}`} name="business_name" required={nameRequired} defaultValue={le?.business_name} />
      </AdminField>
      <AdminField label="CUIT" htmlFor={`le-cuit-${k}`} hint="Solo números o con guiones. Único en el estudio.">
        <Input id={`le-cuit-${k}`} name="cuit" inputMode="numeric" defaultValue={le?.cuit ?? ""} />
      </AdminField>
      <AdminField label="Régimen" htmlFor={`le-regime-${k}`}>
        <FormSelect id={`le-regime-${k}`} name="regime" defaultValue={le?.regime ?? "monotributo"} options={options(REGIMES)} />
      </AdminField>
      <AdminField label="Categoría o tipo" htmlFor={`le-category-${k}`} hint="Ej: categoría D, SAS, SRL.">
        <Input id={`le-category-${k}`} name="category" defaultValue={le?.category ?? ""} />
      </AdminField>
      <AdminField label="Domicilio fiscal" htmlFor={`le-address-${k}`}>
        <Input id={`le-address-${k}`} name="tax_address" defaultValue={le?.tax_address ?? ""} />
      </AdminField>
    </>
  );
}

export function OrganizationGeneralForm({ org }: { org: Organization }) {
  return (
    <form action={updateOrganization} className="grid gap-4 rounded-md border border-line bg-surface p-6 sm:grid-cols-2">
      <input type="hidden" name="id" value={org.id} />
      <AdminField label="Nombre de la organización" htmlFor="name" className="sm:col-span-2">
        <Input id="name" name="name" required defaultValue={org.name} />
      </AdminField>
      <AdminField label="Estado" htmlFor="status">
        <FormSelect id="status" name="status" defaultValue={org.status} options={options(ORGANIZATION_STATUSES)} />
      </AdminField>
      <AdminField label="Nivel de riesgo" htmlFor="risk_level">
        <FormSelect id="risk_level" name="risk_level" defaultValue={org.risk_level} options={options(RISK_LEVELS)} />
      </AdminField>
      <AdminField label="Contacto principal" htmlFor="contact_name">
        <Input id="contact_name" name="contact_name" defaultValue={org.contact_name ?? ""} />
      </AdminField>
      <AdminField label="Teléfono" htmlFor="phone">
        <Input id="phone" name="phone" defaultValue={org.phone ?? ""} />
      </AdminField>
      <AdminField label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" defaultValue={org.email ?? ""} />
      </AdminField>
      <AdminField label="Abono mensual ($)" htmlFor="monthly_fee">
        <Input id="monthly_fee" name="monthly_fee" inputMode="decimal" defaultValue={org.monthly_fee != null ? String(org.monthly_fee) : ""} />
      </AdminField>
      <AdminField label="Servicios contratados" htmlFor="services" hint="Uno por línea." className="sm:col-span-2">
        <Textarea id="services" name="services" rows={3} defaultValue={org.services.join("\n")} />
      </AdminField>
      <AdminField label="Notas" htmlFor="notes" className="sm:col-span-2">
        <Textarea id="notes" name="notes" rows={4} defaultValue={org.notes ?? ""} />
      </AdminField>
      <div className="sm:col-span-2">
        <SubmitButton>Guardar cambios</SubmitButton>
      </div>
    </form>
  );
}

export function LegalEntitiesSection({ orgId, entities, limitText }: { orgId: string; entities: LegalEntity[]; limitText: string }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Razones sociales</h2>
        <p className="text-sm text-muted">{limitText}</p>
      </div>
      <div className="space-y-2">
        {entities.map((le) => (
          <details key={le.id} className="group rounded-md border border-line bg-surface">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="font-medium">{le.business_name}</span>
                <span className="ml-2 text-sm text-muted">
                  {formatCuit(le.cuit, "Sin CUIT")} · {REGIMES[le.regime]}
                  {le.category ? ` · ${le.category}` : ""}
                  {!le.active ? " · inactiva" : ""}
                </span>
              </span>
              <span className="text-sm text-rose-deep group-open:hidden">Editar</span>
            </summary>
            <div className="border-t border-line p-4">
              <form action={saveLegalEntity} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="organization_id" value={orgId} />
                <input type="hidden" name="id" value={le.id} />
                <LegalEntityFields le={le} k={le.id} />
                <FormCheckbox id={`le-active-${le.id}`} name="active" label="Activa" defaultChecked={le.active} />
                <div className="sm:col-span-2">
                  <SubmitButton>Guardar razón social</SubmitButton>
                </div>
              </form>
              {entities.length > 1 && (
                <form action={deleteLegalEntity} className="mt-3">
                  <input type="hidden" name="organization_id" value={orgId} />
                  <input type="hidden" name="id" value={le.id} />
                  <SubmitButton variant="danger" pendingText="Eliminando…" confirm={`¿Eliminar la razón social "${le.business_name}"?`}>
                    Eliminar
                  </SubmitButton>
                </form>
              )}
            </div>
          </details>
        ))}
      </div>
      <details className="rounded-md border border-dashed border-line p-4">
        <summary className="cursor-pointer font-medium text-rose-deep">Agregar razón social</summary>
        <form action={saveLegalEntity} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="organization_id" value={orgId} />
          <LegalEntityFields k="nueva" />
          <div className="sm:col-span-2">
            <SubmitButton>Agregar</SubmitButton>
          </div>
        </form>
      </details>
    </section>
  );
}
