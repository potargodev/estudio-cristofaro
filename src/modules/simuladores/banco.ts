import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { toCsv } from "@/lib/csv";
import { simLog } from "./server";

// Parte C · Simulador de banco: arma un extracto en CSV (el formato que bajan
// los home banking) con los cobros de las facturas autorizadas de la
// organización (algunos con centavos de diferencia o juntos en un solo
// depósito), gastos bancarios e impuestos al débito y al crédito, para probar
// la conciliación sin pedirle el extracto a nadie.

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (date: string, days: number) => iso(new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86400000));

export async function simStatement(studioId: string, organizationId: string) {
  const rows = await getDb()
    .select({ date: invoices.issue_date, total: invoices.total, name: invoices.customer_name })
    .from(invoices)
    .where(and(eq(invoices.studio_id, studioId), eq(invoices.organization_id, organizationId), eq(invoices.status, "autorizada")))
    .orderBy(desc(invoices.issue_date))
    .limit(12);
  const out: (string | number)[][] = [["Fecha", "Descripción", "Importe"]];
  rows.forEach((r, i) => {
    const total = Number(r.total);
    // Uno de cada cuatro cobros llega con una diferencia chica (retención o redondeo)
    const amount = i % 4 === 3 ? Math.round((total - 0.37) * 100) / 100 : total;
    out.push([shift(String(r.date), 2 + (i % 5)), `TRANSF RECIBIDA ${r.name.toUpperCase().slice(0, 30)}`, amount.toFixed(2)]);
  });
  const today = iso(new Date());
  out.push([today, "COMISION MANTENIMIENTO CUENTA", "-8500.00"], [today, "IVA 21% S/COMISION", "-1785.00"], [today, "IMP LEY 25413 DEBITO", "-62.10"], [today, "IMP LEY 25413 CREDITO", "-148.30"]);
  await simLog("banco", "extracto", `Extracto simulado con ${out.length - 1} movimientos`, { organizationId }, studioId);
  return toCsv(out);
}
