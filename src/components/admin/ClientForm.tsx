import { AdminField } from "./AdminField";
import { SubmitButton, adminInput } from "./ui";
import { REGIMES, type Client } from "@/lib/types";

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
        <input id="business_name" name="business_name" required defaultValue={client?.business_name} className={adminInput} />
      </AdminField>
      <AdminField label="CUIT" htmlFor="cuit" hint="Solo números o con guiones.">
        <input id="cuit" name="cuit" inputMode="numeric" defaultValue={client?.cuit ?? ""} className={adminInput} />
      </AdminField>
      <AdminField label="Régimen" htmlFor="regime">
        <select id="regime" name="regime" defaultValue={client?.regime ?? "monotributo"} className={adminInput}>
          {Object.entries(REGIMES).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </AdminField>
      <AdminField label="Categoría o tipo" htmlFor="category" hint="Ej: categoría D, SAS, SRL.">
        <input id="category" name="category" defaultValue={client?.category ?? ""} className={adminInput} />
      </AdminField>
      <AdminField label="Abono mensual ($)" htmlFor="monthly_fee">
        <input
          id="monthly_fee"
          name="monthly_fee"
          inputMode="decimal"
          defaultValue={client?.monthly_fee != null ? String(client.monthly_fee) : ""}
          className={adminInput}
        />
      </AdminField>
      <AdminField label="Contacto" htmlFor="contact_name">
        <input id="contact_name" name="contact_name" defaultValue={client?.contact_name ?? ""} className={adminInput} />
      </AdminField>
      <AdminField label="Teléfono" htmlFor="phone">
        <input id="phone" name="phone" defaultValue={client?.phone ?? ""} className={adminInput} />
      </AdminField>
      <AdminField label="Email" htmlFor="email">
        <input id="email" name="email" type="email" defaultValue={client?.email ?? ""} className={adminInput} />
      </AdminField>
      <AdminField label="Domicilio fiscal" htmlFor="address">
        <input id="address" name="address" defaultValue={client?.address ?? ""} className={adminInput} />
      </AdminField>
      <AdminField label="Servicios contratados" htmlFor="services" hint="Uno por línea." className="sm:col-span-2">
        <textarea id="services" name="services" rows={4} defaultValue={client?.services.join("\n") ?? ""} className={adminInput} />
      </AdminField>
      <AdminField label="Notas" htmlFor="notes" className="sm:col-span-2">
        <textarea id="notes" name="notes" rows={4} defaultValue={client?.notes ?? ""} className={adminInput} />
      </AdminField>
      <label className="flex items-center gap-2 text-[15px] sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked={client?.active ?? true} className="size-4 accent-[var(--color-green)]" />
        Cliente activo
      </label>
      <div className="sm:col-span-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
