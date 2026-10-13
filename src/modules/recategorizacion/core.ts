// Recategorización del monotributo de la cartera (A5): con la facturación de
// los 12 meses que cuentan y los parámetros físicos (superficie, energía,
// alquiler), la categoría que coincide y el movimiento (sube, baja, mantiene,
// excluido). La escala puede estar «a validar»: Faro muestra hechos y la
// decisión es del contador (§1). Sin base ni red: lo usan el servidor y las
// pruebas.

import type { ScaleCategory } from "@/modules/arca/monotributo";

export type Movement = "sube" | "baja" | "mantiene" | "excluido" | "sin_categoria";
export const MOVEMENT_LABEL: Record<Movement, string> = { sube: "Sube", baja: "Baja", mantiene: "Mantiene", excluido: "Excluido", sin_categoria: "Sin categoría cargada" };
export type Activity = "servicios" | "bienes";

export interface Params {
  activity: Activity;
  surfaceM2: number | null;
  energyKw: number | null;
  rentAnnual: number | null;
}

/** Los 12 meses que cuentan para una recategorización: los que terminan en el mes de corte (AAAA-MM) */
export function monthsTo(cutoffMonth: string) {
  const [y, m] = cutoffMonth.split("-").map(Number);
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Recategorización que viene: la de enero (corte 31/12) o la de julio (corte 30/06), con el vencimiento del 5 del mes siguiente */
export function periodFor(today: string) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  // Hasta el vencimiento de febrero se trabaja la de enero; hasta agosto, la de julio
  if (m <= 2) return { key: `${y}-01`, label: `enero de ${y}`, cutoff: `${y - 1}-12`, deadline: `${y}-02-05` };
  if (m <= 8) return { key: `${y}-07`, label: `julio de ${y}`, cutoff: `${y}-06`, deadline: `${y}-08-05` };
  return { key: `${y + 1}-01`, label: `enero de ${y + 1}`, cutoff: `${y}-12`, deadline: `${y + 1}-02-05` };
}

const rank = (scale: ScaleCategory[], letter: string | null) => (letter ? scale.findIndex((c) => c.letter === letter) : -1);

/**
 * Categoría que coincide: la más baja cuyo tope de ingresos y de cada
 * parámetro cargado alcanza; si ninguna alcanza (o vende servicios por encima
 * de la última categoría que los admite), excluido.
 */
export function suggest(scale: ScaleCategory[], income12m: number, p: Params) {
  const sorted = [...scale].sort((a, b) => a.maxIncome - b.maxIncome);
  const fits = (c: ScaleCategory) =>
    c.maxIncome >= income12m &&
    (p.surfaceM2 == null || c.maxSurfaceM2 == null || c.maxSurfaceM2 >= p.surfaceM2) &&
    (p.energyKw == null || c.maxEnergyKw == null || c.maxEnergyKw >= p.energyKw) &&
    (p.rentAnnual == null || c.maxRent == null || c.maxRent >= p.rentAnnual) &&
    (p.activity === "bienes" || c.servicesAllowed);
  const c = sorted.find(fits) ?? null;
  const reasons: string[] = [];
  if (!c) {
    const top = sorted[sorted.length - 1];
    if (top && income12m > top.maxIncome) reasons.push("los ingresos superan el tope de la categoría más alta");
    if (top && p.surfaceM2 != null && top.maxSurfaceM2 != null && p.surfaceM2 > top.maxSurfaceM2) reasons.push("la superficie supera el máximo");
    if (top && p.energyKw != null && top.maxEnergyKw != null && p.energyKw > top.maxEnergyKw) reasons.push("la energía supera el máximo");
    if (top && p.rentAnnual != null && top.maxRent != null && p.rentAnnual > top.maxRent) reasons.push("el alquiler supera el máximo");
    if (!reasons.length) reasons.push("ninguna categoría admite esa actividad con esos valores");
  } else {
    const byIncome = sorted.find((x) => x.maxIncome >= income12m);
    if (byIncome && byIncome.letter !== c.letter) reasons.push("la categoría la define un parámetro físico, no los ingresos");
  }
  return { letter: c?.letter ?? null, excluded: !c, reasons };
}

export function movementOf(scale: ScaleCategory[], current: string | null, suggested: string | null, excluded: boolean): Movement {
  if (excluded) return "excluido";
  if (!current || rank(scale, current) < 0) return "sin_categoria";
  const a = rank([...scale].sort((x, y) => x.maxIncome - y.maxIncome), current);
  const b = rank([...scale].sort((x, y) => x.maxIncome - y.maxIncome), suggested);
  return b > a ? "sube" : b < a ? "baja" : "mantiene";
}

/** Cuota mensual de la categoría según la actividad (null si la escala no la tiene cargada) */
export function feeOf(scale: ScaleCategory[], letter: string | null, activity: Activity) {
  const c = scale.find((x) => x.letter === letter);
  if (!c) return null;
  return activity === "bienes" ? (c.feeGoods ?? c.feeServices) : (c.feeServices ?? c.feeGoods);
}
