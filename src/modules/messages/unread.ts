import "server-only";

/** Mensajes sin leer del usuario (lo completa el módulo Mensajes) */
export async function unreadCount(_userId: string): Promise<number> {
  return 0;
}
