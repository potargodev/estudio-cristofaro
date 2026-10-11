import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { orgScope } from "./scope";

/** Comprobantes de una organización (detalle y alta), con la vuelta a su pestaña ARCA */
export default async function ArcaOrgLayout({ params, children }: { params: Promise<{ id: string }>; children: React.ReactNode }) {
  const scope = await orgScope((await params).id);
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={scope.home} className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden /> {scope.organizationName} · ARCA
          </Link>
        }
        title="Facturación"
        description="Comprobantes electrónicos en nombre de la organización, con la delegación del servicio a Faro."
      />
      {children}
    </>
  );
}
