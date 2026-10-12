import { readBodyLimited, tooLarge, tooMany, webhookAllowed } from "@/lib/http";
import { handleWebhook } from "@/modules/tango-sync/server";

export const dynamic = "force-dynamic";

/**
 * Avisos de Tango (webhooks): cada estudio tiene su URL y su secreto.
 * Firma: X-Tango-Signature = "sha256=" + HMAC-SHA256(secreto, cuerpo) en hex.
 */
export async function POST(request: Request, { params }: { params: Promise<{ link: string }> }) {
  const { link } = await params;
  if (!webhookAllowed(request, "tango", 120)) return tooMany();
  const body = await readBodyLimited(request, 1_000_000);
  if (body === null) return tooLarge();
  const r = await handleWebhook(link, body, request.headers.get("x-tango-signature"));
  return Response.json({ ok: r.status < 300, result: "result" in r ? r.result : undefined }, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
