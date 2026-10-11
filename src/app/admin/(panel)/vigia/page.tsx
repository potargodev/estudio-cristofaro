import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { VigiaView } from "@/components/vigia/VigiaView";
import { requireTenant } from "@/lib/auth";
import { availableSpaces } from "@/lib/spaces";

export const metadata: Metadata = { title: "Vigía" };

/** Vigía del estudio a pantalla completa: Asistente y Propuestas para aprobar (en la cuenta personal, su Vigía con su clave) */
export default async function AdminVigiaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireTenant();
  const space = availableSpaces(me).has("studio") ? "studio" : "personal";
  return (
    <>
      <PageHeader title="Vigía" description={space === "studio" ? "El asistente del estudio: consulta y propone; lo sensible pasa por tu aprobación." : "Tu Vigía, tu asistente con tu clave y tus propuestas para aprobar."} className="mb-4" />
      <VigiaView user={me} space={space} sp={sp} base="/admin/vigia" />
    </>
  );
}
