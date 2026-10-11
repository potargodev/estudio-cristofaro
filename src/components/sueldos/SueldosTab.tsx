import { SueldosScreen } from "@/components/sueldos/views";
import { resolvePayroll } from "@/modules/payroll/scope";

/** Pestaña Sueldos de la ficha: el legajo (las otras vistas viven en /sueldos/…) */
export async function SueldosTab({ orgId, sp }: { orgId: string; sp: Record<string, string | undefined> }) {
  const r = await resolvePayroll("estudio", orgId);
  return <SueldosScreen r={r} path={[]} sp={sp} />;
}
