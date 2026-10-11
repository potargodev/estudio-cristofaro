import { SemaforoView } from "@/components/facturacion/views";
import { suggest } from "@/modules/escudo/server";
import { personalScope } from "../scope";

export const metadata = { title: "Semáforo de monotributo" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { me, scope } = await personalScope();
  const sp = await searchParams;
  // Disparador de derivación (§1.c): usar la simulación de pase a responsable inscripto
  if (sp.compras !== undefined) await suggest(me.id, "simulacion_ri", "Usaste la simulación de pase a responsable inscripto del semáforo.", { compras_12_meses: Number(sp.compras) || 0 });
  return <SemaforoView scope={scope} sp={sp} volver="/facturacion/monotributo" />;
}
