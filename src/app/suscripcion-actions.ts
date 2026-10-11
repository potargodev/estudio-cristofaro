"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requireTenantOwner } from "@/lib/auth";
import { BillingError } from "@/modules/billing/mp";
import { cancelSubscription, choosePlan, payNowLink } from "@/modules/billing/subscriptions";

// Suscripción del tenant a Faro: solo el dueño (dueño del estudio o titular).

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const home = (kind: string) => (kind === "studio" ? "/admin/configuracion/plan" : "/personal/plan");

function go(path: string, q: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(q)}`);
}

export async function choosePlanAction(fd: FormData) {
  const me = await requireTenantOwner();
  const back = home(me.tenantKind);
  let r: Awaited<ReturnType<typeof choosePlan>>;
  try {
    r = await choosePlan(me.studioId, me, s(fd, "plan"), s(fd, "interval") === "anual" ? "anual" : "mensual");
  } catch (e) {
    if (e instanceof BillingError) go(back, { error: e.message });
    throw e;
  }
  revalidatePath(back);
  if (r.redirect) redirect(r.redirect);
  go(back, { ok: r.message });
}

export async function cancelSubscriptionAction() {
  const me = await requireTenantOwner();
  const msg = await cancelSubscription(me.studioId, me);
  revalidatePath(home(me.tenantKind));
  go(home(me.tenantKind), { ok: msg });
}

/** Pagar ahora (morosa o suspendida): también desde la pantalla de cuenta suspendida */
export async function payNowAction() {
  const me = await getCurrentUser();
  if (!me || !["dueno", "titular"].includes(me.role)) redirect("/ingresar");
  let url: string;
  try {
    url = await payNowLink(me.studioId);
  } catch (e) {
    if (e instanceof BillingError) go(me.tenantSuspended ? (me.tenantKind === "studio" ? "/admin/suspendido" : "/personal/suspendido") : home(me.tenantKind), { error: e.message });
    throw e;
  }
  redirect(url);
}
