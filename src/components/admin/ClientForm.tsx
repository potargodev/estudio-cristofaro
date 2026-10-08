import { AdminField } from "./AdminField";
import { SubmitButton, FormCheckbox, FormSelect } from "./ui";
import { REGIMES, type Client } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ClientForm({
  action,
  client,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<void>;
  client?: Client;
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid gap-4 rounded-md border border-line bg-surface p-6 sm:grid-cols-2">
      {client && <input type="hidden" name="id" value={client.id} />}
      <AdminField label="Razón social o nombre" htmlFor="business_name" className="sm:col-span-2">
        <Input id="business_name" name="business_name" required defaultValue={client?.business_name} />
      </AdminField>
      <AdminField label="CUIT" htmlFor="cuit" hint="Solo números o con guiones.">
        <Input id="cuit" name="cuit" inputMode="numeric" defaultValue={client?.cuit ?? ""} />
      </AdminField>
      <AdminField label="Régimen" htmlFor="regime">
        <FormSelect
          id="regime"
          name="regime"
          defaultValue={client?.regime ?? "monotributo"}
          options={Object.entries(REGIMES).map(([value, label]) => ({ value, label }))}
        />
      </AdminField>
      <AdminField label="Categoría o tipo" htmlFor="category" hint="Ej: categoría D, SAS, SRL.">
        <Input id="category" name="category" defaultValue={client?.category ?? ""} />
      </AdminField>
      <AdminField label="Abono mensual ($)" htmlFor="monthly_fee">
        <Input
          id="monthly_fee"
          name="monthly_fee"
          inputMode="decimal"
          defaultValue={client?.monthly_fee != null ? String(client.monthly_fee) : ""}
        />
      </AdminField>
      <AdminField label="Contacto" htmlFor="contact_name">
        <Input id="contact_name" name="contact_name" defaultValue={client?.contact_name ?? ""} />
      </AdminField>
      <AdminField label="Teléfono" htmlFor="phone">
        <Input id="phone" name="phone" defaultValue={client?.phone ?? ""} />
      </AdminField>
      <AdminField label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" defaultValue={client?.email ?? ""} />
      </AdminField>
      <AdminField label="Domicilio fiscal" htmlFor="address">
        <Input id="address" name="address" defaultValue={client?.address ?? ""} />
      </AdminField>
      <AdminField label="Servicios contratados" htmlFor="services" hint="Uno por línea." className="sm:col-span-2">
        <Textarea id="services" name="services" rows={4} defaultValue={client?.services.join("\n") ?? ""} />
      </AdminField>
      <AdminField label="Notas" htmlFor="notes" className="sm:col-span-2">
        <Textarea id="notes" name="notes" rows={4} defaultValue={client?.notes ?? ""} />
      </AdminField>
      <FormCheckbox id="active" name="active" label="Cliente activo" defaultChecked={client?.active ?? true} />
      <div className="sm:col-span-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
