import { MODULES, moduleHref } from "./modules/catalog";
import { can, canSeeRequests, type OrgRole } from "./permissions";

// Navegación del portal según el rol del miembro y los módulos activos de su
// organización. Es solo presentación: cada página vuelve a validar el permiso
// en el servidor.

export type PortalIcon = "inicio" | "vencimientos" | "documentos" | "solicitudes" | "modulo" | "equipo" | "agenda" | "mas" | "gastos" | "rendiciones";

export interface PortalNavItem {
  href: string;
  label: string;
  icon: PortalIcon;
  exact?: boolean;
}

export function buildPortalNav(role: OrgRole, activeModules: string[]) {
  // El empleado tiene su propio inicio (/portal/empleado): grupos de gastos y sus rendiciones
  const main: PortalNavItem[] = can(role, "inicio.ver")
    ? [{ href: "/portal", label: "Inicio", icon: "inicio", exact: true }]
    : role === "empleado"
      ? [{ href: "/portal/empleado", label: "Inicio", icon: "inicio", exact: true }]
      : [];
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
  const rendiciones: PortalNavItem = { href: "/portal/rendiciones", label: "Rendiciones", icon: "rendiciones" };
  if (role === "empleado") main.push(rendiciones, { href: "/grupos", label: "Grupos de gastos", icon: "gastos" });
  else if (can(role, "gastos.rendir") || can(role, "finanzas.gestionar")) extra.push(rendiciones);
  if (can(role, "finanzas.ver")) extra.push({ href: "/portal/gastos-empresa", label: "Gastos de la empresa", icon: "gastos" });
  if (role !== "empleado") extra.push({ href: "/grupos", label: "Grupos de gastos", icon: "gastos" });
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
