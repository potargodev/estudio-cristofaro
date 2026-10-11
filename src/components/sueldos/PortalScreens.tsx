import type { ModuleScreenProps } from "@/components/portal/modules/registry";
import { SueldosScreen } from "@/components/sueldos/views";
import { resolvePayroll } from "@/modules/payroll/scope";

/** Portal → Empresa → Sueldos y empleados (módulo «sueldos» de la organización) */
export async function SueldosPortal({ path, sp }: ModuleScreenProps) {
  const r = await resolvePayroll("portal");
  return <SueldosScreen r={r} path={path} sp={sp ?? {}} />;
}
