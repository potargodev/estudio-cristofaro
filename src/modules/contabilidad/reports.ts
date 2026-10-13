import "server-only";
import { formatDate } from "@/lib/format";
import type { Report } from "@/lib/export-table";
import { AGING } from "./core";
import { KIND_LABEL } from "./plan";
import { previewAdjustment } from "./inflacion-server";
import { accountsOf, AccountingError, journalOf, ledgerOf, listAssets, payables, receivables, statementsOf, trialOf, type Scope } from "./server";

// Reportes de la contabilidad para Excel y PDF (A1): libro diario, mayor,
// sumas y saldos, estados contables, cuentas corrientes, bienes de uso y el
// plan de cuentas. Importes en pesos (los centavos se dividen acá).

export const REPORTS = {
  diario: "Libro diario",
  mayor: "Mayor de una cuenta",
  sumas: "Balance de sumas y saldos",
  estados: "Estados contables",
  clientes: "Cuenta corriente de clientes",
  proveedores: "Cuenta corriente de proveedores",
  bienes: "Bienes de uso",
  plan: "Plan de cuentas",
  inflacion: "Ajuste por inflación · papel de trabajo",
} as const;
type ReportKind = keyof typeof REPORTS;
export const isReport = (k: string): k is ReportKind => k in REPORTS;

const $ = (c: number) => Math.round(c) / 100;
const d = (iso: string) => formatDate(iso, "numeric");

export async function accountingReport(s: Scope, orgName: string, kind: ReportKind, p: { from: string; to: string; code?: string | null }): Promise<Report> {
  const period = `del ${d(p.from)} al ${d(p.to)}`;
  const base = { title: `${REPORTS[kind]} · ${orgName}`, subtitle: kind === "plan" || kind === "clientes" || kind === "proveedores" ? `Al ${d(p.to)}` : period };
  switch (kind) {
    case "diario": {
      const rows = (await journalOf(s, p.from, p.to)).flatMap((e) => [[e.number ?? null, d(e.date), e.concept, null, null, null], ...e.lines.map((l) => [null, null, null, `${l.code ?? ""} ${l.account}`.trim(), l.debit ? $(l.debit) : null, l.credit ? $(l.credit) : null])]);
      return { ...base, sections: [{ title: "Asientos registrados", header: ["Nº", "Fecha", "Concepto", "Cuenta", "Debe", "Haber"], rows, widths: [0.5, 1, 3, 3, 1.2, 1.2] }] };
    }
    case "mayor": {
      if (!p.code) throw new AccountingError("Elegí la cuenta.");
      const m = await ledgerOf(s, p.code, p.from, p.to);
      return { ...base, title: `Mayor de ${m.account.code} ${m.account.name} · ${orgName}`, sections: [{ title: "Movimientos", header: ["Fecha", "Nº", "Concepto", "Debe", "Haber", "Saldo"], rows: [[null, null, "Saldo anterior", null, null, $(m.opening)], ...m.rows.map((r) => [d(r.date), r.number, r.concept, r.debit ? $(r.debit) : null, r.credit ? $(r.credit) : null, $(r.balance)])], totals: [[null, null, "Saldo final", null, null, $(m.closing)]], widths: [1, 0.5, 4, 1.2, 1.2, 1.2] }] };
    }
    case "sumas": {
      const t = await trialOf(s, p.from, p.to);
      return { ...base, sections: [{ title: "Sumas y saldos", header: ["Código", "Cuenta", "Debe", "Haber", "Saldo deudor", "Saldo acreedor"], rows: t.rows.map((r) => [r.code, r.name, $(r.debit), $(r.credit), r.balance > 0 ? $(r.balance) : null, r.balance < 0 ? $(-r.balance) : null]), totals: [[null, "Totales", $(t.debit), $(t.credit), null, null]], widths: [1, 4, 1.2, 1.2, 1.2, 1.2] }] };
    }
    case "estados": {
      const st = await statementsOf(s, p.from, p.to);
      const lines = (xs: { code: string; name: string; amount: number }[]) => xs.map((x) => [x.code, x.name, $(x.amount)]);
      const sp = st.situacion;
      return {
        ...base,
        sections: [
          { title: "Estado de situación patrimonial", header: ["Código", "Rubro", "Importe"], rows: [["", "ACTIVO CORRIENTE", null], ...lines(sp.activoCorriente), ["", "ACTIVO NO CORRIENTE", null], ...lines(sp.activoNoCorriente)], totals: [["", "Total del activo", $(sp.activo)]], widths: [1, 5, 1.5] },
          { title: "Pasivo y patrimonio neto", header: ["Código", "Rubro", "Importe"], rows: [["", "PASIVO CORRIENTE", null], ...lines(sp.pasivoCorriente), ["", "PASIVO NO CORRIENTE", null], ...lines(sp.pasivoNoCorriente), ["", "PATRIMONIO NETO", null], ...lines(sp.patrimonio), ["", "Resultado del ejercicio", $(sp.resultado)]], totals: [["", "Total del pasivo", $(sp.pasivo)], ["", "Total del patrimonio neto", $(sp.patrimonioNeto)], ["", "Pasivo más patrimonio neto", $(sp.pasivo + sp.patrimonioNeto)]], widths: [1, 5, 1.5] },
          { title: "Estado de resultados", header: ["Código", "Rubro", "Importe"], rows: [["", "RESULTADOS POSITIVOS", null], ...lines(st.resultados.ingresos), ["", "RESULTADOS NEGATIVOS", null], ...lines(st.resultados.egresos)], totals: [["", "Resultado del período", $(st.resultados.resultado)]], widths: [1, 5, 1.5] },
        ],
      };
    }
    case "clientes":
    case "proveedores": {
      const a = kind === "clientes" ? await receivables(s, p.to) : await payables(s, p.to);
      return { ...base, sections: [{ title: "Antigüedad de saldos", header: [kind === "clientes" ? "Cliente" : "Proveedor", ...AGING, "Total"], rows: a.rows.map((r) => [r.party, ...r.buckets.map($), $(r.total)]), totals: [["Totales", ...a.totals.map($), $(a.total)]], widths: [3, 1, 1, 1, 1, 1, 1.2] }] };
    }
    case "bienes": {
      const list = await listAssets(s, p.to);
      return { ...base, subtitle: `Al ${d(p.to)}`, sections: [{ title: "Bienes de uso", header: ["Bien", "Cuenta", "Alta", "Vida (meses)", "Costo", "Amortización acumulada", "Valor residual contable"], rows: list.map((a) => [a.name, a.account_code, d(a.acquired_on), a.life_months, $(a.cost), $(a.accumulated), $(a.net)]), totals: [["Totales", null, null, null, $(list.reduce((t, a) => t + a.cost, 0)), $(list.reduce((t, a) => t + a.accumulated, 0)), $(list.reduce((t, a) => t + a.net, 0))]] }] };
    }
    case "inflacion": {
      const pv = await previewAdjustment(s, p.to);
      if (pv.missing.length) throw new AccountingError(`Faltan los índices de ${pv.missing.join(", ")}.`);
      const closing = pv.end.slice(0, 7);
      const idx = (m: string) => pv.used[m]?.value ?? null;
      return {
        ...base,
        title: `Ajuste por inflación · ${orgName}`,
        subtitle: `Ejercicio del ${d(pv.start)} al ${d(pv.end)} · RT 6 (método a validar por el contador)`,
        sections: [
          { title: "Índices", header: ["Mes", "Índice", "Coeficiente al cierre", "Fuente"], rows: pv.months.map((m) => [m, idx(m), idx(m) ? Math.round((idx(closing)! / idx(m)!) * 10000) / 10000 : null, pv.used[m]?.source ?? ""]), widths: [1, 1.2, 1.2, 4] },
          { title: "Reexpresión por cuenta", header: ["Cuenta", "Mes de origen", "Nominal", "Coeficiente", "Reexpresado", "Ajuste"], rows: pv.rows.filter((r) => !r.monetary).flatMap((r) => [[`${r.code} ${r.name}`, null, $(r.nominal), null, $(r.restated), $(r.adjustment)], ...r.parts.map((x) => [null, x.month, $(x.nominal), Math.round(x.coef * 10000) / 10000, $(x.restated), null])]), widths: [3.5, 1, 1.2, 1, 1.2, 1.2] },
          { title: "Nominal y homogéneo", header: ["Código", "Cuenta", "Saldo nominal", "Saldo homogéneo", "Diferencia"], rows: pv.compare.map((c) => [c.code, c.name, $(c.nominal), $(c.homogeneous), $(c.homogeneous - c.nominal)]), widths: [1, 4, 1.3, 1.3, 1.3] },
          { title: "Asiento de ajuste", header: ["Código", "Cuenta", "Debe", "Haber"], rows: pv.lines.map((l) => [l.code, l.account, l.debit ? $(l.debit) : null, l.credit ? $(l.credit) : null]), totals: [[null, pv.recpam > 0 ? "RECPAM (pérdida)" : "RECPAM (ganancia)", null, $(Math.abs(pv.recpam))]], widths: [1, 4, 1.3, 1.3] },
        ],
      };
    }
    case "plan": {
      const acc = await accountsOf(s);
      return { ...base, sections: [{ title: "Plan de cuentas", header: ["Código", "Cuenta", "Tipo", "Imputable", "Monetaria", "Moneda"], rows: acc.map((a) => [a.code, a.name, KIND_LABEL[a.kind], a.imputable ? "Sí" : "No", a.monetary ? "Sí" : "No", a.currency]), widths: [1.2, 4, 1.5, 0.8, 0.8, 0.8] }] };
    }
  }
}
