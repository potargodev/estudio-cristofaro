// Reparto de un gasto entre personas, siempre en enteros (centavos). Nunca hay
// errores de redondeo: la suma de las partes es exactamente el total. El resto
// de centavos se reparte de forma determinística (método del resto mayor; a
// igual resto, por ID de persona), así el mismo gasto da siempre el mismo
// resultado sin importar el orden en que se cargaron las personas.

export type SplitMethod = "iguales" | "porcentaje" | "partes" | "montos" | "items";

export type SplitSpec =
  | { method: "iguales"; members: string[] }
  | { method: "porcentaje"; percents: Record<string, number> }
  | { method: "partes"; parts: Record<string, number> }
  | { method: "montos"; amounts: Record<string, number> }
  | { method: "items"; items: { description: string; amount: number; members: string[] }[] };

export class SplitError extends Error {}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Reparte `total` centavos según pesos (enteros o decimales ≥ 0) con el método
 * del resto mayor. Devuelve un entero por clave; la suma es exactamente `total`.
 */
export function allocate(total: number, weights: Record<string, number>): Record<string, number> {
  if (!Number.isSafeInteger(total)) throw new SplitError("El total tiene que ser un número entero de centavos.");
  const keys = Object.keys(weights).sort(byId);
  if (!keys.length) throw new SplitError("Tiene que haber al menos una persona en el reparto.");
  for (const k of keys) if (!(weights[k] >= 0) || !Number.isFinite(weights[k])) throw new SplitError("Los pesos del reparto no pueden ser negativos.");
  const sum = keys.reduce((s, k) => s + weights[k], 0);
  if (sum <= 0) throw new SplitError("El reparto no tiene a nadie con una parte mayor a cero.");
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const out: Record<string, number> = {};
  const rest: { k: string; frac: number }[] = [];
  let assigned = 0;
  for (const k of keys) {
    const exact = (abs * weights[k]) / sum;
    const floor = Math.floor(exact + 1e-9);
    out[k] = floor;
    assigned += floor;
    rest.push({ k, frac: exact - floor });
  }
  let left = abs - assigned;
  // Resto mayor primero; a igual resto, el orden de ID
  rest.sort((a, b) => b.frac - a.frac || byId(a.k, b.k));
  for (let i = 0; left > 0; i = (i + 1) % rest.length) {
    if (weights[rest[i].k] === 0) {
      if (rest.every((r) => weights[r.k] === 0)) break;
      continue;
    }
    out[rest[i].k]++;
    left--;
  }
  if (sign < 0) for (const k of keys) out[k] = -out[k] || 0;
  return out;
}

/** Cuánto le toca a cada persona (centavos). Valida que el reparto cierre exacto. */
export function splitExpense(total: number, spec: SplitSpec): Record<string, number> {
  if (!Number.isSafeInteger(total) || total === 0) throw new SplitError("El monto tiene que ser distinto de cero.");
  switch (spec.method) {
    case "iguales": {
      const members = [...new Set(spec.members)];
      if (!members.length) throw new SplitError("Elegí entre quiénes se divide.");
      return allocate(total, Object.fromEntries(members.map((m) => [m, 1])));
    }
    case "porcentaje": {
      const sum = Object.values(spec.percents).reduce((s, v) => s + v, 0);
      if (Math.abs(sum - 100) > 0.001) throw new SplitError(`Los porcentajes suman ${Math.round(sum * 100) / 100}% y tienen que sumar 100%.`);
      return allocate(total, spec.percents);
    }
    case "partes": {
      for (const v of Object.values(spec.parts)) if (!Number.isInteger(v) || v < 0) throw new SplitError("Las partes tienen que ser números enteros (por ejemplo 2 y 1).");
      return allocate(total, spec.parts);
    }
    case "montos": {
      const sum = Object.values(spec.amounts).reduce((s, v) => s + v, 0);
      for (const v of Object.values(spec.amounts)) if (!Number.isSafeInteger(v)) throw new SplitError("Los montos tienen que estar en centavos enteros.");
      if (sum !== total) throw new SplitError(`Los montos suman ${sum / 100} y el gasto es de ${total / 100}.`);
      return Object.fromEntries(Object.entries(spec.amounts).filter(([, v]) => v !== 0));
    }
    case "items": {
      if (!spec.items.length) throw new SplitError("Cargá al menos un ítem del ticket.");
      const out: Record<string, number> = {};
      const itemsTotal = spec.items.reduce((s, i) => s + i.amount, 0);
      if (Math.sign(itemsTotal) !== Math.sign(total) || Math.abs(itemsTotal) > Math.abs(total)) throw new SplitError("Los ítems suman más que el total del ticket.");
      const subtotal: Record<string, number> = {};
      for (const it of spec.items) {
        if (!Number.isSafeInteger(it.amount)) throw new SplitError("Los ítems tienen que estar en centavos enteros.");
        const members = [...new Set(it.members)];
        if (!members.length) throw new SplitError(`El ítem "${it.description}" no tiene a nadie asignado.`);
        const part = allocate(it.amount, Object.fromEntries(members.map((m) => [m, 1])));
        for (const [m, v] of Object.entries(part)) subtotal[m] = (subtotal[m] ?? 0) + v;
      }
      // Lo que no está en los ítems (propina, impuestos, servicio) se reparte en proporción a lo consumido
      const extra = total - itemsTotal;
      const extraPart = extra !== 0 ? allocate(extra, subtotal) : {};
      for (const m of Object.keys(subtotal)) out[m] = subtotal[m] + (extraPart[m] ?? 0);
      return out;
    }
  }
}

/** Valida los pagadores: suman exactamente el total */
export function checkPayers(total: number, payers: Record<string, number>) {
  const sum = Object.values(payers).reduce((s, v) => s + v, 0);
  if (!Object.keys(payers).length) throw new SplitError("Elegí quién pagó.");
  for (const v of Object.values(payers)) if (!Number.isSafeInteger(v)) throw new SplitError("Lo pagado tiene que estar en centavos enteros.");
  if (sum !== total) throw new SplitError(`Lo que pagaron (${sum / 100}) no coincide con el total (${total / 100}).`);
}

/** "48.000,50" o "48000.5" o "$ 48.000" → centavos */
export function parseAmount(v: string): number | null {
  const s = v.replace(/[^\d,.-]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) normalized = s.replace(/\./g, "").replace(",", ".");
  else if (lastDot > -1 && s.length - lastDot - 1 === 3 && !s.includes(",")) normalized = s.replace(/\./g, ""); // 48.000 = miles
  else normalized = s.replace(/,/g, "");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
