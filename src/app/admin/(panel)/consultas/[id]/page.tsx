import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { convertLeadToClient, deleteLead, updateLead } from "@/app/admin/actions";
import { AdminField, Notice } from "@/components/admin/AdminField";
import { SubmitButton, adminInput } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth";
import { site } from "@/lib/site";
import { CONTRIBUTOR_TYPES, LEAD_SOURCES, LEAD_STATUSES, type Lead, type Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Consulta" };

function waLink(phone: string, name: string) {
  let digits = phone.replace(/[^0-9]/g, "");
  if (!digits.startsWith("54")) digits = `54${digits.replace(/^0/, "")}`;
  const text = `Hola ${name.split(" ")[0]}, te escribo de ${site.name} por la consulta que nos dejaste.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export default async function ConsultaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardado?: string; error?: string }>;
}) {
  const { id } = await params;
  const { guardado, error } = await searchParams;
  const { supabase } = await requireStaff();

  const [{ data }, { data: team }] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).maybeSingle(),
    supabase.from("profiles").select("id, full_name, role").in("role", ["admin", "contador"]),
  ]);
  if (!data) notFound();
  const lead = data as Lead;
  const staff = (team ?? []) as Pick<Profile, "id" | "full_name" | "role">[];

  const created = new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short" }).format(new Date(lead.created_at));

  return (
    <div className="max-w-5xl">
      <Link href="/admin/consultas" className="text-sm text-green underline-offset-4 hover:underline">
        Consultas
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{lead.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {LEAD_SOURCES[lead.source]} · {created}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lead.phone && (
            <a
              href={waLink(lead.phone, lead.name)}
              target="_blank"
              rel="noopener"
              className="rounded-md border border-line bg-surface px-4 py-2 text-[15px] font-medium hover:border-green"
            >
              Responder por WhatsApp
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}?subject=${encodeURIComponent(`Tu consulta en ${site.name}`)}`}
              className="rounded-md border border-line bg-surface px-4 py-2 text-[15px] font-medium hover:border-green"
            >
              Responder por mail
            </a>
          )}
          {lead.client_id ? (
            <Link
              href={`/admin/clientes/${lead.client_id}`}
              className="rounded-md bg-green px-4 py-2 text-[15px] font-medium text-paper hover:bg-green-deep"
            >
              Ver cliente
            </Link>
          ) : (
            <form action={convertLeadToClient}>
              <input type="hidden" name="id" value={lead.id} />
              <SubmitButton pendingText="Creando…">Convertir en cliente</SubmitButton>
            </form>
          )}
        </div>
      </div>

      {guardado && (
        <div className="mb-4">
          <Notice>Cambios guardados.</Notice>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Notice tone="error">No se pudo convertir en cliente. Revisá que el CUIT no esté repetido.</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <section className="rounded-md border border-line bg-surface p-6">
          <h2 className="font-semibold">Lo que nos contó</h2>
          <dl className="mt-4 space-y-3 text-[15px]">
            {[
              ["Tipo", lead.contributor_type ? CONTRIBUTOR_TYPES[lead.contributor_type] ?? lead.contributor_type : null],
              ["Actividad", lead.activity],
              ["Empleados", lead.employees],
            ].map(([k, v]) =>
              v ? (
                <div key={k}>
                  <dt className="text-sm text-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ) : null,
            )}
            {lead.needs.length > 0 && (
              <div>
                <dt className="text-sm text-muted">Necesita</dt>
                <dd>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {lead.needs.map((n) => (
                      <li key={n} className="rounded-full bg-green-soft px-2.5 py-0.5 text-sm text-green-deep">
                        {n}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {lead.message && (
              <div>
                <dt className="text-sm text-muted">Mensaje</dt>
                <dd className="whitespace-pre-line leading-relaxed">{lead.message}</dd>
              </div>
            )}
          </dl>
        </section>

        <form action={updateLead} className="grid gap-4 rounded-md border border-line bg-surface p-6 sm:grid-cols-2">
          <input type="hidden" name="id" value={lead.id} />
          <h2 className="font-semibold sm:col-span-2">Seguimiento</h2>
          <AdminField label="Estado" htmlFor="status">
            <select id="status" name="status" defaultValue={lead.status} className={adminInput}>
              {LEAD_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Responsable" htmlFor="assigned_to">
            <select id="assigned_to" name="assigned_to" defaultValue={lead.assigned_to ?? ""} className={adminInput}>
              <option value="">Sin asignar</option>
              {staff.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? "Sin nombre"}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Próxima acción" htmlFor="next_action">
            <input id="next_action" name="next_action" defaultValue={lead.next_action ?? ""} placeholder="Ej: enviar presupuesto" className={adminInput} />
          </AdminField>
          <AdminField label="Fecha" htmlFor="next_action_at">
            <input id="next_action_at" name="next_action_at" type="date" defaultValue={lead.next_action_at ?? ""} className={adminInput} />
          </AdminField>
          <AdminField label="Nombre" htmlFor="name">
            <input id="name" name="name" defaultValue={lead.name} className={adminInput} />
          </AdminField>
          <AdminField label="Empresa" htmlFor="company">
            <input id="company" name="company" defaultValue={lead.company ?? ""} className={adminInput} />
          </AdminField>
          <AdminField label="Email" htmlFor="email">
            <input id="email" name="email" type="email" defaultValue={lead.email ?? ""} className={adminInput} />
          </AdminField>
          <AdminField label="Teléfono" htmlFor="phone">
            <input id="phone" name="phone" defaultValue={lead.phone ?? ""} className={adminInput} />
          </AdminField>
          <AdminField label="Notas internas" htmlFor="notes" className="sm:col-span-2">
            <textarea id="notes" name="notes" rows={5} defaultValue={lead.notes ?? ""} className={adminInput} />
          </AdminField>
          <AdminField label="Motivo si se perdió" htmlFor="lost_reason" className="sm:col-span-2">
            <input id="lost_reason" name="lost_reason" defaultValue={lead.lost_reason ?? ""} placeholder="Ej: precio, eligió otro estudio" className={adminInput} />
          </AdminField>
          <div className="sm:col-span-2">
            <SubmitButton>Guardar cambios</SubmitButton>
          </div>
        </form>
      </div>

      <form action={deleteLead} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={lead.id} />
        <SubmitButton variant="danger" pendingText="Eliminando…" confirm="¿Eliminar esta consulta? No se puede deshacer.">
          Eliminar consulta
        </SubmitButton>
      </form>
    </div>
  );
}
