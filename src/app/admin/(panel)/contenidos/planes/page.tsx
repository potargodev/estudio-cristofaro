import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { deletePlan, savePlan } from "@/app/admin/actions";
import { AdminField, AdminPageHeader, Notice } from "@/components/admin/AdminField";
import { SubmitButton, FormCheckbox, FormSelect } from "@/components/admin/ui";
import { getDb } from "@/db";
import { plans as plansTable } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { segments } from "@/lib/content";
import type { Plan } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const metadata: Metadata = { title: "Planes" };

function PlanFields({ plan }: { plan?: Plan }) {
  const k = plan?.id ?? "nuevo";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <AdminField label="Nombre" htmlFor={`n-${k}`}>
        <Input id={`n-${k}`} name="name" required defaultValue={plan?.name} />
      </AdminField>
      <AdminField label="Precio" htmlFor={`pr-${k}`} hint='Ej: "Desde $45.000 / mes". Vacío muestra "Precio a medida".'>
        <Input id={`pr-${k}`} name="price_label" defaultValue={plan?.price_label ?? ""} />
      </AdminField>
      <AdminField label="Segmento" htmlFor={`s-${k}`} hint="Define en qué landing aparece.">
        <FormSelect
          id={`s-${k}`}
          name="segment"
          defaultValue={plan?.segment ?? ""}
          options={[{ value: "", label: "Solo en la página de planes" }, ...segments.map((s) => ({ value: s.slug, label: s.name }))]}
        />
      </AdminField>
      <AdminField label="Orden" htmlFor={`o-${k}`}>
        <Input id={`o-${k}`} name="position" type="number" defaultValue={plan?.position ?? 0} />
      </AdminField>
      <AdminField label="Descripción" htmlFor={`d-${k}`} className="sm:col-span-2">
        <Textarea id={`d-${k}`} name="description" rows={2} defaultValue={plan?.description ?? ""} />
      </AdminField>
      <AdminField label="Qué incluye" htmlFor={`f-${k}`} hint="Un ítem por línea." className="sm:col-span-2">
        <Textarea id={`f-${k}`} name="features" rows={5} defaultValue={plan?.features.join("\n") ?? ""} />
      </AdminField>
      <div className="flex flex-wrap gap-5 sm:col-span-2">
        <FormCheckbox id={`highlighted-${k}`} name="highlighted" label="Destacado" defaultChecked={plan?.highlighted ?? false} />
        <FormCheckbox id={`published-${k}`} name="published" label="Publicado" defaultChecked={plan?.published ?? true} />
      </div>
    </div>
  );
}

export default async function PlanesAdminPage({ searchParams }: { searchParams: Promise<{ guardado?: string; error?: string }> }) {
  const { guardado, error } = await searchParams;
  const { studioId } = await requireStaff();
  const plans: Plan[] = await getDb()
    .select()
    .from(plansTable)
    .where(eq(plansTable.studio_id, studioId))
    .orderBy(asc(plansTable.position));

  return (
    <div className="max-w-3xl">
      <Link href="/admin/contenidos" className="text-sm text-rose-deep underline-offset-4 hover:underline">
        Contenidos
      </Link>
      <div className="mt-2">
        <AdminPageHeader title="Planes" />
      </div>
      {guardado && (
        <Notice>Cambios guardados.</Notice>
      )}
      {error && (
        <div className="mb-4">
          <Notice tone="error">El nombre del plan es obligatorio.</Notice>
        </div>
      )}

      <div className="space-y-4">
        {plans.map((p) => (
          <details key={p.id} className="group rounded-md border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
              <span>
                <span className="font-semibold">{p.name}</span>
                <span className="ml-2 text-sm text-muted">{p.price_label || "Precio a medida"}</span>
              </span>
              <span className="text-sm text-rose-deep group-open:hidden">Editar</span>
            </summary>
            <div className="border-t border-line p-5">
              <form action={savePlan} className="grid gap-4">
                <PlanFields plan={p} />
                <div>
                  <SubmitButton>Guardar</SubmitButton>
                </div>
              </form>
              <form action={deletePlan} className="mt-3">
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton variant="danger" pendingText="Eliminando…" confirm="¿Eliminar este plan?">
                  Eliminar plan
                </SubmitButton>
              </form>
            </div>
          </details>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-lg font-semibold">Agregar plan</h2>
      <form action={savePlan} className="grid gap-4 rounded-md border border-dashed border-line p-5">
        <PlanFields />
        <div>
          <SubmitButton>Agregar plan</SubmitButton>
        </div>
      </form>
    </div>
  );
}
