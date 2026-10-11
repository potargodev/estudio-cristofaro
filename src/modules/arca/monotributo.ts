// Semáforo de monotributo (docs/faro-producto.md §2.c): facturación de los
// últimos 12 meses contra el tope de la categoría, cuánto falta, la
// recategorización de enero y julio y la alerta de exclusión. Sin base ni red.

export interface ScaleCategory {
  letter: string;
  maxIncome: number;
  maxSurfaceM2: number | null;
  maxEnergyKw: number | null;
  maxRent: number | null;
  feeServices: number | null;
  feeGoods: number | null;
  servicesAllowed: boolean;
}

/**
 * Escala de referencia para sembrar la tabla. Topes de ingresos brutos
 * anuales vigentes desde febrero de 2025 (última actualización que Faro pudo
 * comparar al construir el módulo). Se carga marcada "a validar": el Faro
 * Manager la confirma o la reemplaza con la escala vigente publicada por ARCA.
 */
export const SEED_SCALE: { validFrom: string; source: string; categories: ScaleCategory[] } = {
  validFrom: "2025-02-01",
  source: "Escala de referencia de febrero de 2025 (a validar contra arca.gob.ar/monotributo/categorias.asp)",
  categories: [
    ["A", 7813063.45, 30, 3330, 2600000],
    ["B", 11447046.44, 45, 5000, 2600000],
    ["C", 16050091.57, 60, 6700, 3640000],
    ["D", 19926340.1, 85, 10000, 3640000],
    ["E", 23439190.34, 110, 13000, 4520000],
    ["F", 29374695.9, 150, 16500, 4520000],
    ["G", 35128502.31, 200, 20000, 5420000],
    ["H", 53298417.3, 200, 20000, 7800000],
    ["I", 59657887.55, 200, 20000, 7800000],
    ["J", 68318880.36, 200, 20000, 7800000],
    ["K", 82370281.28, 200, 20000, 7800000],
  ].map(([letter, maxIncome, maxSurfaceM2, maxEnergyKw, maxRent]) => ({
    letter: letter as string,
    maxIncome: maxIncome as number,
    maxSurfaceM2: maxSurfaceM2 as number,
    maxEnergyKw: maxEnergyKw as number,
    maxRent: maxRent as number,
    feeServices: null,
    feeGoods: null,
    servicesAllowed: true,
  })),
};

export type Light = "verde" | "amarillo" | "rojo" | "excluido";

export interface Semaforo {
  income12m: number;
  category: string | null;
  cap: number | null;
  used: number | null;
  remaining: number | null;
  light: Light;
  suggested: string | null;
  excluded: boolean;
  projection12m: number;
  nextRecategorization: { label: string; cutoff: string; deadline: string };
  months: { month: string; amount: number }[];
  message: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** Los 12 meses que cuentan (el actual incluido) */
export function last12Months(today = new Date()) {
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) out.push(monthKey(new Date(today.getFullYear(), today.getMonth() - i, 1)));
  return out;
}

/** Próxima recategorización: en enero (con lo de julio a diciembre) y en julio (enero a junio) */
export function nextRecategorization(today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  if (m <= 1) return { label: `enero de ${y}`, cutoff: `${y - 1}-12-31`, deadline: `${y}-02-05` };
  if (m <= 7) return { label: `julio de ${y}`, cutoff: `${y}-06-30`, deadline: `${y}-08-05` };
  return { label: `enero de ${y + 1}`, cutoff: `${y}-12-31`, deadline: `${y + 1}-02-05` };
}

export function semaforo(input: { byMonth: Record<string, number>; category: string | null; scale: ScaleCategory[]; today?: Date }): Semaforo {
  const today = input.today ?? new Date();
  const months = last12Months(today).map((month) => ({ month, amount: Math.round((input.byMonth[month] ?? 0) * 100) / 100 }));
  const income12m = Math.round(months.reduce((s, m) => s + m.amount, 0) * 100) / 100;
  const scale = [...input.scale].sort((a, b) => a.maxIncome - b.maxIncome);
  const cat = scale.find((c) => c.letter === input.category) ?? null;
  const top = scale[scale.length - 1];
  const excluded = !!top && income12m > top.maxIncome;
  const suggested = excluded ? null : (scale.find((c) => c.maxIncome >= income12m)?.letter ?? null);
  const recent = months.slice(-3).reduce((s, m) => s + m.amount, 0);
  const projection12m = Math.round((recent / 3) * 12);
  const used = cat ? income12m / cat.maxIncome : null;
  let light: Light = "verde";
  if (excluded) light = "excluido";
  else if (used != null && used >= 0.9) light = "rojo";
  else if (used != null && used >= 0.7) light = "amarillo";
  const rec = nextRecategorization(today);
  const fmt = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;
  let message: string;
  if (excluded) message = `Tus ingresos de los últimos 12 meses (${fmt(income12m)}) superan el tope de la categoría más alta (${fmt(top.maxIncome)}). Eso es causal de exclusión del monotributo: hablá con un contador cuanto antes.`;
  else if (!cat) message = `Facturaste ${fmt(income12m)} en los últimos 12 meses. Cargá tu categoría para ver cuánto te falta${suggested ? ` (por ingresos te corresponde la ${suggested})` : ""}.`;
  else if (income12m > cat.maxIncome) message = `Te pasaste del tope de la categoría ${cat.letter}. En la recategorización de ${rec.label} te corresponde la ${suggested}.`;
  else message = `Podés facturar ${fmt(cat.maxIncome - income12m)} más sin pasarte de la categoría ${cat.letter}.${suggested && suggested !== cat.letter ? ` Por lo facturado, en ${rec.label} te correspondería la ${suggested}.` : ""}`;
  return { income12m, category: cat?.letter ?? input.category, cap: cat?.maxIncome ?? null, used, remaining: cat ? cat.maxIncome - income12m : null, light, suggested, excluded, projection12m, nextRecategorization: rec, months, message };
}

/**
 * Simulación educativa del pase a responsable inscripto: IVA del mes con la
 * alícuota general, contra la cuota del monotributo (si la escala la tiene).
 */
export function simulateRI(input: { annualIncome: number; annualPurchasesWithIva: number; monthlyFee: number | null }) {
  const debit = (input.annualIncome / 12) * 0.21;
  const credit = (input.annualPurchasesWithIva / 12 / 1.21) * 0.21;
  const ivaMonthly = Math.max(0, debit - credit);
  return { ivaMonthly: Math.round(ivaMonthly), debit: Math.round(debit), credit: Math.round(credit), monthlyFee: input.monthlyFee };
}
