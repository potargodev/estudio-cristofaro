// Validaciones de formato que se repiten en toda la app: un solo lugar.

/** UUID (los IDs de la base): cualquier otro valor haría fallar la query */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/** Email con forma válida (la casilla la confirma el enlace o la invitación) */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
