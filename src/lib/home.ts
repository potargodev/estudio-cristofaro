// Datos de la home que todavía son placeholders (docs/home-contenido.md marca
// entre corchetes los datos reales a completar). Cambiarlos acá.

/** Precios "desde" por plan (null = se muestra "Consultá el precio") — TODO precio real */
export const PLAN_PRICES: Record<string, string | null> = {
  negocio_en_orden: null,
  empresa_en_control: null,
  gestion_estrategica: null,
};

/** Datos del bloque "Responsable" — TODO valores reales */
export const STUDIO_FACTS = { years: 25, companies: 180 };

/** Importes de ejemplo de la demo (no son datos de clientes) */
export const DEMO = {
  client: "Agencia Norte",
  user: "Martina",
  toPay: 1284300,
  ivaAmount: 642180,
};
