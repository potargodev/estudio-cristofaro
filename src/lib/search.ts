/** Patrón para ILIKE "contiene", escapando los comodines que escriba el usuario. */
export function likeTerm(q: string) {
  return `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
