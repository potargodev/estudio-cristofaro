// Saldos y deudas de un grupo, por moneda, en centavos.
// Saldo positivo: le deben. Negativo: debe.

export interface LedgerExpense {
  id: string;
  currency: string;
  /** Cotización a la moneda base (1 si es la base); null si no se cargó */
  fxRate: number | null;
  payers: Record<string, number>;
  shares: Record<string, number>;
}

export interface LedgerSettlement {
  currency: string;
  fxRate?: number | null;
  from: string;
  to: string;
  amount: number;
}

export type Balances = Record<string, Record<string, number>>; // moneda → persona → centavos

export function computeBalances(expenses: LedgerExpense[], settlements: LedgerSettlement[]): Balances {
  const b: Balances = {};
  const add = (cur: string, m: string, v: number) => {
    b[cur] ??= {};
    b[cur][m] = (b[cur][m] ?? 0) + v;
  };
  for (const e of expenses) {
    for (const [m, v] of Object.entries(e.payers)) add(e.currency, m, v);
    for (const [m, v] of Object.entries(e.shares)) add(e.currency, m, -v);
  }
  // Quien paga una deuda mejora su saldo; quien la cobra, baja
  for (const s of settlements) {
    add(s.currency, s.from, s.amount);
    add(s.currency, s.to, -s.amount);
  }
  for (const cur of Object.keys(b)) {
    for (const m of Object.keys(b[cur])) if (b[cur][m] === 0) delete b[cur][m];
    if (!Object.keys(b[cur]).length) delete b[cur];
  }
  return b;
}

/**
 * Pasa los saldos de todas las monedas a la base con la cotización cargada en
 * cada gasto (un saldo en otra moneda sin cotización queda aparte).
 */
export function balancesInBase(expenses: LedgerExpense[], settlements: LedgerSettlement[], base: string) {
  const converted: LedgerExpense[] = [];
  const pending: LedgerExpense[] = [];
  for (const e of expenses) {
    if (e.currency === base) converted.push(e);
    else if (e.fxRate) {
      const conv = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * e.fxRate!)]));
      // Se convierte el total y se reparte con el mismo resto mayor para que siga cerrando exacto
      const payers = conv(e.payers);
      const shares = conv(e.shares);
      const diff = Object.values(payers).reduce((s, v) => s + v, 0) - Object.values(shares).reduce((s, v) => s + v, 0);
      if (diff !== 0) {
        const first = Object.keys(shares).sort()[0];
        shares[first] += diff;
      }
      converted.push({ ...e, currency: base, payers, shares });
    } else pending.push(e);
  }
  const conv = settlements.map((s) => (s.currency === base ? s : s.fxRate ? { ...s, currency: base, amount: Math.round(s.amount * s.fxRate) } : s));
  return { balances: computeBalances([...converted, ...pending], conv), unconverted: pending.length };
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/** Transferencias dentro de un conjunto que suma cero: deudor mayor con acreedor mayor (≤ n−1) */
function settleGroup(entries: [string, number][]): Transfer[] {
  const debt = entries.filter(([, v]) => v < 0).map(([k, v]) => ({ k, v: -v }));
  const cred = entries.filter(([, v]) => v > 0).map(([k, v]) => ({ k, v }));
  const out: Transfer[] = [];
  const order = (a: { k: string; v: number }, b: { k: string; v: number }) => b.v - a.v || (a.k < b.k ? -1 : 1);
  while (debt.length && cred.length) {
    debt.sort(order);
    cred.sort(order);
    const d = debt[0];
    const c = cred[0];
    const x = Math.min(d.v, c.v);
    out.push({ from: d.k, to: c.k, amount: x });
    d.v -= x;
    c.v -= x;
    if (!d.v) debt.shift();
    if (!c.v) cred.shift();
  }
  return out;
}

/**
 * Deudas simplificadas con el mínimo de transferencias. El mínimo es n − k,
 * donde k es la mayor cantidad de subconjuntos disjuntos que suman cero: se
 * calcula exacto con programación dinámica sobre subconjuntos (hasta 16
 * personas con saldo); con más, se usa el emparejamiento voraz (≤ n − 1).
 */
export function simplifyDebts(balance: Record<string, number>): Transfer[] {
  const entries = Object.entries(balance)
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const n = entries.length;
  if (!n) return [];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total !== 0) throw new Error("Los saldos no suman cero");
  if (n > 16) return settleGroup(entries);
  const full = (1 << n) - 1;
  const sum = new Array<number>(1 << n).fill(0);
  for (let mask = 1; mask <= full; mask++) {
    const low = mask & -mask;
    sum[mask] = sum[mask ^ low] + entries[31 - Math.clz32(low)][1];
  }
  // dp[mask] = máxima cantidad de grupos que suman cero usando exactamente mask (si sum[mask] = 0)
  const dp = new Int8Array(1 << n).fill(-1);
  const choice = new Int32Array(1 << n);
  dp[0] = 0;
  for (let mask = 1; mask <= full; mask++) {
    if (sum[mask] !== 0) continue;
    // El subconjunto que contiene al bit más bajo se elige entre los submasks que suman cero
    const low = mask & -mask;
    const rest = mask ^ low;
    for (let sub = rest; ; sub = (sub - 1) & rest) {
      const g = sub | low;
      if (sum[g] === 0 && dp[mask ^ g] >= 0 && dp[mask ^ g] + 1 > dp[mask]) {
        dp[mask] = dp[mask ^ g] + 1;
        choice[mask] = g;
      }
      if (sub === 0) break;
    }
  }
  const out: Transfer[] = [];
  for (let mask = full; mask; ) {
    const g = choice[mask];
    out.push(...settleGroup(entries.filter((_, i) => g & (1 << i))));
    mask ^= g;
  }
  return out;
}

/**
 * Deudas directas (sin simplificar): en cada gasto, cada persona le debe su
 * parte a quienes pagaron, en proporción a lo que pagó cada uno; se netea por
 * par de personas y se descuentan los pagos registrados.
 */
export function directDebts(expenses: LedgerExpense[], settlements: LedgerSettlement[], currency: string): Transfer[] {
  const pair = new Map<string, number>(); // "a|b" con a < b: positivo = a le debe a b
  const addDebt = (debtor: string, creditor: string, v: number) => {
    if (debtor === creditor || !v) return;
    const [a, b, sign] = debtor < creditor ? [debtor, creditor, 1] : [creditor, debtor, -1];
    pair.set(`${a}|${b}`, (pair.get(`${a}|${b}`) ?? 0) + sign * v);
  };
  for (const e of expenses.filter((x) => x.currency === currency)) {
    const paid = Object.entries(e.payers);
    const totalPaid = paid.reduce((s, [, v]) => s + v, 0);
    for (const [m, share] of Object.entries(e.shares)) {
      // La parte de m se reparte entre los pagadores según lo que pagó cada uno
      const owed = paid.length === 1 ? { [paid[0][0]]: share } : distribute(share, Object.fromEntries(paid), totalPaid);
      for (const [payer, v] of Object.entries(owed)) addDebt(m, payer, v);
    }
  }
  for (const s of settlements.filter((x) => x.currency === currency)) addDebt(s.to, s.from, s.amount);
  const out: Transfer[] = [];
  for (const [k, v] of pair) {
    const [a, b] = k.split("|");
    if (v > 0) out.push({ from: a, to: b, amount: v });
    else if (v < 0) out.push({ from: b, to: a, amount: -v });
  }
  return out.sort((x, y) => y.amount - x.amount || (x.from < y.from ? -1 : 1));
}

function distribute(amount: number, weights: Record<string, number>, total: number) {
  const keys = Object.keys(weights).sort();
  const out: Record<string, number> = {};
  let used = 0;
  const fr: { k: string; f: number }[] = [];
  for (const k of keys) {
    const exact = (amount * weights[k]) / total;
    out[k] = Math.floor(exact);
    used += out[k];
    fr.push({ k, f: exact - out[k] });
  }
  fr.sort((a, b) => b.f - a.f || (a.k < b.k ? -1 : 1));
  for (let i = 0; used < amount; i++, used++) out[fr[i % fr.length].k]++;
  return out;
}
