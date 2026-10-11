"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFaro } from "@/lib/auth";
import { BillingError, deleteAccount, saveAccount } from "@/modules/billing/mp";

const PATH = "/faro-manager/mercadopago";
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function saveFaroMpAction(fd: FormData) {
  const faro = await requireFaro(true);
  try {
    await saveAccount(null, faro, { accessToken: s(fd, "access_token"), publicKey: s(fd, "public_key"), webhookSecret: s(fd, "webhook_secret") });
  } catch (e) {
    if (e instanceof BillingError) redirect(`${PATH}?${new URLSearchParams({ error: e.message })}`);
    throw e;
  }
  revalidatePath(PATH);
  redirect(`${PATH}?ok=${encodeURIComponent("Cuenta de Mercado Pago guardada y probada.")}`);
}

export async function deleteFaroMpAction() {
  const faro = await requireFaro(true);
  await deleteAccount(null, faro);
  redirect(`${PATH}?ok=${encodeURIComponent("Cuenta desconectada.")}`);
}
