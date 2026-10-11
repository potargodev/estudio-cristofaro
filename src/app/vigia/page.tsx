import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VigiaView } from "@/components/vigia/VigiaView";
import { vigiaSpace } from "@/lib/spaces";
import { requireUser } from "@/modules/bitacora/session";

export const metadata: Metadata = { title: { absolute: "Vigía · Faro" } };

/** Vigía a pantalla completa: el del espacio en el que estás (o el pedido, si la sesión puede entrar) */
export default async function VigiaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const space = await vigiaSpace(me, sp.espacio);
  // El del estudio vive dentro del marco del estudio
  if (space === "studio") redirect(`/admin/vigia${sp.tab ? `?tab=${encodeURIComponent(sp.tab)}` : ""}`);
  return (
    <>
      <VigiaView user={me} space={space} sp={sp} base="/vigia" />
    </>
  );
}
