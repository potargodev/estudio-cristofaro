// Menú de cada espacio de Faro (estudio, cuenta personal, portal de una
// organización y Faro Manager), para el mismo AppShell. Archivo sin
// "use client": lo usan el servidor (AppFrame) y el cliente (AppShell).
// Es solo presentación: cada página vuelve a validar el acceso en el servidor.
//
// Regla (docs/faro-producto.md §2.o): un espacio a la vez, 7 ítems o menos en
// no más de 3 grupos. Lo demás va como pestaña, en Configuración o en el menú
// de la cuenta.

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
  | "opiniones"
  | "pasos"
  | "contador"
  | "comercial"
  | "configuracion"
  | "empresa"
  | "catalogo"
  | "plataforma"
  | "facturacion";

export type ShellBadge = "requests" | "leads" | "obligations" | "approvals" | "unread" | "copilot" | "reports" | "planRequests" | "verifications" | "portalRequests";

export interface ShellItem {
  href: string;
  label: string;
  icon: ShellIcon;
  exact?: boolean;
  badge?: ShellBadge;
  /** No incluido en el plan: lleva a la pantalla del módulo */
  locked?: boolean;
  /** Otras rutas que también marcan el ítem como activo (sus pestañas) */
  match?: string[];
}

export interface ShellGroup {
  /** Sin título: el grupo va sin encabezado */
  title: string;
  items: ShellItem[];
  /** Fijo abajo de la barra lateral (Configuración) */
  pinned?: boolean;
}

export const BADGE_TEXT: Record<ShellBadge, string> = {
  requests: "solicitudes abiertas",
  leads: "consultas nuevas",
  obligations: "vencimientos esta semana",
  approvals: "propuestas para aprobar",
  unread: "mensajes sin leer",
  copilot: "respuestas nuevas del Vigía",
  reports: "reportes por revisar",
  planRequests: "pedidos de plan",
  verifications: "matrículas y reseñas por revisar",
  portalRequests: "solicitudes abiertas",
};

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
  empresa: "empresa",
};

export interface SpaceInput {
  space: Space;
  studio?: NavAccess;
  portal?: { main: PortalNavItem[]; empresa: PortalNavItem[] };
  /** Espacio personal: titular de una cuenta personal (persona o autónomo) */
  personal?: { titular: boolean; autonomo: boolean };
  faroOwner?: boolean;
  isFaro?: boolean;
}

/** Facturación del autónomo (F3): el lugar queda reservado en el menú personal */
const FACTURACION_LISTA = false;

/** Grupos del menú del espacio */
export function groupsFor(x: SpaceInput): ShellGroup[] {
  if (x.space === "studio" && x.studio) {
    // Operación · Negocio · Configuración (fija abajo)
    return visibleGroups(x.studio).map((g) => ({
      title: g.title,
      pinned: g.pinned,
      items: g.items.map((i) => {
        const locked = !!i.module && !!x.studio!.modules && !x.studio!.modules.includes(i.module);
        const badge = i.badge === "leads" && !x.studio!.isOperator ? undefined : (i.badge as ShellBadge | undefined);
        return { href: locked ? `/admin/configuracion/modulos/${i.module}` : i.href, label: i.label, icon: i.icon as ShellIcon, exact: i.exact, badge: locked ? undefined : badge, locked };
      }),
    }));
  }
  if (x.space === "personal") {
    const items: ShellItem[] = [
      { href: "/personal", label: "Inicio", icon: "resumen", exact: true },
      { href: "/bitacora", label: "Bitácora", icon: "bitacora" },
      { href: "/grupos", label: "Grupos", icon: "gastos" },
    ];
    // Contador: Red de estudios, Flotas y "mi estudio" (solo cuentas personales)
    if (x.personal?.titular) items.push({ href: "/red", label: "Contador", icon: "contador", match: ["/flotas", "/contador"] });
    if (x.personal?.autonomo && FACTURACION_LISTA) items.push({ href: "/facturacion", label: "Facturación", icon: "facturacion" });
    return [{ title: "", items }];
  }
  if (x.space === "portal" && x.portal) {
    const conv = (i: PortalNavItem): ShellItem => ({ href: i.href, label: i.label, icon: PORTAL_ICON[i.icon] ?? "modulos", exact: i.exact, match: i.match, badge: i.href === "/portal/solicitudes" ? "portalRequests" : undefined });
    return [{ title: "", items: x.portal.main.map(conv) }].filter((g) => g.items.length);
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
        { href: "/faro-manager/reportes", label: "Mensajes reportados", icon: "mensajes", badge: "reports" },
      ],
    },
  ];
}

/** Barra inferior del celular (4 accesos + "Más") */
export function bottomFor(x: SpaceInput, groups: ShellGroup[]): ShellItem[] {
  const all = groups.flatMap((g) => g.items);
  const pick = (...hrefs: string[]) => hrefs.map((h) => all.find((i) => i.href === h)).filter((i): i is ShellItem => !!i);
  if (x.space === "studio") return pick("/admin", "/admin/organizaciones", "/admin/vencimientos", "/admin/solicitudes").slice(0, 4);
  if (x.space === "personal") return pick("/personal", "/bitacora", "/grupos", "/red");
  if (x.space === "portal") return all.slice(0, 4);
  return pick("/faro-manager", "/faro-manager/tenants", "/faro-manager/pedidos", "/faro-manager/red");
}

const hit = (pathname: string, href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

/** Ítem activo: el de ruta más larga que coincide (con sus pestañas) */
export function activeItem(groups: ShellGroup[], pathname: string) {
  let best: (ShellItem & { group: string }) | null = null;
  let len = -1;
  for (const g of groups)
    for (const i of g.items)
      for (const [href, exact] of [[i.href, i.exact] as const, ...(i.match ?? []).map((m) => [m, false] as const)])
        if (hit(pathname, href, exact) && href.length > len) {
          best = { ...i, group: g.title };
          len = href.length;
        }
  return best;
}
