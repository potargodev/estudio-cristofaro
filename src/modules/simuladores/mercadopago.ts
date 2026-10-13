import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { getSiteUrl } from "@/lib/runtime-config";
import { simGet, simLog, simSet } from "./server";

// Parte C · Simulador de Mercado Pago dentro de Faro. El link de pago lleva a
// /simuladores/mercadopago/<id>, donde se aprueba o se rechaza el pago; Faro
// recibe el aviso firmado igual que el de Mercado Pago y lo aplica con el
// mismo circuito (honorarios, facturas, flotas o suscripciones).

export const SIM_TOKEN = "SIMULADOR";
export const SIM_SECRET = "secreto-del-simulador-de-mercado-pago";

const studioOf = (account: string): string | null => (account === "faro" ? null : account);

export interface Pref {
  id: string;
  kind: "preferencia" | "suscripcion";
  title: string;
  amount: number;
  external_reference: string;
  account: string;
  status: string;
}

export async function simMp(path: string, init: { method?: string; body?: unknown }): Promise<Record<string, unknown>> {
  const body = (init.body ?? {}) as Record<string, unknown>;
  if (path === "/users/me") return { id: 1, nickname: "SIMULADOR" };
  if (path === "/checkout/preferences" && init.method === "POST") {
    const id = `SIMPREF-${randomBytes(6).toString("hex")}`;
    const items = (body.items as { title: string; unit_price: number }[]) ?? [];
    const account = String(body.notification_url ?? "").match(/cuenta=([\w-]+)/)?.[1] ?? "faro";
    const p: Pref = { id, kind: "preferencia", title: items[0]?.title ?? "Pago", amount: items[0]?.unit_price ?? 0, external_reference: String(body.external_reference ?? ""), account, status: "pendiente" };
    await simSet("mercadopago", `pref:${id}`, p, studioOf(account));
    await simLog("mercadopago", "link", `Link de pago «${p.title}» por $ ${p.amount}`, p, studioOf(account));
    return { id, init_point: `${getSiteUrl()}/simuladores/mercadopago/${id}` };
  }
  if (path === "/preapproval" && init.method === "POST") {
    const id = `SIMSUB-${randomBytes(6).toString("hex")}`;
    const ar = (body.auto_recurring as { transaction_amount: number }) ?? { transaction_amount: 0 };
    const account = String(body.notification_url ?? "").match(/cuenta=([\w-]+)/)?.[1] ?? "faro";
    const p: Pref = { id, kind: "suscripcion", title: String(body.reason ?? "Suscripción"), amount: ar.transaction_amount, external_reference: String(body.external_reference ?? ""), account, status: "pending" };
    await simSet("mercadopago", `pref:${id}`, p, studioOf(account));
    return { id, status: "pending", init_point: `${getSiteUrl()}/simuladores/mercadopago/${id}`, external_reference: p.external_reference, auto_recurring: ar };
  }
  const pre = path.match(/^\/preapproval\/(.+)$/);
  if (pre) {
    const p = await simGet<Pref>("mercadopago", `pref:${decodeURIComponent(pre[1])}`);
    if (!p) throw new Error("Simulador de Mercado Pago: suscripción inexistente");
    if (init.method === "PUT") {
      p.status = String(body.status ?? p.status);
      await simSet("mercadopago", `pref:${p.id}`, p, studioOf(p.account));
    }
    return { id: p.id, status: p.status, init_point: `${getSiteUrl()}/simuladores/mercadopago/${p.id}`, external_reference: p.external_reference, auto_recurring: { transaction_amount: p.amount } };
  }
  const pay = path.match(/^\/v1\/payments\/(.+)$/);
  if (pay) {
    const p = await simGet<Record<string, unknown>>("mercadopago", `pay:${decodeURIComponent(pay[1])}`);
    if (!p) throw new Error("Simulador de Mercado Pago: pago inexistente");
    return p;
  }
  throw new Error(`Simulador de Mercado Pago: pedido desconocido (${path})`);
}

export const simPreference = (id: string) => simGet<Pref>("mercadopago", `pref:${id}`);

/** «Pagar» en el checkout simulado: crea el pago y manda el aviso firmado a Faro */
export async function simPay(id: string, approve: boolean) {
  const p = await simPreference(id);
  if (!p) throw new Error("Ese link de pago no existe.");
  const { handleWebhook } = await import("@/modules/billing/collect");
  if (p.kind === "suscripcion") {
    p.status = approve ? "authorized" : "cancelled";
    await simSet("mercadopago", `pref:${p.id}`, p, studioOf(p.account));
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = createHmac("sha256", SIM_SECRET).update(`id:${p.id.toLowerCase()};ts:${ts};`).digest("hex");
    return handleWebhook({ account: p.account, topic: "preapproval", dataId: p.id, requestId: null, signature: `ts=${ts},v1=${v1}`, body: { simulador: true } });
  }
  const payId = String(Date.now());
  const payment = { id: Number(payId), status: approve ? "approved" : "rejected", status_detail: approve ? "accredited" : "cc_rejected_other_reason", transaction_amount: p.amount, currency_id: "ARS", external_reference: p.external_reference, date_approved: approve ? new Date().toISOString() : null, metadata: { simulador: true } };
  await simSet("mercadopago", `pay:${payId}`, payment);
  p.status = approve ? "pagado" : "rechazado";
  await simSet("mercadopago", `pref:${p.id}`, p, studioOf(p.account));
  await simLog("mercadopago", approve ? "pago" : "rechazo", `${approve ? "Pagado" : "Rechazado"}: «${p.title}» por $ ${p.amount}`, { payment, pref: p.id }, studioOf(p.account));
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac("sha256", SIM_SECRET).update(`id:${payId};ts:${ts};`).digest("hex");
  return handleWebhook({ account: p.account, topic: "payment", dataId: payId, requestId: null, signature: `ts=${ts},v1=${v1}`, body: { simulador: true } });
}
