import "server-only";
import type { SplitSpec } from "../core/split";
import type { NewExpense } from "./service";
import { GastosError } from "./service";

// Lectura de los formularios de gastos. El formulario manda un JSON en
// "payload" (importes ya en centavos) y el ticket como archivo; acá solo se
// le da forma: la validación real (integrantes del grupo, sumas, moneda) la
// hace el servicio.

const int = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN);
const record = (v: unknown): Record<string, number> => {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (typeof k !== "string" || k.length > 40) continue;
    const n = typeof x === "number" ? x : Number(x);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
};

export function parseSplit(v: unknown): SplitSpec {
  const s = (v ?? {}) as Record<string, unknown>;
  switch (s.method) {
    case "iguales":
      return { method: "iguales", members: Array.isArray(s.members) ? s.members.filter((x): x is string => typeof x === "string").slice(0, 50) : [] };
    case "porcentaje":
      return { method: "porcentaje", percents: record(s.percents) };
    case "partes":
      return { method: "partes", parts: record(s.parts) };
    case "montos":
      return { method: "montos", amounts: Object.fromEntries(Object.entries(record(s.amounts)).map(([k, x]) => [k, Math.round(x)])) };
    case "items":
      return {
        method: "items",
        items: (Array.isArray(s.items) ? s.items : []).slice(0, 60).map((i: Record<string, unknown>) => ({
          description: String(i?.description ?? "").slice(0, 80),
          amount: Math.round(Number(i?.amount) || 0),
          members: Array.isArray(i?.members) ? (i.members as unknown[]).filter((x): x is string => typeof x === "string") : [],
        })),
      };
    default:
      throw new GastosError("Elegí cómo se divide el gasto.");
  }
}

export function parseExpensePayload(raw: FormDataEntryValue | null): Omit<NewExpense, "receipt"> {
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(String(raw ?? "{}"));
  } catch {
    throw new GastosError("No pudimos leer el formulario. Probá de nuevo.");
  }
  const fx = p.fx as { source?: string; rate?: unknown } | null | undefined;
  const source = fx?.source === "oficial" || fx?.source === "mep" || fx?.source === "manual" ? fx.source : null;
  const payers = Object.fromEntries(Object.entries(record(p.payers)).map(([k, v]) => [k, Math.round(v)]));
  return {
    description: String(p.description ?? ""),
    amount: int(p.amount),
    currency: String(p.currency ?? "ARS"),
    date: String(p.date ?? ""),
    category: String(p.category ?? "otros"),
    payers,
    split: parseSplit(p.split),
    fx: source ? { source, rate: fx?.rate ? Number(String(fx.rate).replace(",", ".")) : null } : null,
    notes: typeof p.notes === "string" ? p.notes : "",
    isCompany: p.isCompany === true,
    isDeductible: p.isDeductible === true,
    recurrence: typeof p.recurrence === "string" ? p.recurrence : null,
  };
}
