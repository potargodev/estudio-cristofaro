// Roles de usuario y a dónde va cada uno. Única fuente para los chequeos de
// rol del estudio (dueño, contador, colaborador), del cliente y del autónomo.

import type { UserRole } from "./types";

export const STUDIO_ROLES = ["admin", "contador", "colaborador"] as const;
export type StudioRole = (typeof STUDIO_ROLES)[number];

export const STUDIO_ROLE_LABELS: Record<StudioRole, string> = {
  admin: "Dueño",
  contador: "Contador",
  colaborador: "Colaborador",
};

export const STUDIO_ROLE_DESCRIPTIONS: Record<StudioRole, string> = {
  admin: "Todo el estudio: usuarios, planes, IA, conexiones y facturación.",
  contador: "Trabaja la cartera: organizaciones, vencimientos, documentos, solicitudes y consultas comerciales.",
  colaborador: "Operación del día a día: vencimientos, documentos, solicitudes y agenda. Sin consultas comerciales ni alta o edición de organizaciones.",
};

export const isStudioRole = (r: unknown): r is StudioRole => typeof r === "string" && (STUDIO_ROLES as readonly string[]).includes(r);

/** Pantalla de inicio de cada tipo de usuario */
export function homeFor(role: UserRole | string | null | undefined) {
  if (role === "cliente") return "/portal";
  if (role === "autonomo") return "/personal";
  return "/admin";
}
