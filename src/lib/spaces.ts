import "server-only";
import { cookies } from "next/headers";
import type { Space } from "@/components/app/shell/spaces";
import { getCurrentUser, getMemberships, ORG_COOKIE, type StaffUser } from "./auth";
import { getPrefs, setPrefs } from "./prefs";
import { isStudioRole } from "./roles";

// Espacios de cada persona (docs/faro-producto.md §2.o): Personal siempre; el
// estudio para su equipo; cada organización para sus miembros; Faro Manager
// para el equipo de Faro. El último que usó queda guardado en la base y la app
// entra ahí. Todo se calcula con la sesión: nunca con datos del navegador.

export const SPACE_HOME: Record<Space, string> = { studio: "/admin", personal: "/personal", portal: "/portal", faro: "/faro-manager" };

/** Espacio "natural" de la sesión (si no hay uno guardado) */
export function homeSpace(user: StaffUser): Space {
  if (user.role === "cliente") return "portal";
  if (user.role === "titular" || user.tenantKind !== "studio") return "personal";
  return "studio";
}

/** Espacios a los que la sesión puede entrar */
export function availableSpaces(user: StaffUser): Set<Space> {
  const out = new Set<Space>(["personal"]);
  if (user.role === "cliente") out.add("portal");
  else if (user.tenantKind === "studio" && isStudioRole(user.role)) out.add("studio");
  if (user.faroRole) out.add("faro");
  return out;
}

/** Organización activa del portal (cookie validada contra las membresías) */
export async function currentMembership(user: StaffUser) {
  if (user.role !== "cliente") return null;
  const list = await getMemberships(user.id, user.studioId);
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  return { list, current: list.find((m) => m.organizationId === wanted) ?? list[0] ?? null };
}

/**
 * Espacio de la pantalla actual. Con `forced` (la ruta pertenece a un
 * espacio) lo usa y lo recuerda; si no (Mensajes, Ayuda, Vigía…), sigue en el
 * último espacio usado. `employeeGroups`: Grupos es del espacio personal,
 * salvo para el empleado que viene de su organización (su menú lo incluye).
 */
export async function resolveSpace(user: StaffUser, forced?: Space | null, opts: { employeeGroups?: boolean } = {}): Promise<Space> {
  const prefs = await getPrefs(user.id).catch(() => ({}) as Awaited<ReturnType<typeof getPrefs>>);
  const can = availableSpaces(user);
  const last = prefs.space && can.has(prefs.space) ? prefs.space : null;
  let space: Space = forced && can.has(forced) ? forced : (last ?? homeSpace(user));
  if (opts.employeeGroups && last === "portal") {
    const m = await currentMembership(user);
    if (m?.current?.role === "empleado") space = "portal";
  }
  if (forced && space !== prefs.space && !user.assisted) await setPrefs(user.id, { space }).catch(() => undefined);
  return space;
}

/** Pantalla de entrada: el último espacio usado (o el natural) */
export async function entryPath() {
  const user = await getCurrentUser();
  if (!user) return "/ingresar";
  const space = await resolveSpace(user);
  return SPACE_HOME[space];
}
