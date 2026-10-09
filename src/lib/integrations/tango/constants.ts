// Procesos de la API Delta de Tango (query param process=<ID>)
export const TANGO_PROCESS = {
  clientes: 2117,
  cuentasContables: 1575,
  asientos: 1664,
  tiposDeAsiento: 1622,
  monedas: 1660,
  comprobantesVenta: 20412,
} as const;

export const PROCESS_LABELS: Record<number, string> = {
  2117: "Clientes",
  1575: "Cuentas contables",
  1664: "Asientos",
  1622: "Tipos de asiento",
  1660: "Monedas",
  20412: "Comprobantes de venta",
};

// Seguridad del ingest
export const KEY_HEADER = "x-connector-key";
export const TIMESTAMP_HEADER = "x-timestamp";
export const SIGNATURE_HEADER = "x-signature";
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutos
export const MAX_BODY_BYTES = 8 * 1024 * 1024;
export const MAX_RECORDS_PER_BATCH = 2000;
