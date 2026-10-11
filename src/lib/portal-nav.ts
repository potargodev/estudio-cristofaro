import { MODULES, moduleHref } from "./modules/catalog";
import { can, canSeeRequests, type OrgRole } from "./permissions";

// Navegación del portal según el rol del miembro y los módulos activos de su
// organización (docs/faro-producto.md §2.o). Organización: Inicio ·
// Vencimientos · Documentos · Solicitudes · Empresa. Empleado: Inicio ·
// Rendiciones · Grupos. Es solo presentación: cada página vuelve a validar
// el permiso en el servidor.

export type PortalIcon = "inicio" | "vencimientos" | "documentos" | "solicitudes" | "modulo" | "equipo" | "agenda" | "mas" | "gastos" | "rendiciones" | "ayuda" | "resena" | "empresa";

export interface PortalNavItem {
  href: string;
  label: string;
  icon: PortalIcon;
  exact?: boolean;
  /** Otras rutas que también lo marcan activo (las pestañas de Empresa) */
  match?: string[];
}

/** Pestañas de Empresa: gastos de la empresa, rendiciones y los módulos activos */
export function empresaTabs(role: OrgRole, activeModules: string[]): PortalNavItem[] {
  const tabs: PortalNavItem[] = [];
  if (can(role, "finanzas.ver")) tabs.push({ href: "/portal/gastos-empresa", label: "Gastos de la empresa", icon: "gastos" });
  if (can(role, "finanzas.ver")) tabs.push({ href: "/portal/estado-de-cuenta", label: "Estado de cuenta", icon: "gastos" });
  if (can(role, "gastos.rendir") || can(role, "finanzas.gestionar")) tabs.push({ href: "/portal/rendiciones", label: "Rendiciones", icon: "rendiciones" });
  for (const m of MODULES) {
    if (!activeModules.includes(m.key) || !can(role, m.permissions.view)) continue;
    for (const item of m.nav) tabs.push({ href: moduleHref(m.key, item.path), label: item.label, icon: "modulo" });
  }
  return tabs;
}

export function buildPortalNav(role: OrgRole, activeModules: string[]) {
  // El empleado tiene su propio inicio (/portal/empleado): sus rendiciones y sus grupos de gastos
  if (role === "empleado")
    return {
      main: [
        { href: "/portal/empleado", label: "Inicio", icon: "inicio", exact: true },
        { href: "/portal/rendiciones", label: "Rendiciones", icon: "rendiciones" },
        // F5: { href: "/portal/recibos", label: "Mis recibos", icon: "documentos" },
        { href: "/grupos", label: "Grupos", icon: "gastos" },
      ] satisfies PortalNavItem[],
      empresa: [] as PortalNavItem[],
    };
  const main: PortalNavItem[] = can(role, "inicio.ver") ? [{ href: "/portal", label: "Inicio", icon: "inicio", exact: true }] : [];
  if (can(role, "vencimientos.ver")) main.push({ href: "/portal/vencimientos", label: "Vencimientos", icon: "vencimientos" });
  if (can(role, "documentos.ver")) main.push({ href: "/portal/documentos", label: "Documentos", icon: "documentos" });
  if (canSeeRequests(role)) main.push({ href: "/portal/solicitudes", label: "Solicitudes", icon: "solicitudes" });
  const empresa = empresaTabs(role, activeModules);
  if (empresa.length) main.push({ href: "/portal/empresa", label: "Empresa", icon: "empresa", match: [...empresa.map((t) => t.href.split("?")[0]), "/portal/modulos", "/portal/empresa"] });
  return { main, empresa };
}
