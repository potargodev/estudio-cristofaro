"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireTenant } from "@/lib/auth";
import { requireModule } from "@/lib/faro/require-module";
import { PROFILES } from "@/modules/flotas/catalog";
import { FleetError, registerPayment, submitProposal } from "@/modules/flotas/server";

// Lado del estudio en Flotas: proponer a pedidos publicados y registrar pagos
// de sus acuerdos. El estudio sale de la sesión.

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const back = (q: string): never => redirect(`/admin/red/flotas?${q}`);

async function staff() {
  const me = await requireTenant("studio", ["dueno", "contador"]);
  await requireModule(me.studioId, "red_estudios");
  return me;
}

export async function submitProposalAction(fd: FormData) {
  const me = await staff();
  const fleet = s(fd, "fleet");
  const prices = Object.fromEntries(PROFILES.map((p) => [p.key, s(fd, `price_${p.key}`) === "" ? null : Number(s(fd, `price_${p.key}`).replace(/\./g, "").replace(",", "."))]));
  try {
    await submitProposal({ id: me.studioId, userId: me.id }, fleet, { prices, includes: s(fd, "includes"), minMembers: Number(s(fd, "min_members")), noticeDays: Number(s(fd, "notice_days")) });
  } catch (e) {
    if (e instanceof FleetError) back(`error=${encodeURIComponent(e.message)}#f-${fleet}`);
    throw e;
  }
  await audit({ studioId: me.studioId, actor: me, action: "flota.propuesta", entityType: "flota", entityId: fleet, metadata: { precios: prices } });
  revalidatePath("/admin/red/flotas");
  back("ok=Propuesta%20enviada");
}

export async function registerPaymentAction(fd: FormData) {
  const me = await staff();
  try {
    const a = await registerPayment({ id: me.studioId, userId: me.id }, s(fd, "agreement"), s(fd, "period"), s(fd, "method"));
    await audit({ studioId: me.studioId, organizationId: a.organization_id, actor: me, action: "flota.pago", entityType: "acuerdo", entityId: a.id, metadata: { periodo: s(fd, "period"), importe: a.monthly_price } });
  } catch (e) {
    if (e instanceof FleetError) back(`error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/admin/red/flotas");
  back("ok=Pago%20registrado");
}
