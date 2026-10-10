import { and, asc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteLead, updateLead } from "@/app/admin/actions";
import { convertLeadToOrganization } from "@/app/admin/organization-actions";
import { AdminField, Notice } from "@/components/admin/AdminField";
import { SubmitButton, FormSelect } from "@/components/admin/ui";
import { getDb } from "@/db";
import { bookings, leads, users } from "@/db/schema";
import { CallsList } from "@/components/admin/CallsList";
import { requireOperator } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { site } from "@/lib/site";
import { CONTRIBUTOR_TYPES, LEAD_SOURCES, LEAD_STATUSES } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminButton } from "@/components/admin/styles";

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
  const { studioId } = await requireOperator();
  if (!isUuid(id)) notFound();
  const db = getDb();

  const [[lead], staff] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.studio_id, studioId))),
    db
      .select({ id: users.id, name: users.name, active: users.active })
      .from(users)
      .where(and(eq(users.studioId, studioId), inArray(users.role, ["admin", "contador", "colaborador"])))
      .orderBy(asc(users.name)),
  ]);
  if (!lead) notFound();

  const created = new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short" }).format(new Date(lead.created_at));

  return (
    <div className="max-w-5xl">
      <Link href="/admin/consultas" className="text-sm text-ink underline underline-offset-4 hover:text-rose-deep">
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
              className={adminButton.secondary}
            >
              Responder por WhatsApp
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}?subject=${encodeURIComponent(`Tu consulta en ${site.name}`)}`}
              className={adminButton.secondary}
            >
              Responder por mail
            </a>
          )}
          {lead.organization_id ? (
            <Link href={`/admin/organizaciones/${lead.organization_id}`} className={adminButton.primary}>
              Ver organización
            </Link>
          ) : (
            <form action={convertLeadToOrganization}>
              <input type="hidden" name="id" value={lead.id} />
              <SubmitButton pendingText="Creando…">Convertir en cliente</SubmitButton>
            </form>
          )}
        </div>
      </div>

      {guardado && (
        <Notice>Cambios guardados.</Notice>
      )}
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error.length > 20 ? error : "No se pudo convertir en cliente. Revisá que el CUIT no esté repetido."}</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <section className="border border-line bg-surface p-6">
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
                      <li key={n} className="rounded-md bg-navy-soft px-2.5 py-0.5 text-sm text-navy-deep">
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

        <form action={updateLead} className="grid gap-4 border border-line bg-surface p-6 sm:grid-cols-2">
          <input type="hidden" name="id" value={lead.id} />
          <h2 className="font-semibold sm:col-span-2">Seguimiento</h2>
          <AdminField label="Estado" htmlFor="status">
            <FormSelect id="status" name="status" defaultValue={lead.status} options={LEAD_STATUSES} />
          </AdminField>
          <AdminField label="Responsable" htmlFor="assigned_to">
            <FormSelect
              id="assigned_to"
              name="assigned_to"
              defaultValue={lead.assigned_to ?? ""}
              options={[
                { value: "", label: "Sin asignar" },
                ...staff.map((p) => ({ value: p.id, label: `${p.name || "Sin nombre"}${p.active ? "" : " (desactivado)"}` })),
              ]}
            />
          </AdminField>
          <AdminField label="Próxima acción" htmlFor="next_action">
            <Input id="next_action" name="next_action" defaultValue={lead.next_action ?? ""} placeholder="Ej: enviar presupuesto" />
          </AdminField>
          <AdminField label="Fecha" htmlFor="next_action_at">
            <Input id="next_action_at" name="next_action_at" type="date" defaultValue={lead.next_action_at ?? ""} />
          </AdminField>
          <AdminField label="Nombre" htmlFor="name">
            <Input id="name" name="name" defaultValue={lead.name} />
          </AdminField>
          <AdminField label="Empresa" htmlFor="company">
            <Input id="company" name="company" defaultValue={lead.company ?? ""} />
          </AdminField>
          <AdminField label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={lead.email ?? ""} />
          </AdminField>
          <AdminField label="Teléfono" htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={lead.phone ?? ""} />
          </AdminField>
          <AdminField label="Notas internas" htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" name="notes" rows={5} defaultValue={lead.notes ?? ""} />
          </AdminField>
          <AdminField label="Motivo si se perdió" htmlFor="lost_reason" className="sm:col-span-2">
            <Input id="lost_reason" name="lost_reason" defaultValue={lead.lost_reason ?? ""} placeholder="Ej: precio, eligió otro estudio" />
          </AdminField>
          <div className="sm:col-span-2">
            <SubmitButton>Guardar cambios</SubmitButton>
          </div>
        </form>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-[18px] font-medium">Llamadas agendadas</h2>
        <CallsList studioId={studioId} where={eq(bookings.lead_id, lead.id)} empty="No agendó llamadas." />
      </section>

      <form action={deleteLead} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={lead.id} />
        <SubmitButton variant="danger" pendingText="Eliminando…" confirm="¿Eliminar esta consulta? No se puede deshacer.">
          Eliminar consulta
        </SubmitButton>
      </form>
    </div>
  );
}
