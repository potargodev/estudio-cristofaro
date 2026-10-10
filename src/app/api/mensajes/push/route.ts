import { deleteSubscription, saveSubscription, vapidKeys } from "@/modules/messages/push";
import { chatUser } from "@/modules/messages/session";

export const dynamic = "force-dynamic";

/** Clave pública para suscribirse a las notificaciones push */
export async function GET() {
  const me = await chatUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  return Response.json({ publicKey: (await vapidKeys()).publicKey });
}

export async function POST(req: Request) {
  const me = await chatUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  try {
    await saveSubscription(me.id, (await req.json()) as { endpoint: string; keys: { p256dh: string; auth: string } });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Suscripción inválida" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const me = await chatUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) await deleteSubscription(me.id, endpoint);
  return Response.json({ ok: true });
}
