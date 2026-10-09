import { MODULES, moduleHref } from "./modules/catalog";
import { can, canSeeRequests, type OrgRole } from "./permissions";

// Navegación del portal según el rol del miembro y los módulos activos de su
// organización. Es solo presentación: cada página vuelve a validar el permiso
// en el servidor.

export type PortalIcon = "inicio" | "vencimientos" | "documentos" | "solicitudes" | "modulo" | "equipo" | "agenda" | "mas";

export interface PortalNavItem {
  href: string;
  label: string;
  icon: PortalIcon;
  exact?: boolean;
}

export function buildPortalNav(role: OrgRole, activeModules: string[]) {
  const main: PortalNavItem[] = [{ href: "/portal", label: "Inicio", icon: "inicio", exact: true }];
  if (can(role, "vencimientos.ver"))
    main.push({
      href: "/portal/vencimientos",
      label: "Vencimientos",
      icon: "vencimientos",
    });
  if (can(role, "documentos.ver"))
    main.push({
      href: "/portal/documentos",
      label: "Documentos",
      icon: "documentos",
    });
  if (canSeeRequests(role))
    main.push({
      href: "/portal/solicitudes",
      label: "Solicitudes",
      icon: "solicitudes",
    });

  const extra: PortalNavItem[] = [];
  for (const m of MODULES) {
    if (!activeModules.includes(m.key) || !can(role, m.permissions.view)) continue;
    for (const item of m.nav)
      extra.push({
        href: moduleHref(m.key, item.path),
        label: item.label,
        icon: "modulo",
      });
  }
  if (can(role, "agenda.reservar")) extra.push({ href: "/portal/agendar", label: "Agendar llamada", icon: "agenda" });
  if (can(role, "equipo.gestionar")) extra.push({ href: "/portal/equipo", label: "Mi equipo", icon: "equipo" });
  return { main, extra };
}
