"use client";

// Abrir el panel del Vigía desde cualquier pantalla (botón de la barra
// superior, tarjeta del Inicio, barra inferior). Si el panel no está montado
// (por ejemplo, sin sesión), el enlace sigue a /vigia a pantalla completa.

export const OPEN_VIGIA = "faro:vigia";

declare global {
  interface Window {
    __faroVigiaPanel?: boolean;
  }
}

/** Abre el panel; devuelve false si no hay panel (el enlace sigue su curso) */
export function openVigia(detail?: { tab?: string }) {
  if (typeof window === "undefined" || !window.__faroVigiaPanel) return false;
  window.dispatchEvent(new CustomEvent(OPEN_VIGIA, { detail }));
  return true;
}
