// Marca blanca: reglas puras (dominio, colores y variables de estilo)

const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Normaliza lo que escribe el estudio (con o sin https://, barra o puerto) a un host */
export function normalizeDomain(input: string): string | null {
  const raw = input.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0].split(":")[0].replace(/\.$/, "");
  return HOST_RE.test(raw) ? raw : null;
}

/** Hosts que nunca pueden ser dominio propio de un estudio (Faro y la app) */
export function reservedHost(host: string, reserved: string[]) {
  return reserved.some((r) => host === r || host.endsWith(`.${r}`)) || host === "localhost";
}

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Valida los colores: el principal va de fondo en la barra lateral (texto
 * claro encima) y el de acento, en detalles sobre esa barra. Pide contraste
 * suficiente para que se lea (WCAG AA para texto: 4,5).
 */
export function checkColors(primary: string | null, accent: string | null): string | null {
  if (primary && !isHex(primary)) return "El color principal tiene que ser un código como #1c2235.";
  if (accent && !isHex(accent)) return "El color de acento tiene que ser un código como #a57c6d.";
  if (primary && contrast(primary, "#ffffff") < 4.5) return "El color principal es muy claro: el texto de la barra no se leería. Elegí uno más oscuro.";
  if (primary && accent && contrast(accent, primary) < 3) return "El acento no se distingue del color principal. Elegí uno con más contraste.";
  return null;
}

/** Variables CSS que reemplazan los tokens de la marca en el portal */
export function brandVars(primary: string | null, accent: string | null): Record<string, string> {
  const v: Record<string, string> = {};
  if (primary) Object.assign(v, { "--color-night": primary, "--color-navy-deep": primary });
  if (accent) Object.assign(v, { "--color-rose-light": accent, "--color-gold": accent });
  return v;
}

/** Registro TXT que el estudio crea para probar que el dominio es suyo */
export const txtName = (domain: string) => `_faro-verificacion.${domain}`;
