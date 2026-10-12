import { isIP } from "node:net";

// Reglas de red para las URLs que elige un tenant (ver safe-fetch.ts).
// Sin server-only: las prueban los tests unitarios.

class UnsafeUrlError extends Error {}

export const allowPrivate = () => process.env.ALLOW_PRIVATE_URLS === "true";

function v4Private(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
}

/** Dirección que no es de internet pública (IPv4 o IPv6, incluidas las IPv4 mapeadas) */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return v4Private(ip);
  if (v !== 6) return true;
  const x = ip.toLowerCase();
  const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Private(mapped[1]);
  return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff") || x.startsWith("64:ff9b:") || x.startsWith("2001:db8");
}

/** Valida una URL elegida por un tenant antes de guardarla o usarla */
export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("La URL no es válida.");
  }
  if (allowPrivate()) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnsafeUrlError("La URL tiene que empezar con https://.");
    return url;
  }
  if (url.protocol !== "https:") throw new UnsafeUrlError("La URL tiene que empezar con https://.");
  if (url.username || url.password) throw new UnsafeUrlError("La URL no puede llevar usuario ni contraseña.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw new UnsafeUrlError("La URL tiene que ser una dirección pública de internet.");
  if (isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError("La URL tiene que ser una dirección pública de internet.");
  return url;
}

