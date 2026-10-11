// Indicadores: utilidades puras (meses, series y variaciones)

/** Los últimos n meses (AAAA-MM), del más viejo al actual, en hora de Buenos Aires */
export function lastMonths(n: number, now = new Date()) {
  const ba = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ba.getFullYear(), ba.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Completa con 0 los meses sin datos */
export function series(months: string[], rows: { m: string; v: number | string | null }[]) {
  const by = new Map(rows.map((r) => [r.m, Number(r.v ?? 0)]));
  return months.map((m) => ({ m, v: by.get(m) ?? 0 }));
}

/** Variación porcentual del último mes contra el anterior (null si no hay base) */
export function change(s: { v: number }[]) {
  if (s.length < 2) return null;
  const a = s[s.length - 2].v;
  const b = s[s.length - 1].v;
  if (!a) return null;
  return Math.round(((b - a) / Math.abs(a)) * 100);
}

export const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : null);

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
