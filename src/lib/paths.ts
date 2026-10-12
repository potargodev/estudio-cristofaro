// Rutas que llegan del navegador para volver después de una acción: solo
// rutas internas (nunca otro sitio: "//evil.com", "/\\evil.com", "https://…").

export function isInternalPath(v: unknown): v is string {
  return typeof v === "string" && v.length < 512 && v.startsWith("/") && !v.startsWith("//") && !/[\\\s\u0000-\u001f]/.test(v);
}

/** La ruta si es interna; si no, la de respaldo */
export const internalPath = (v: unknown, fallback: string) => (isInternalPath(v) ? v : fallback);
