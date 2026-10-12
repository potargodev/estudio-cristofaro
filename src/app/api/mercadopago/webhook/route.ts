import { type NextRequest } from "next/server";
import { readBodyLimited, tooLarge, tooMany, webhookAllowed } from "@/lib/http";
import { handleWebhook } from "@/modules/billing/collect";

export const dynamic = "force-dynamic";

/**
 * Webhooks de Mercado Pago. ?cuenta=faro (suscripciones de Faro) o el id del
 * tenant que cobra. La firma x-signature se valida con el secreto de esa
 * cuenta y el pago se consulta a Mercado Pago antes de aplicarlo.
 */
export async function POST(req: NextRequest) {
  if (!webhookAllowed(req, "mercadopago", 120)) return tooMany();
  const q = req.nextUrl.searchParams;
  const text = await readBodyLimited(req, 64 * 1024);
  if (text === null) return tooLarge();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text || "{}");
  } catch {
    body = {};
  }
  const b = body as { type?: string; topic?: string; data?: { id?: string | number } };
  const r = await handleWebhook({
    account: q.get("cuenta") ?? "",
    topic: q.get("type") ?? q.get("topic") ?? b.type ?? b.topic ?? null,
    dataId: q.get("data.id") ?? q.get("id") ?? (b.data?.id != null ? String(b.data.id) : null),
    requestId: req.headers.get("x-request-id"),
    signature: req.headers.get("x-signature"),
    body,
  });
  return Response.json({ result: r.result }, { status: r.status });
}
