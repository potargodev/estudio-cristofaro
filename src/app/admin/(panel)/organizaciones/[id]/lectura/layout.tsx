import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { resolveScope } from "@/modules/smart-docs/scope";

/** Lectura inteligente de una organización: vive dentro de su pestaña Documentos (§2.o) */
export default async function LecturaLayout({ params, children }: { params: Promise<{ id: string }>; children: React.ReactNode }) {
  const { id } = await params;
  const r = await resolveScope("estudio", id);
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/admin/organizaciones/${id}?tab=documentos`} className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden /> {r.title} · Documentos
          </Link>
        }
        title="Lectura inteligente"
        description="Facturas, tickets y extractos leídos con IA, validados y listos para confirmar y exportar a la planilla, Tango o Xubio."
      />
      {children}
    </>
  );
}
