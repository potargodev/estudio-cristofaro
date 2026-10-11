import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SueldosScreen } from "@/components/sueldos/views";
import { resolvePayroll } from "@/modules/payroll/scope";

export const metadata = { title: "Sueldos y empleados" };

/** Sueldos de una organización (pestaña Sueldos de la ficha, §2.o): legajo, recibos, comunicados y novedades */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string; path?: string[] }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id, path = [] }, sp] = await Promise.all([params, searchParams]);
  const r = await resolvePayroll("estudio", id);
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/admin/organizaciones/${id}?tab=sueldos`} className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden /> {r.orgName} · Sueldos
          </Link>
        }
        title="Sueldos y empleados"
        description="Legajo, recibos con firma, comunicados internos y novedades de personal, en nombre de la organización."
      />
      <SueldosScreen r={r} path={path} sp={sp} />
    </>
  );
}
