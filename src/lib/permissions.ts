// Matriz de permisos de los miembros de una organización. Es la ÚNICA fuente:
// la usan el servidor (requireMember, actions, rutas de archivos) y la interfaz
// (para esconder lo que no corresponde). La interfaz nunca alcanza: toda action
// vuelve a validar con `can()` en el servidor.

export const ORG_ROLES = ["administrador", "direccion", "administracion", "rrhh", "consulta", "empleado"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  administrador: "Administrador",
  direccion: "Dirección",
  administracion: "Administración",
  rrhh: "Recursos Humanos",
  consulta: "Consulta",
  empleado: "Empleado",
};

export const ORG_ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  administrador: "Administra miembros, roles y toda la información de la organización.",
  direccion: "Accede a reportes, indicadores e información sensible.",
  administracion: "Gestiona documentos, vencimientos, pagos y solicitudes.",
  rrhh: "Accede solo a empleados, sueldos y procesos laborales.",
  consulta: "Solo lectura de los módulos habilitados.",
  empleado: "Solo gastos compartidos y sus rendiciones de gastos.",
};

/** Roles sensibles: si los invita un admin de la organización, los confirma el estudio. */
export const SENSITIVE_ROLES: readonly OrgRole[] = ["direccion", "rrhh"];

export const PERMISSIONS = [
  "inicio.ver",
  "vencimientos.ver",
  "documentos.ver",
  "documentos.subir",
  "solicitudes.ver", // todas las solicitudes
  "solicitudes.crear",
  "solicitudes.laborales", // solo solicitudes de personal (alta, baja, novedades)
  "equipo.gestionar", // Mi equipo: invitar, revocar, cambiar roles
  "reportes.ver", // tablero, indicadores e informes
  "sueldos.ver",
  "sueldos.gestionar",
  "personal.ver",
  "personal.gestionar",
  "finanzas.ver", // cobrar, pagar, flujo de fondos, facturación
  "finanzas.gestionar",
  "societario.ver",
  "societario.gestionar",
  "agenda.reservar",
  "gastos.rendir", // cargar gastos a rendir (los aprueba quien tiene finanzas.gestionar)
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ_ONLY: Permission[] = PERMISSIONS.filter((p) => p.endsWith(".ver"));

export const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  administrador: PERMISSIONS,
  direccion: PERMISSIONS.filter((p) => p !== "equipo.gestionar"),
  administracion: [
    "inicio.ver",
    "vencimientos.ver",
    "documentos.ver",
    "documentos.subir",
    "solicitudes.ver",
    "solicitudes.crear",
    "solicitudes.laborales",
    "finanzas.ver",
    "finanzas.gestionar",
    "societario.ver",
    "societario.gestionar",
    "agenda.reservar",
    "gastos.rendir",
  ],
  // RRHH: solo empleados, sueldos y procesos laborales
  rrhh: ["inicio.ver", "solicitudes.laborales", "sueldos.ver", "sueldos.gestionar", "personal.ver", "personal.gestionar", "agenda.reservar"],
  // Consulta: solo lectura. Sueldos y reportes quedan afuera por ser información sensible (Dirección).
  consulta: READ_ONLY.filter((p) => p !== "sueldos.ver" && p !== "reportes.ver"),
  // Empleado: solo gastos compartidos y sus propias rendiciones.
  empleado: ["gastos.rendir"],
};

export function can(role: OrgRole | null | undefined, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}

/** Puede ver alguna solicitud (todas o solo las laborales) */
export function canSeeRequests(role: OrgRole) {
  return can(role, "solicitudes.ver") || can(role, "solicitudes.laborales");
}

/** Puede crear solicitudes o responderlas (RRHH, solo las laborales) */
export function canCreateRequests(role: OrgRole) {
  return can(role, "solicitudes.crear") || can(role, "solicitudes.laborales");
}

const RANK: Record<OrgRole, number> = {
  administrador: 4,
  direccion: 3,
  administracion: 2,
  rrhh: 2,
  consulta: 1,
  empleado: 0,
};

/**
 * Un miembro nunca otorga un rol superior al propio. Entre roles del mismo
 * nivel pero de distinta área (Administración y RRHH) tampoco: solo el
 * Administrador asigna cualquier rol.
 */
export function canGrant(actor: OrgRole, target: OrgRole): boolean {
  if (actor === "administrador") return true;
  return RANK[target] < RANK[actor] || target === actor;
}

export function isOrgRole(v: unknown): v is OrgRole {
  return typeof v === "string" && (ORG_ROLES as readonly string[]).includes(v);
}
