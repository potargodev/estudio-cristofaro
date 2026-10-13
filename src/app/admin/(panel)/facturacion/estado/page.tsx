import { PageHeader } from "@/components/ds";
import { ArcaStatus } from "@/components/lotes/ArcaStatus";
import { requireStaff } from "@/lib/auth";
import { activeEnv } from "@/modules/arca/credentials";
import { queueOf } from "@/modules/arca/queue";
import { BILLING_TABS } from "../tabs";

export const metadata = { title: "Estado de ARCA" };

export default async function Page() {
  const me = await requireStaff();
  const [env, queue] = await Promise.all([activeEnv(), queueOf(me.studioId)]);
  return (
    <>
      <PageHeader title="Facturación" description="Todas las CUIT de la cartera: emitir, lotes y el estado de ARCA." tabs={BILLING_TABS} />
      <p className="mb-4 max-w-2xl text-body text-muted">Faro consulta a ARCA cada 5 minutos. Si no responde, los comprobantes quedan en cola con su número previsto y se emiten solos, en orden, cuando vuelve; te avisamos de cada uno.</p>
      <ArcaStatus env={env} full queued={queue.length} />
    </>
  );
}
