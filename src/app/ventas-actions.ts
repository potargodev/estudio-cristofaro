"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ignoreSales, invoiceNow, SalesError, setBillingRule } from "@/modules/ventas/server";
import { salesScope } from "@/modules/ventas/scope";

// Ventas de tiendas para facturar (§2.p, B7). El alcance sale de la sesión;
// cada tienda y pedido se valida contra ese alcance en el módulo.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (path: string, q: Record<string, string>): never => redirect(`${path}?${new URLSearchParams(q)}`);

export async function salesRuleAction(fd: FormData) {
  const { me, scope, base } = await salesScope();
  const pos = s(fd, "pos");
  try {
    await setBillingRule(scope, me, s(fd, "store"), { mode: s(fd, "mode"), cuit: s(fd, "cuit") || null, pos: pos ? Number(pos) : null });
  } catch (e) {
    if (e instanceof SalesError) go(base, { error: e.message });
    throw e;
  }
  revalidatePath(base);
  go(base, { ok: "Guardamos cómo se factura esa tienda. Aplica a las ventas que lleguen desde ahora." });
}

export async function salesAction(fd: FormData) {
  const { me, scope, base } = await salesScope();
  const ids = fd.getAll("ids").map(String);
  const back = s(fd, "back").startsWith(base) ? s(fd, "back") : base;
  try {
    if (s(fd, "op") === "ignorar") {
      const n = await ignoreSales(scope, me, ids);
      revalidatePath(base);
      go(back, { ok: `${n} ${n === 1 ? "pedido queda" : "pedidos quedan"} sin facturar.` });
    }
    const r = await invoiceNow(scope, me, ids);
    revalidatePath(base);
    go(back, r.ok ? { ok: `Emitimos ${r.ok} de ${r.total} ${r.total === 1 ? "comprobante" : "comprobantes"}.` } : { error: "No se emitió ninguno: revisá el detalle de cada pedido." });
  } catch (e) {
    if (e instanceof SalesError) go(back, { error: e.message });
    throw e;
  }
}
