import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isStudioRole } from "@/lib/roles";
import type { ChatUser } from "./server";

/** Usuario de Mensajes: con sesión completa (el estudio, con 2FA) y nunca en acceso asistido */
export async function chatUser(): Promise<ChatUser | null> {
  const u = await getCurrentUser().catch(() => null);
  if (!u || u.assisted || !u.studioId) return null;
  if (isStudioRole(u.role) && (u.mustChangePassword || !u.twoFactorEnabled)) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, studioId: u.studioId };
}

export async function requireChatUser() {
  const u = await chatUser();
  if (!u) redirect("/ingresar");
  return u;
}
