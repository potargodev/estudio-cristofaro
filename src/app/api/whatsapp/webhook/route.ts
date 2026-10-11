import { handleWebhook, webhookChallenge } from "@/modules/whatsapp/server";

// Webhook de WhatsApp Business Cloud API. Una sola URL para el número de Faro
// y los números propios de los estudios: la cuenta sale del phone_number_id
// del mensaje y la firma se valida con el secreto de esa cuenta.

export const dynamic = "force-dynamic";

/** Meta verifica la suscripción con el token de verificación de alguna cuenta */
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("hub.mode") === "subscribe" && (await webhookChallenge(u.searchParams.get("hub.verify_token")))) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Token inválido", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 1_000_000) return new Response("Muy grande", { status: 413 });
  const r = await handleWebhook(raw, req.headers.get("x-hub-signature-256"));
  return new Response(r.status === 200 ? "ok" : "rechazado", { status: r.status });
}
