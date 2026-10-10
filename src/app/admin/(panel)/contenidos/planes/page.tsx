import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { savePlanPrice } from "@/app/admin/actions";
import { AdminField, AdminPageHeader, Notice } from "@/components/admin/AdminField";
import { SubmitButton } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { getDb } from "@/db";
import { service_plans } from "@/db/schema";
import { requireOperator } from "@/lib/auth";

export const metadata: Metadata = { title: "Planes" };

/**
 * Precios que publica la web para los tres planes del brief. La estructura de
 * cada plan (límites y prestaciones) sale de src/lib/service-plans.ts.
 */
export default async function PlanesAdminPage({ searchParams }: { searchParams: Promise<{ guardado?: string }> }) {
  const { guardado } = await searchParams;
  const { studioId } = await requireOperator();
  const plans = await getDb()
    .select({ id: service_plans.id, name: service_plans.name, price: service_plans.price_label })
    .from(service_plans)
    .where(and(eq(service_plans.studio_id, studioId), eq(service_plans.active, true)))
    .orderBy(asc(service_plans.position));

  return (
    <div className="max-w-3xl">
      <Link href="/admin/contenidos" className="text-sm text-ink underline underline-offset-4 hover:text-rose-deep">
        Contenidos
      </Link>
      <div className="mt-2">
        <AdminPageHeader title="Planes" />
      </div>
      <p className="mb-6 text-muted">
        Precio que muestran la home y la página de planes. Vacío, la web dice &ldquo;Consultá el precio&rdquo;. Los límites y las prestaciones de cada
        plan son los del brief.
      </p>
      {guardado && <Notice>Cambios guardados.</Notice>}
      <ul className="divide-y divide-line border-y border-line">
        {plans.map((p) => (
          <li key={p.id} className="py-5">
            <form action={savePlanPrice} className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
              <input type="hidden" name="id" value={p.id} />
              <AdminField label={`Precio de ${p.name}`} htmlFor={`pr-${p.id}`} hint='Ej: "desde $450.000/mes"'>
                <Input id={`pr-${p.id}`} name="price_label" maxLength={80} defaultValue={p.price ?? ""} />
              </AdminField>
              <SubmitButton>Guardar</SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
