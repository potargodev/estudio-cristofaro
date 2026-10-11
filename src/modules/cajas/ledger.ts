// Desglose de una caja compartida (principios §18), sin base de datos: quién se
// hizo cargo de qué, cuánto y cuándo, las deudas de lo que se dividió (con la
// lógica de Grupos de gastos) y si están parejos. Un movimiento que cargó otra
// persona no cuenta para quien pagó hasta que lo confirma; una parte de un
// gasto dividido no cuenta para quien la debe hasta que confirma que la pagó.

import { simplifyDebts, type Transfer } from "@/modules/gastos/core/balances";

export interface LedgerShare {
  userId: string;
  amount: number;
  paid: boolean;
}

export interface LedgerEntry {
  id: string;
  kind: string; // gasto | ingreso | ahorro
  amount: number;
  paidBy: string;
  mode: "registrar" | "dividir";
  confirmed: boolean;
  shares: LedgerShare[];
}

export interface MemberLine {
  userId: string;
  /** Lo que puso, confirmado (lo que le devolvieron por lo dividido ya está descontado) */
  put: number;
  /** Lo que cargaron a su nombre y todavía no confirmó */
  pendingConfirm: number;
  /** Lo que debe por gastos divididos y no confirmó que pagó */
  owes: number;
  /** Lo que le deben por gastos divididos */
  owed: number;
  /** Diferencia contra la parte pareja del total (positivo: puso de más) */
  diff: number;
}

export interface Breakdown {
  total: number;
  members: MemberLine[];
  /** Quién le debe a quién, con el mínimo de transferencias */
  debts: Transfer[];
  even: boolean;
}

/** Tolerancia para decir «están parejos»: el 1 % del total o $ 100, lo que sea mayor */
export const evenTolerance = (total: number) => Math.max(10_000, Math.round(total * 0.01));

export function breakdown(entries: LedgerEntry[], memberIds: string[]): Breakdown {
  const lines = new Map<string, MemberLine>(memberIds.map((id) => [id, { userId: id, put: 0, pendingConfirm: 0, owes: 0, owed: 0, diff: 0 }]));
  const line = (id: string) => {
    if (!lines.has(id)) lines.set(id, { userId: id, put: 0, pendingConfirm: 0, owes: 0, owed: 0, diff: 0 });
    return lines.get(id)!;
  };
  const balance: Record<string, number> = {};
  for (const e of entries) {
    if (e.kind === "ingreso") continue; // los ingresos de un negocio compartido no son aportes de nadie
    if (!e.confirmed) {
      line(e.paidBy).pendingConfirm += e.amount;
      continue;
    }
    line(e.paidBy).put += e.amount;
    if (e.mode !== "dividir") continue;
    for (const s of e.shares) {
      if (s.userId === e.paidBy) continue;
      if (s.paid) {
        // Le devolvió su parte: ahora la puso quien la debía
        line(s.userId).put += s.amount;
        line(e.paidBy).put -= s.amount;
      } else {
        line(s.userId).owes += s.amount;
        line(e.paidBy).owed += s.amount;
        balance[s.userId] = (balance[s.userId] ?? 0) - s.amount;
        balance[e.paidBy] = (balance[e.paidBy] ?? 0) + s.amount;
      }
    }
  }
  const members = [...lines.values()];
  const total = members.reduce((s, m) => s + m.put, 0);
  const fair = members.length ? total / members.length : 0;
  for (const m of members) m.diff = Math.round(m.put - fair);
  const tol = evenTolerance(total);
  const debts = simplifyDebts(balance);
  return { total, members, debts, even: debts.length === 0 && members.every((m) => Math.abs(m.diff) <= tol) };
}
