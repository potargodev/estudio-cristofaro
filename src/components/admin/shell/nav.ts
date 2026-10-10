// Navegación del backoffice: grupos, secciones, badges y acción principal.
// Archivo sin "use client": lo usan el layout (servidor) y el shell (cliente).

export type NavIcon = "resumen" | "organizaciones" | "vencimientos" | "solicitudes" | "consultas" | "agenda" | "contenidos" | "usuarios" | "integraciones";
export type BadgeKey = "requests" | "leads" | "obligations";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  exact?: boolean;
  badge?: BadgeKey;
  adminOnly?: boolean;
}

export const NAV_GROUPS: { title: string; adminOnly?: boolean; items: NavItem[] }[] = [
  { title: "General", items: [{ href: "/admin", label: "Resumen", icon: "resumen", exact: true }] },
  {
    title: "Clientes",
    items: [
      { href: "/admin/organizaciones", label: "Organizaciones", icon: "organizaciones" },
      { href: "/admin/vencimientos", label: "Vencimientos", icon: "vencimientos", badge: "obligations" },
      { href: "/admin/solicitudes", label: "Solicitudes", icon: "solicitudes", badge: "requests" },
    ],
  },
  {
    title: "Comercial",
    items: [
      { href: "/admin/consultas", label: "Consultas", icon: "consultas", badge: "leads" },
      { href: "/admin/agenda", label: "Agenda", icon: "agenda" },
    ],
  },
  { title: "Sitio web", items: [{ href: "/admin/contenidos", label: "Contenidos", icon: "contenidos" }] },
  {
    title: "Configuración",
    adminOnly: true,
    items: [
      { href: "/admin/usuarios", label: "Usuarios", icon: "usuarios", adminOnly: true },
      { href: "/admin/integraciones", label: "Integraciones", icon: "integraciones", adminOnly: true },
    ],
  },
];

export const BADGE_LABEL: Record<BadgeKey, string> = {
  requests: "solicitudes abiertas",
  leads: "consultas nuevas",
  obligations: "vencimientos esta semana",
};

/** Breadcrumb: grupo › sección › subpantalla, a partir de la ruta */
export function crumbs(pathname: string): { label: string; href?: string }[] {
  const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));
  const item = [...all].sort((a, b) => b.href.length - a.href.length).find((i) => (i.exact ? pathname === i.href : pathname.startsWith(i.href)));
  if (pathname === "/admin/cuenta") return [{ label: "Mi cuenta" }];
  if (!item) return [{ label: "Backoffice" }];
  const out: { label: string; href?: string }[] = [{ label: item.group }, { label: item.label, href: item.href }];
  const rest = pathname.slice(item.href.length).split("/").filter(Boolean);
  const SUB: Record<string, string> = { nueva: "Nueva", nuevo: "Nuevo", importar: "Importar", novedades: "Novedades", preguntas: "Preguntas frecuentes", planes: "Planes", tango: "Tango", clientes: "Clientes" };
  for (const seg of rest) out.push({ label: SUB[seg] ?? "Detalle" });
  return out;
}

/** Acción principal de la barra superior según la sección */
export function primaryAction(pathname: string): { href: string; label: string } | null {
  if (pathname === "/admin" || pathname === "/admin/consultas") return { href: "/admin/consultas/nueva", label: "Cargar consulta" };
  if (pathname === "/admin/organizaciones") return { href: "/admin/organizaciones/nueva", label: "Nueva organización" };
  if (pathname === "/admin/vencimientos") return { href: "/admin/vencimientos/importar", label: "Importar vencimientos" };
  if (pathname === "/admin/agenda") return { href: "/admin/agenda?tab=disponibilidad", label: "Mi disponibilidad" };
  if (pathname === "/admin/contenidos" || pathname === "/admin/contenidos/novedades") return { href: "/admin/contenidos/novedades/nueva", label: "Nueva novedad" };
  return null;
}

export const sidebarStorageKey = (id: string) => `admin-sidebar:${id}`;

/** Script previo al pintado: aplica el estado guardado del sidebar sin parpadeo */
export function sidebarBootScript(userId: string) {
  return `try{if(localStorage.getItem(${JSON.stringify(sidebarStorageKey(userId))})==="collapsed")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`;
}
