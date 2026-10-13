// Navegación del espacio del estudio (docs/faro-producto.md §2.o): el menú,
// las pestañas de Comercial y de Configuración y sus badges. Archivo sin
// "use client": lo usan los layouts (servidor) y el shell (cliente). Es solo
// presentación: cada página vuelve a validar el acceso en el servidor.

export type NavIcon =
  | "resumen"
  | "recategorizacion"
  | "facturacion"
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
  | "comercial"
  | "configuracion"
  | "seguridad"
  | "honorarios"
  | "tareas"
  | "avanzado";
export type BadgeKey = "requests" | "leads" | "obligations" | "approvals" | "candidates" | "comercial";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  exact?: boolean;
  badge?: BadgeKey;
  /** Solo el dueño del tenant (dueño del estudio o titular) */
  adminOnly?: boolean;
  /** Oculto para el colaborador */
  operatorOnly?: boolean;
  /** Si el módulo no está en el plan, el ítem no aparece (se ofrece en Plan y módulos) */
  hideWhenLocked?: boolean;
  /** Solo el estudio dueño del sitio público (STUDIO_SLUG) */
  siteOnly?: boolean;
  /** También en la cuenta personal (titular) */
  personal?: boolean;
  /** Módulo de Faro que lo habilita (src/modules/registry.ts); sin él, el ítem queda con candado */
  module?: string;
  /** Otras rutas que también lo marcan activo (sus pestañas) */
  match?: string[];
}

interface NavGroup {
  title: string;
  /** Fijo abajo de la barra lateral */
  pinned?: boolean;
  items: NavItem[];
}

/** Qué puede ver quien está en el panel (se calcula en el servidor) */
export interface NavAccess {
  isAdmin: boolean;
  isOperator: boolean;
  hasSite: boolean;
  isFaro: boolean;
  /** Tenant personal (Faro Personal): solo lo marcado como personal */
  isPersonal?: boolean;
  /** Módulos activos del tenant (plan + overrides). Sin dato, no se filtra */
  modules?: string[];
}

/** Pestañas de Comercial: Consultas, Agenda y Perfil en la Red */
export const COMERCIAL_TABS: NavItem[] = [
  { href: "/admin/comercial/consultas", label: "Consultas", icon: "consultas", badge: "leads", operatorOnly: true },
  // Red Contable de doble mano (principios §15), destacada: postulaciones y estudios, con candidatos nuevos
  { href: "/admin/comercial/buscar-clientes", label: "Buscar clientes", icon: "red", badge: "candidates", operatorOnly: true, module: "red_estudios" },
  { href: "/admin/comercial/agenda", label: "Agenda", icon: "agenda" },
  // Conexión con un contador (principios §7): solicitudes, invitaciones, admisión y calificaciones
  { href: "/admin/comercial/conexiones", label: "Conexiones", icon: "usuarios", operatorOnly: true },
  { href: "/admin/comercial/red", label: "Perfil en la Red", icon: "red", operatorOnly: true, module: "red_estudios" },
];

/** Pestañas de Configuración (una sola entrada del menú, regla 6) */
export const CONFIG_TABS: NavItem[] = [
  { href: "/admin/configuracion/equipo", label: "Equipo y usuarios", icon: "usuarios", adminOnly: true },
  { href: "/admin/configuracion/plan", label: "Plan y módulos", icon: "modulos", adminOnly: true, personal: true, match: ["/admin/configuracion/modulos"] },
  { href: "/admin/configuracion/modulos", label: "Plan y módulos", icon: "modulos", personal: true },
  { href: "/admin/configuracion/conexiones", label: "Conexiones", icon: "integraciones", adminOnly: true, module: "connections" },
  { href: "/admin/configuracion/ia", label: "IA", icon: "ia", adminOnly: true, personal: true },
  { href: "/admin/configuracion/rubros", label: "Rubros y plantillas", icon: "rubros", module: "industries" },
  { href: "/admin/configuracion/sitio", label: "Sitio web", icon: "contenidos", operatorOnly: true, siteOnly: true },
  { href: "/admin/configuracion/seguridad", label: "Seguridad", icon: "seguridad", personal: true },
  // F9: marca blanca y WhatsApp del estudio (plan Avanzado)
  { href: "/admin/configuracion/avanzado", label: "Avanzado", icon: "avanzado", adminOnly: true },
];

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Operación",
    items: [
      { href: "/admin", label: "Inicio", icon: "resumen", exact: true },
      { href: "/admin/organizaciones", label: "Organizaciones", icon: "organizaciones", module: "core" },
      { href: "/admin/vencimientos", label: "Vencimientos", icon: "vencimientos", badge: "obligations" },
      { href: "/admin/facturacion", label: "Facturación", icon: "facturacion", module: "arca", hideWhenLocked: true },
      { href: "/admin/recategorizacion", label: "Recategorización", icon: "recategorizacion", hideWhenLocked: true },
      { href: "/admin/solicitudes", label: "Solicitudes", icon: "solicitudes", badge: "requests" },
      { href: "/admin/tareas", label: "Tareas", icon: "tareas", module: "crm", hideWhenLocked: true },
    ],
  },
  {
    title: "Negocio",
    items: [
      { href: "/admin/comercial", label: "Comercial", icon: "comercial", badge: "comercial" },
      { href: "/admin/honorarios", label: "Honorarios", icon: "honorarios", module: "billing", operatorOnly: true, hideWhenLocked: true },
    ],
  },
  {
    title: "Configuración",
    pinned: true,
    items: [{ href: "/admin/configuracion", label: "Configuración", icon: "configuracion" }],
  },
];

/** ¿El ítem está habilitado por los módulos del tenant? (sin módulo o sin dato: sí) */
export const itemEnabled = (i: { module?: string }, a: NavAccess) => !i.module || !a.modules || a.modules.includes(i.module);

const allowed = (i: NavItem, a: NavAccess) => (!i.adminOnly || a.isAdmin) && (!i.operatorOnly || a.isOperator) && (!i.siteOnly || a.hasSite) && (!a.isPersonal || !!i.personal);

/** Pestañas visibles de una sección (sin repetir la misma etiqueta: gana la primera que entra) */
export function visibleTabs(tabs: NavItem[], a: NavAccess) {
  const seen = new Set<string>();
  return tabs.filter((t) => {
    if (!allowed(t, a) || seen.has(t.label)) return false;
    seen.add(t.label);
    return true;
  });
}

export function visibleGroups(a: NavAccess) {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (!allowed(i, a)) return false;
      if (i.hideWhenLocked && !itemEnabled(i, a)) return false;
      // Comercial entra si tiene alguna pestaña (el colaborador ve la Agenda)
      if (i.href === "/admin/comercial") return visibleTabs(COMERCIAL_TABS, a).length > 0;
      return true;
    }),
  })).filter((g) => g.items.length);
}

/**
 * Contexto de la pantalla actual para el Vigía del estudio: la ficha de una
 * organización o la solicitud abierta. Solo IDs: el servidor los valida.
 */
export function askFaroContext(pathname: string, search: URLSearchParams) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const org = /^\/admin\/organizaciones\/([^/]+)/.exec(pathname)?.[1];
  const req = pathname === "/admin/solicitudes" ? search.get("id") : null;
  return org && uuid.test(org) ? `organizacion:${org}` : req && uuid.test(req) ? `solicitud:${req}` : null;
}
