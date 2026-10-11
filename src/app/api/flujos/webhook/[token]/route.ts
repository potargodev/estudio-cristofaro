import { createHash } from "node:crypto";
import { triggerWebhook } from "@/modules/flows/engine";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Webhook entrante de un flujo: POST con JSON. El token (en la URL) identifica
 * el flujo activo. Idempotency-Key (o el hash del cuerpo) evita corridas
 * repetidas. Responde 201 si creó una corrida, 200 si era repetida.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const raw = await request.text();
  if (raw.length > 64 * 1024) return new Response("Muy grande", { status: 413 });
  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (typeof body !== "object" || Array.isArray(body) || !body) throw new Error();
  } catch {
    return Response.json({ error: "El cuerpo tiene que ser un objeto JSON." }, { status: 400 });
  }
  if (!rateLimit(`flujo:${token}`, 60, 60_000)) return new Response("Demasiados pedidos", { status: 429 });
  const key = request.headers.get("idempotency-key")?.slice(0, 120) || createHash("sha256").update(raw).digest("hex");
  const r = await triggerWebhook(token, body, key);
  if (r.status === 404) return new Response("No encontrado", { status: 404 });
  return Response.json({ corrida: r.runId, repetido: r.status === 200 }, { status: r.status });
}
