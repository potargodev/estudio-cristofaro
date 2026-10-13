// Parte C · Modos de servicio (puro). Cada servicio externo de un estudio (o
// de una organización) funciona en uno de tres modos:
// - real: el servicio de verdad (producción).
// - prueba: el ambiente de prueba oficial (ARCA homologación, credenciales
//   de prueba de Mercado Pago, número de prueba de WhatsApp).
// - simulador: un simulador dentro de Faro, sin salir a internet.
// La demo arranca en simulador. Un espacio real nunca usa el simulador salvo
// que la plataforma lo permita (staging, ALLOW_SIMULATORS=true).

export const SERVICES = {
  arca: { label: "ARCA (facturación, padrón y constatación)", prueba: "Homologación de ARCA" },
  mercadopago: { label: "Mercado Pago (cobros)", prueba: "Credenciales de prueba de Mercado Pago" },
  whatsapp: { label: "WhatsApp", prueba: "Número de prueba de Meta" },
  mail: { label: "Mails", prueba: "Casilla de prueba" },
  tiendas: { label: "Tiendas online", prueba: "Tiendas de prueba de cada plataforma" },
  tango: { label: "Tango", prueba: "Empresa de prueba de Tango" },
  xubio: { label: "Xubio", prueba: "Cuenta de prueba de Xubio" },
  contabilium: { label: "Contabilium", prueba: "Cuenta de prueba de Contabilium" },
  banco: { label: "Bancos (extractos)", prueba: "Extractos de ejemplo" },
} as const;
export type Service = keyof typeof SERVICES;
export const isService = (s: string): s is Service => s in SERVICES;

export const MODES = { real: "Real", prueba: "Prueba", simulador: "Simulador" } as const;
export type Mode = keyof typeof MODES;
export const isMode = (m: string): m is Mode => m in MODES;

/** Modo que corresponde: el de la organización, el del estudio o el de siempre (simulador en la demo, real en el resto) */
export function resolveMode(o: { org?: string | null; studio?: string | null; demo: boolean }): Mode {
  const pick = (x?: string | null) => (x && isMode(x) ? x : null);
  return pick(o.org) ?? pick(o.studio) ?? (o.demo ? "simulador" : "real");
}

/** ¿Se puede poner ese modo? La demo nunca sale a un servicio real; un espacio real no usa el simulador fuera de staging */
export function modeAllowed(mode: Mode, o: { demo: boolean; simulatorsAllowed: boolean }) {
  if (o.demo && mode === "real") return "La demo nunca usa los servicios reales: elegí Prueba o Simulador.";
  if (!o.demo && mode === "simulador" && !o.simulatorsAllowed) return "Un espacio real no usa el simulador: elegí Real o Prueba (el simulador es para la demo y para staging).";
  return null;
}

/** Marca que se muestra: nada en real, «Modo demostración» o «Prueba» si no */
export const markFor = (modes: Mode[]) => (modes.includes("simulador") ? "simulador" : modes.includes("prueba") ? "prueba" : null);
