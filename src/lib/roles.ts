// Roles de usuario y a dónde va cada uno. Única fuente para los chequeos de
// rol del estudio (dueño, contador, colaborador), del cliente y del autónomo.

import type { UserRole } from "./types";

const STUDIO_ROLES = ["dueno", "contador", "colaborador"] as const;
type StudioRole = (typeof STUDIO_ROLES)[number];

export const STUDIO_ROLE_LABELS: Record<StudioRole, string> = {
  dueno: "Dueño",
  contador: "Contador",
  colaborador: "Colaborador",
};

export const isStudioRole = (r: unknown): r is StudioRole => typeof r === "string" && (STUDIO_ROLES as readonly string[]).includes(r);

/** Rol de tenant: del estudio o titular de una cuenta personal */
export const isTenantRole = (r: unknown): r is StudioRole | "titular" => isStudioRole(r) || r === "titular";

/** Pantalla de inicio de cada tipo de usuario */
export function homeFor(role: UserRole | string | null | undefined) {
  if (role === "cliente") return "/portal";
  if (role === "titular") return "/personal";
  return "/admin";
}
