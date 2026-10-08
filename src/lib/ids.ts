const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Las rutas /admin/.../[id] solo aceptan uuids (otro valor haría fallar la query). */
export function isUuid(value: string) {
  return UUID_RE.test(value);
}
