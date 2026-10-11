import { Blocks, ReceiptText, Wallet } from "lucide-react";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SectionTabs } from "@/components/app/SectionTabs";
import type { PortalUser } from "@/lib/auth";
import { empresaTabs } from "@/lib/portal-nav";

/** Pestañas de Empresa (gastos de la empresa, rendiciones y módulos activos); el empleado no las ve */
export function EmpresaTabs({ me, className = "mb-6" }: { me: PortalUser; className?: string }) {
  if (me.orgRole === "empleado") return null;
  const tabs = empresaTabs(me.orgRole, me.modules);
  const icon = { gastos: <Wallet strokeWidth={1.5} aria-hidden />, rendiciones: <ReceiptText strokeWidth={1.5} aria-hidden /> } as Record<string, React.ReactNode>;
  return <SectionTabs label="Empresa" className={className} tabs={tabs.map((t) => ({ href: t.href, label: t.label, icon: icon[t.icon] ?? <Blocks strokeWidth={1.5} aria-hidden /> }))} />;
}

/** Encabezado de la sección Empresa (con sus pestañas); el empleado ve su pantalla sola */
export function EmpresaHeader({ me }: { me: PortalUser }) {
  if (me.orgRole === "empleado") return null;
  return (
    <>
      <PageHeader title="Empresa" description={`Los gastos, las rendiciones y los módulos de ${me.organizationName}.`} className="mb-4" />
      <EmpresaTabs me={me} />
    </>
  );
}
