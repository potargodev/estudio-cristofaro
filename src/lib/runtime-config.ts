// Configuración que se lee en el servidor en tiempo de ejecución (no se fija en
// el build): la misma imagen Docker sirve para staging y para producción
// cambiando solo variables de entorno en Easypanel.

const DEFAULT_SITE_URL = "https://estudiocristofaro.com";

/** URL pública del sitio, sin barra final. Variable SITE_URL. */
export function getSiteUrl(): string {
  return (process.env.SITE_URL?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

/** Modo staging: SITE_NOINDEX=true pide a los buscadores que no indexen nada. */
export function isNoIndex(): boolean {
  return ["true", "1", "yes"].includes((process.env.SITE_NOINDEX ?? "").trim().toLowerCase());
}
