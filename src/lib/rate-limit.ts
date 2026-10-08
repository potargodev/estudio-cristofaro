// Rate limit en memoria por clave (IP). Alcanza para un solo contenedor; si en
// algún momento corren varias réplicas, cada una lleva su propia cuenta.

const hits = new Map<string, number[]>();

/**
 * Registra un intento y devuelve false si la clave ya hizo `limit` intentos
 * en la ventana `windowMs`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);

  // Limpieza ocasional para que el mapa no crezca sin control
  if (hits.size > 5000) {
    for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return true;
}

/** IP del visitante detrás del proxy de Easypanel (Traefik agrega X-Forwarded-For). */
export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "desconocida";
}
