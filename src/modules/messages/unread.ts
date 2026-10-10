import "server-only";
import { unreadTotal } from "./server";

/** Mensajes sin leer del usuario (badge del menú) */
export async function unreadCount(userId: string) {
  return unreadTotal(userId);
}
