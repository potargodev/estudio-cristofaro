import { VigiaView } from "@/components/vigia/VigiaView";
import { requireUser } from "@/modules/bitacora/session";
import { vigiaSpace } from "@/lib/spaces";

/** El Vigía del espacio pedido (validado contra la sesión), para el panel lateral */
export default async function VigiaPanelPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const space = await vigiaSpace(me, sp.espacio);
  return <VigiaView user={me} space={space} sp={sp} base="/vigia-panel" />;
}
