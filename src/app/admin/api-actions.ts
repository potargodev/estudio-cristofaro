"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnAccount, requireTenant, TENANT_OWNERS } from "@/lib/auth";
import { ApiError, createApiToken, revokeApiToken } from "@/modules/api/server";
import { createEndpoint, sendTest, setEndpoint, WebhookError } from "@/modules/api/webhooks";

// API pública y webhooks (§2.p, B9): solo el dueño del tenant, nunca en el
// acceso asistido del equipo de Faro. El token y el secreto se muestran una
// sola vez; en la base quedan el hash y el secreto cifrado.

const BASE = "/admin/configuracion/api";
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const owner = () => requireOwnAccount(requireTenant("studio", TENANT_OWNERS));

export interface SecretState {
  ok: boolean;
  message?: string;
  secret?: string;
}

export async function createTokenAction(_: SecretState, fd: FormData): Promise<SecretState> {
  const me = await owner();
  try {
    const r = await createApiToken(me.studioId, me, { name: s(fd, "name"), scopes: fd.getAll("scopes").map(String), organizationId: s(fd, "org") || null });
    revalidatePath(BASE);
    return { ok: true, secret: r.token, message: `Token «${r.row.name}» creado.` };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, message: e.message };
    throw e;
  }
}

export async function createWebhookAction(_: SecretState, fd: FormData): Promise<SecretState> {
  const me = await owner();
  try {
    const r = await createEndpoint(me.studioId, me, { url: s(fd, "url"), events: fd.getAll("events").map(String) });
    revalidatePath(BASE);
    return { ok: true, secret: r.secret, message: `Webhook a ${r.row.url} creado.` };
  } catch (e) {
    if (e instanceof WebhookError) return { ok: false, message: e.message };
    throw e;
  }
}

export async function apiManageAction(fd: FormData) {
  const me = await owner();
  const op = s(fd, "op");
  const id = s(fd, "id");
  let msg = "";
  if (op === "revocar") msg = (await revokeApiToken(me.studioId, me, id)) ? "Token revocado: deja de funcionar ya." : "Ese token ya estaba revocado.";
  else if (op === "pausar" || op === "activar" || op === "borrar") {
    await setEndpoint(me.studioId, me, id, op);
    msg = op === "borrar" ? "Webhook borrado." : op === "pausar" ? "Webhook en pausa." : "Webhook activo.";
  } else if (op === "probar") {
    try {
      const r = await sendTest(me.studioId, me, id);
      msg = r === "entregado" ? "Evento de prueba entregado." : "El destino no respondió bien: lo reintentamos solo. Mirá el detalle abajo.";
    } catch (e) {
      if (e instanceof WebhookError) msg = e.message;
      else throw e;
    }
  }
  revalidatePath(BASE);
  redirect(`${BASE}?${new URLSearchParams({ ok: msg })}`);
}
