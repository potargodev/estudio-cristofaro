import "server-only";

// Cotizaciones para pasar gastos en otra moneda a la moneda base del grupo.
// Fuente: DolarApi (dolarapi.com) o la URL de FX_API_URL (mismo formato). Si
// no responde, el gasto se carga con cotización manual. Se guarda el valor y
// la fuente en cada gasto, así un saldo viejo no cambia con la cotización de hoy.

const TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; rate: number }>();

const PATHS: Record<string, Record<"oficial" | "mep", string>> = {
  USD: { oficial: "/v1/dolares/oficial", mep: "/v1/dolares/bolsa" },
  EUR: { oficial: "/v1/cotizaciones/eur", mep: "/v1/cotizaciones/eur" },
  BRL: { oficial: "/v1/cotizaciones/brl", mep: "/v1/cotizaciones/brl" },
  UYU: { oficial: "/v1/cotizaciones/uyu", mep: "/v1/cotizaciones/uyu" },
  CLP: { oficial: "/v1/cotizaciones/clp", mep: "/v1/cotizaciones/clp" },
};

/** Pesos por unidad de `currency` (precio de venta), o null si no hay dato */
export async function arsRate(currency: string, source: "oficial" | "mep"): Promise<number | null> {
  const path = PATHS[currency]?.[source];
  if (!path) return null;
  const key = `${currency}:${source}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.rate;
  const base = (process.env.FX_API_URL?.trim() || "https://dolarapi.com").replace(/\/$/, "");
  try {
    const res = await fetch(base + path, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { venta?: number; compra?: number };
    const rate = Number(data.venta ?? data.compra);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    cache.set(key, { at: Date.now(), rate });
    return rate;
  } catch {
    return null;
  }
}

/**
 * Cotización de `from` a `to` (unidades de `to` por unidad de `from`). Solo se
 * resuelve automática si una de las dos es ARS; si no, va manual.
 */
export async function fxRate(from: string, to: string, source: "oficial" | "mep"): Promise<number | null> {
  if (from === to) return 1;
  if (to === "ARS") return arsRate(from, source);
  if (from === "ARS") {
    const r = await arsRate(to, source);
    return r ? 1 / r : null;
  }
  return null;
}
