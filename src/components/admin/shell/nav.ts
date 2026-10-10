// Navegación del backoffice: grupos, secciones, badges y acción principal.
// Archivo sin "use client": lo usan el layout (servidor) y el shell (cliente).

export type NavIcon =
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
  | "gastos";
export type BadgeKey = "requests" | "leads" | "obligations" | "approvals";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  exact?: boolean;
  badge?: BadgeKey;
  adminOnly?: boolean;
  /** Oculto para el colaborador */
  operatorOnly?: boolean;
}

interface NavGroup {
  title: string;
  adminOnly?: boolean;
  operatorOnly?: boolean;
  /** Solo el estudio dueño del sitio público (STUDIO_SLUG) */
  siteOnly?: boolean;
  /** Solo el equipo de Faro */
  faroOnly?: boolean;
  items: NavItem[];
}

/** Qué puede ver quien está en el panel (se calcula en el servidor) */
export interface NavAccess {
  isAdmin: boolean;
  isOperator: boolean;
  hasSite: boolean;
  isFaro: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "General",
    items: [
      { href: "/admin", label: "Resumen", icon: "resumen", exact: true },
      { href: "/gastos", label: "Gastos compartidos", icon: "gastos" },
    ],
  },
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
    operatorOnly: true,
    items: [
      { href: "/admin/consultas", label: "Consultas", icon: "consultas", badge: "leads" },
      { href: "/admin/agenda", label: "Agenda", icon: "agenda" },
    ],
  },
  {
    title: "Faro IA",
    items: [
      { href: "/admin/asistente", label: "Asistente", icon: "asistente" },
      { href: "/admin/aprobaciones", label: "Aprobaciones", icon: "aprobaciones", badge: "approvals" },
      { href: "/admin/mcp", label: "Accesos MCP", icon: "mcp" },
    ],
  },
  { title: "Sitio web", siteOnly: true, operatorOnly: true, items: [{ href: "/admin/contenidos", label: "Contenidos", icon: "contenidos" }] },
  {
    title: "Configuración",
    adminOnly: true,
    items: [
      { href: "/admin/usuarios", label: "Usuarios", icon: "usuarios", adminOnly: true },
      { href: "/admin/conexiones", label: "Conexiones", icon: "integraciones", adminOnly: true },
      { href: "/admin/ia/configuracion", label: "IA", icon: "ia", adminOnly: true },
      { href: "/admin/plan", label: "Plan y módulos", icon: "faro", adminOnly: true },
    ],
  },
  { title: "Faro", faroOnly: true, items: [{ href: "/faro-manager", label: "Faro Manager", icon: "faro" }] },
];

export function visibleGroups(a: NavAccess) {
  return NAV_GROUPS.filter((g) => (!g.adminOnly || a.isAdmin) && (!g.operatorOnly || a.isOperator) && (!g.siteOnly || a.hasSite) && (!g.faroOnly || a.isFaro))
    .map((g) => ({ ...g, items: g.items.filter((i) => (!i.adminOnly || a.isAdmin) && (!i.operatorOnly || a.isOperator)) }))
    .filter((g) => g.items.length);
}

export const BADGE_LABEL: Record<BadgeKey, string> = {
  requests: "solicitudes abiertas",
  leads: "consultas nuevas",
  obligations: "vencimientos esta semana",
  approvals: "propuestas para aprobar",
};

/** Breadcrumb: grupo › sección › subpantalla, a partir de la ruta */
export function crumbs(pathname: string): { label: string; href?: string }[] {
  const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));
  const item = [...all].sort((a, b) => b.href.length - a.href.length).find((i) => (i.exact ? pathname === i.href : pathname.startsWith(i.href)));
  if (pathname === "/admin/cuenta") return [{ label: "Mi cuenta" }];
  if (!item) return [{ label: "Backoffice" }];
  const out: { label: string; href?: string }[] = [{ label: item.group }, { label: item.label, href: item.href }];
  const rest = pathname.slice(item.href.length).split("/").filter(Boolean);
  const SUB: Record<string, string> = {
    nueva: "Nueva",
    nuevo: "Nuevo",
    importar: "Importar",
    novedades: "Novedades",
    preguntas: "Preguntas frecuentes",
    planes: "Planes",
    tango: "Tango",
    clientes: "Clientes",
    xubio: "Xubio",
    "google-drive": "Google Drive",
    "mcp-externo": "MCP externo",
    archivos: "Archivos",
  };
  for (const seg of rest) out.push({ label: SUB[seg] ?? "Detalle" });
  return out;
}

/** Acción principal de la barra superior según la sección */
export function primaryAction(pathname: string, isOperator = true): { href: string; label: string } | null {
  if (!isOperator) return null;
  if (pathname === "/admin" || pathname === "/admin/consultas") return { href: "/admin/consultas/nueva", label: "Cargar consulta" };
  if (pathname === "/admin/organizaciones") return { href: "/admin/organizaciones/nueva", label: "Nueva organización" };
  if (pathname === "/admin/vencimientos") return { href: "/admin/vencimientos/importar", label: "Importar vencimientos" };
  if (pathname === "/admin/agenda") return { href: "/admin/agenda?tab=disponibilidad", label: "Mi disponibilidad" };
  if (pathname === "/admin/contenidos" || pathname === "/admin/contenidos/novedades") return { href: "/admin/contenidos/novedades/nueva", label: "Nueva novedad" };
  return null;
}

/**
 * Contexto de la pantalla actual para "Preguntar a Faro": la ficha de una
 * organización o la solicitud abierta. Solo IDs: el servidor los valida.
 */
export function askFaroHref(pathname: string, search: URLSearchParams) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const org = /^\/admin\/organizaciones\/([^/]+)/.exec(pathname)?.[1];
  const req = pathname === "/admin/solicitudes" ? search.get("id") : null;
  const ctx = org && uuid.test(org) ? `organizacion:${org}` : req && uuid.test(req) ? `solicitud:${req}` : null;
  return `/admin/asistente?nueva=1${ctx ? `&contexto=${ctx}` : ""}`;
}

export const sidebarStorageKey = (id: string) => `admin-sidebar:${id}`;

/** Script previo al pintado: aplica el estado guardado del sidebar sin parpadeo */
export function sidebarBootScript(userId: string) {
  return `try{if(localStorage.getItem(${JSON.stringify(sidebarStorageKey(userId))})==="collapsed")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`;
}
