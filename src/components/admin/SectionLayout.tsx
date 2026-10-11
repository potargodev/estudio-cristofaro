import { Blocks, CalendarDays, Factory, Globe, Network, Plug, ShieldCheck, Sparkles, UserRound, Users, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { itemEnabled, visibleTabs, type NavAccess, type NavIcon, type NavItem } from "@/components/admin/shell/nav";

const ICON: Partial<Record<NavIcon, LucideIcon>> = {
  consultas: UserRound,
  agenda: CalendarDays,
  red: Network,
  usuarios: Users,
  modulos: Blocks,
  integraciones: Plug,
  ia: Sparkles,
  rubros: Factory,
  contenidos: Globe,
  seguridad: ShieldCheck,
};

/**
 * Sección con pestañas (Comercial, Configuración): un solo encabezado con las
 * pestañas que ve cada rol; cada pestaña es una subruta. Lo que no está en el
 * plan lleva a la pantalla del módulo.
 */
export function SectionLayout({ title, description, tabs, access, counts, children }: { title: string; description: string; tabs: NavItem[]; access: NavAccess; counts?: Partial<Record<string, number>>; children: React.ReactNode }) {
  const list = visibleTabs(tabs, access);
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        tabs={list.map((t) => ({
          href: itemEnabled(t, access) ? t.href : `/admin/configuracion/modulos/${t.module}`,
          label: t.label,
          icon: ICON[t.icon],
          match: t.match,
          count: t.badge ? counts?.[t.badge] : undefined,
        }))}
      />
      {children}
    </>
  );
}
