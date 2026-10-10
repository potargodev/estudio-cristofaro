// Menú de cada espacio de Faro (estudio, cuenta personal, portal de una
// organización y Faro Manager), para el mismo AppShell. Archivo sin
// "use client": lo usan el servidor (AppFrame) y el cliente (AppShell).
// Es solo presentación: cada página vuelve a validar el acceso en el servidor.

import { visibleGroups, type NavAccess } from "@/components/admin/shell/nav";
import type { PortalNavItem } from "@/lib/portal-nav";

export type Space = "studio" | "personal" | "portal" | "faro";

export type ShellIcon =
  | "resumen"
  | "organizaciones"
  | "vencimientos"
  | "solicitudes"
  | "consultas"
  | "agenda"
  | "contenidos"
  | "usuarios"
  | "integraciones"
  | "asistente"
  | "aprobaciones"
  | "mcp"
  | "ia"
  | "faro"
  | "gastos"
  | "modulos"
  | "ayuda"
  | "red"
  | "rubros"
  | "copiloto"
  | "bitacora"
  | "mensajes"
  | "flotas"
  | "documentos"
  | "equipo"
  | "rendiciones"
  | "resena"
  | "plan"
  | "cuenta"
  | "tenants"
  | "alta"
  | "pedidos"
  | "plantillas"
  | "auditoria"
  | "opiniones";

export type ShellBadge = "requests" | "leads" | "obligations" | "approvals" | "unread" | "planRequests" | "verifications" | "portalRequests";

export interface ShellItem {
  href: string;
  label: string;
  icon: ShellIcon;
  exact?: boolean;
  badge?: ShellBadge;
  /** No incluido en el plan: lleva a la pantalla del módulo */
  locked?: boolean;
}

export interface ShellGroup {
  title: string;
  items: ShellItem[];
}

export const BADGE_TEXT: Record<ShellBadge, string> = {
  requests: "solicitudes abiertas",
  leads: "consultas nuevas",
  obligations: "vencimientos esta semana",
  approvals: "propuestas para aprobar",
  unread: "mensajes sin leer",
  planRequests: "pedidos de plan",
  verifications: "matrículas y reseñas por revisar",
  portalRequests: "solicitudes abiertas",
};

/** Lo de cada persona, en todos los espacios: su Copiloto, su Bitácora, sus grupos y sus mensajes */
export const PERSONAL_GROUP: ShellGroup = {
  title: "Para vos",
  items: [
    { href: "/copiloto", label: "Copiloto", icon: "copiloto" },
    { href: "/bitacora", label: "Bitácora", icon: "bitacora" },
    { href: "/grupos", label: "Grupos de gastos", icon: "gastos" },
    { href: "/mensajes", label: "Mensajes", icon: "mensajes", badge: "unread" },
  ],
};

const HELP_GROUP: ShellGroup = { title: "Ayuda", items: [{ href: "/ayuda", label: "Centro de ayuda", icon: "ayuda" }] };

const PORTAL_ICON: Record<string, ShellIcon> = {
  inicio: "resumen",
  vencimientos: "vencimientos",
  documentos: "documentos",
  solicitudes: "solicitudes",
  modulo: "modulos",
  equipo: "equipo",
  agenda: "agenda",
  gastos: "gastos",
  rendiciones: "rendiciones",
  ayuda: "ayuda",
  resena: "resena",
  mas: "modulos",
};

export interface SpaceInput {
  space: Space;
  studio?: NavAccess;
  portal?: { main: PortalNavItem[]; extra: PortalNavItem[] };
  faroOwner?: boolean;
  isFaro?: boolean;
}

/** Grupos del menú del espacio */
export function groupsFor(x: SpaceInput): ShellGroup[] {
  if (x.space === "studio" && x.studio) {
    const studio = visibleGroups(x.studio).map((g) => ({
      title: g.title,
      items: g.items
        .filter((i) => i.href !== "/grupos" && i.href !== "/ayuda")
        .map((i) => {
          const locked = !!i.module && !!x.studio!.modules && !x.studio!.modules.includes(i.module);
          return { href: locked ? `/admin/modulos/${i.module}` : i.href, label: i.label, icon: i.icon as ShellIcon, exact: i.exact, badge: locked ? undefined : (i.badge as ShellBadge | undefined), locked };
        }),
    }));
    const general = studio.filter((g) => g.items.length && g.title !== "Ayuda" && g.title !== "Faro");
    return [...general.slice(0, 1), PERSONAL_GROUP, ...general.slice(1), ...(x.isFaro ? [{ title: "Faro", items: [{ href: "/faro-manager", label: "Faro Manager", icon: "faro" as const }] }] : []), HELP_GROUP];
  }
  if (x.space === "personal")
    return [
      {
        title: "Inicio",
        items: [
          { href: "/copiloto", label: "Copiloto", icon: "copiloto" },
          { href: "/personal", label: "Mi panel", icon: "resumen", exact: true },
        ],
      },
      {
        title: "Tus finanzas",
        items: [
          { href: "/bitacora", label: "Bitácora", icon: "bitacora" },
          { href: "/grupos", label: "Grupos de gastos", icon: "gastos" },
          { href: "/flotas", label: "Flotas", icon: "flotas" },
          { href: "/red", label: "Red de estudios", icon: "red" },
        ],
      },
      { title: "Personas", items: [{ href: "/mensajes", label: "Mensajes", icon: "mensajes", badge: "unread" }] },
      {
        title: "Cuenta",
        items: [
          { href: "/personal/plan", label: "Plan y facturación", icon: "plan" },
          { href: "/admin/mcp", label: "Accesos MCP", icon: "mcp" },
          { href: "/personal/cuenta", label: "Mi cuenta", icon: "cuenta" },
        ],
      },
      ...(x.isFaro ? [{ title: "Faro", items: [{ href: "/faro-manager", label: "Faro Manager", icon: "faro" as const }] }] : []),
      HELP_GROUP,
    ];
  if (x.space === "portal" && x.portal) {
    const conv = (i: PortalNavItem): ShellItem => ({ href: i.href, label: i.label, icon: PORTAL_ICON[i.icon] ?? "modulos", exact: i.exact, badge: i.href === "/portal/solicitudes" ? "portalRequests" : undefined });
    return [
      { title: "Tu organización", items: x.portal.main.map(conv) },
      PERSONAL_GROUP,
      { title: "Más", items: x.portal.extra.filter((i) => i.href !== "/ayuda" && i.href !== "/grupos").map(conv) },
      HELP_GROUP,
    ].filter((g) => g.items.length);
  }
  // Faro Manager
  return [
    { title: "General", items: [{ href: "/faro-manager", label: "Resumen", icon: "resumen", exact: true }] },
    {
      title: "Tenants",
      items: [
        { href: "/faro-manager/tenants", label: "Tenants", icon: "tenants" },
        ...(x.faroOwner ? [{ href: "/faro-manager/nuevo", label: "Alta manual", icon: "alta" as const }] : []),
        { href: "/faro-manager/pedidos", label: "Pedidos de plan", icon: "pedidos", badge: "planRequests" },
      ],
    },
    {
      title: "Catálogo",
      items: [
        { href: "/faro-manager/planes", label: "Planes y precios", icon: "plan" },
        { href: "/faro-manager/modulos", label: "Módulos", icon: "modulos" },
        { href: "/faro-manager/plantillas", label: "Plantillas de industria", icon: "plantillas" },
        { href: "/faro-manager/ia", label: "IA de la plataforma", icon: "ia" },
      ],
    },
    { title: "Red", items: [{ href: "/faro-manager/red", label: "Red de estudios", icon: "red", badge: "verifications" }] },
    {
      title: "Plataforma",
      items: [
        { href: "/faro-manager/auditoria", label: "Auditoría", icon: "auditoria" },
        { href: "/faro-manager/ayuda", label: "Opiniones de la ayuda", icon: "opiniones" },
      ],
    },
    PERSONAL_GROUP,
    { title: "Volver", items: [{ href: "/admin", label: "Mi espacio", icon: "faro" }] },
    HELP_GROUP,
  ];
}

/** Barra inferior del celular (4 accesos + "Más") */
export function bottomFor(x: SpaceInput, groups: ShellGroup[]): ShellItem[] {
  const all = groups.flatMap((g) => g.items);
  const pick = (...hrefs: string[]) => hrefs.map((h) => all.find((i) => i.href === h)).filter((i): i is ShellItem => !!i);
  if (x.space === "studio") return pick("/admin", "/admin/organizaciones", "/admin/vencimientos", "/copiloto").slice(0, 4);
  if (x.space === "personal") return pick("/copiloto", "/bitacora", "/grupos", "/mensajes");
  if (x.space === "portal") return [...(x.portal?.main.slice(0, 2) ?? []).map((i) => all.find((a) => a.href === i.href)!).filter(Boolean), ...pick("/copiloto", "/mensajes")].slice(0, 4);
  return pick("/faro-manager", "/faro-manager/tenants", "/faro-manager/pedidos", "/faro-manager/red");
}

/** Ítem activo: el de href más largo que coincide */
export function activeItem(groups: ShellGroup[], pathname: string) {
  const all = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));
  return [...all].sort((a, b) => b.href.length - a.href.length).find((i) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`))) ?? null;
}
