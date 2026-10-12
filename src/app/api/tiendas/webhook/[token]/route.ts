import { webhook } from "@/modules/stock/server";

export const dynamic = "force-dynamic";

/**
 * Aviso de una tienda (pedido pagado, cancelado o devuelto). La URL lleva el
 * token secreto de la tienda; el pedido se procesa una sola vez aunque llegue
 * repetido (§2.q etapa 7).
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const text = await req.text();
  if (text.length > 256 * 1024) return new Response("Demasiado grande", { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }
  const r = await webhook(token, body);
  if (!r) return new Response("No encontrado", { status: 404 });
  return Response.json({ ok: true, ...r });
}
