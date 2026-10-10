import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { isStudioRole } from "@/lib/roles";
import { GUEST_COOKIE, guestByToken, type GastosActor } from "./actor";

// Actor de grupos de gastos a partir de la sesión o de la cookie del invitado.

/** Actor del pedido actual o null (sin sesión válida ni invitación vigente) */
export const getGastosActor = cache(async (): Promise<GastosActor | null> => {
  const user = await getCurrentUser();
  if (user) {
    // El estudio entra con su seguridad completa (contraseña definitiva y 2FA)
    if (isStudioRole(user.role) && (user.mustChangePassword || !user.twoFactorEnabled)) return null;
    if (user.tenantSuspended && !user.assisted) return null;
    // En acceso asistido el equipo de Faro no opera gastos de personas
    if (user.assisted) return null;
    return { kind: "user", studioId: user.studioId, userId: user.id, name: user.name, email: user.email, role: user.role };
  }
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!token) return null;
  const g = await guestByToken(token);
  if (!g) return null;
  return { kind: "guest", studioId: g.studioId, memberId: g.memberId, groupId: g.groupId, name: g.name, email: g.email };
});


/** Para las páginas de /gastos: actor o a la pantalla de ingreso */
export async function requireGastos(): Promise<GastosActor> {
  const a = await getGastosActor();
  if (!a) redirect("/grupos/entrar");
  return a;
}
