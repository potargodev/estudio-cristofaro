"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireModule } from "@/lib/faro/require-module";
import { getSiteUrl } from "@/lib/runtime-config";
import { addRule, getLink, pollTango, pushPending, registerWebhook, resolveConflict, reviewRule, saveLink, suggestRules, TangoSyncError } from "@/modules/tango-sync/server";

// Tango en los dos sentidos: solo el dueño del estudio, siempre dentro de su
// estudio (cada función del módulo valida que lo tocado sea de este estudio).

const BASE = "/admin/configuracion/conexiones/tango/sincronizacion";
const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const go = (q: Record<string, string>): never => redirect(`${BASE}?${new URLSearchParams(q)}`);

async function run(fn: (me: Awaited<ReturnType<typeof requireAdmin>>) => Promise<string>) {
  const me = await requireAdmin();
  await requireModule(me.studioId, "tango");
  let ok: string;
  try {
    ok = await fn(me);
  } catch (e) {
    if (e instanceof TangoSyncError) go({ error: e.message });
    throw e;
  }
  revalidatePath(BASE);
  go({ ok });
}

export async function saveTangoLinkAction(fd: FormData) {
  await run(async (me) => {
    await saveLink(me, { apiUrl: s(fd, "api_url"), token: s(fd, "token"), companyId: s(fd, "company_id"), webhookSecret: s(fd, "webhook_secret"), writeEnabled: fd.get("write_enabled") === "on" });
    return "Enlace guardado.";
  });
}

export async function registerTangoWebhookAction() {
  await run(async (me) => {
    const link = await getLink(me.studioId);
    if (!link) throw new TangoSyncError("Guardá primero el enlace con la API.");
    const ok = await registerWebhook(me, `${getSiteUrl()}/api/integrations/tango/webhook/${link.id}`);
    return ok ? "Webhook registrado: Tango avisa cada cambio al instante." : "Tu versión de Tango no aceptó el webhook: Faro va a consultar los cambios cada 15 minutos.";
  });
}

export async function syncTangoNowAction() {
  await run(async (me) => {
    const sent = await pushPending(me.studioId);
    const got = await pollTango(me.studioId);
    return `Sincronizado: ${sent} enviados a Tango, ${got} revisados desde Tango.`;
  });
}

export async function suggestTangoRulesAction() {
  await run(async (me) => `${await suggestRules(me)} sugerencias nuevas para revisar.`);
}

export async function approveTangoRuleAction(fd: FormData) {
  await run(async (me) => {
    await reviewRule(me, s(fd, "id"), "aprobada", s(fd, "standard"));
    return "Regla aprobada y aplicada.";
  });
}

export async function rejectTangoRuleAction(fd: FormData) {
  await run(async (me) => {
    await reviewRule(me, s(fd, "id"), "rechazada");
    return "Regla rechazada.";
  });
}

export async function addTangoRuleAction(fd: FormData) {
  await run(async (me) => {
    await addRule(me, s(fd, "field"), s(fd, "raw"), s(fd, "standard"));
    return "Regla guardada y aplicada.";
  });
}

export async function keepFaroAction(fd: FormData) {
  await run(async (me) => {
    await resolveConflict(me, s(fd, "id"), "faro");
    return "Quedó lo de Faro y se volvió a escribir en Tango.";
  });
}

export async function keepTangoAction(fd: FormData) {
  await run(async (me) => {
    await resolveConflict(me, s(fd, "id"), "tango");
    return "Quedó lo de Tango.";
  });
}
