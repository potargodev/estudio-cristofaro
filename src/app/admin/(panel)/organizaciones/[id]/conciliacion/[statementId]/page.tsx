import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { StatementView } from "@/components/conciliacion/views";
import { requireOperator } from "@/lib/auth";
import { studioOrganization } from "@/lib/organizations";

export const metadata = { title: "Conciliación" };

/** Un extracto conciliado: resumen, movimientos con sugerencias y reglas */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string; statementId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id, statementId }, sp] = await Promise.all([params, searchParams]);
  const me = await requireOperator();
  const org = await studioOrganization(id, me.studioId);
  if (!org) notFound();
  const view = await StatementView({ me, orgId: org.id, id: statementId, sp });
  if (!view) notFound();
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/admin/organizaciones/${org.id}?tab=conciliacion`} className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden /> {org.name} · Conciliación
          </Link>
        }
        title="Conciliación bancaria"
      />
      {view}
    </>
  );
}
