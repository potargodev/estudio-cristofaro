"use server";

import { redirect } from "next/navigation";
import { requirePersonal } from "@/lib/auth";
import { fleetBalanceLink, startFleetDebit, stopFleetDebit } from "@/modules/billing/collect";
import { BillingError } from "@/modules/billing/mp";

// Débito automático individual de la cuota (solo la parte de cada persona) y
// pago del saldo pendiente o de la liquidación final con Mercado Pago.

const back = "/flotas/servicios";

export async function fleetPayAction(fd: FormData) {
  const u = await requirePersonal();
  const me = { id: u.id, name: u.name, email: u.email };
  const id = String(fd.get("agreement") ?? "");
  const op = String(fd.get("op") ?? "");
  let url: string | null = null;
  try {
    if (op === "adherir") url = await startFleetDebit(me, id);
    else if (op === "saldo") url = await fleetBalanceLink(me, id);
    else await stopFleetDebit(me, id);
  } catch (e) {
    if (e instanceof BillingError) redirect(`${back}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  if (url) redirect(url);
  redirect(`${back}?ok=${encodeURIComponent("Cancelaste el débito automático.")}`);
}
