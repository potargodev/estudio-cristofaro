import { INVOICE_BODY } from "@/modules/api/core";
import { apiError, withApi } from "@/modules/api/http";
import { apiCreateInvoice, apiInvoices, idempotent, requireScope } from "@/modules/api/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withApi(req, async (a) => ({ body: await apiInvoices(a, new URL(req.url).searchParams) }));
}

/** Crea un comprobante. Obligatorio: Idempotency-Key (el mismo pedido repetido no crea otro). */
export async function POST(req: Request) {
  const raw = await req.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return apiError(400, "json", "El cuerpo no es un JSON válido.");
  }
  const b = INVOICE_BODY.safeParse(parsed);
  if (!b.success) return apiError(400, "validacion", b.error.issues.map((i) => `${i.path.join(".") || "cuerpo"}: ${i.message}`).join("; "));
  const key = req.headers.get("idempotency-key");
  return withApi(req, async (a) => {
    requireScope(a, "comprobantes:emitir");
    const r = await idempotent(a, key, raw, () => apiCreateInvoice(a, b.data, key!));
    return { status: r.status, body: r.body, headers: (r.replayed ? { "Idempotent-Replayed": "true" } : {}) as Record<string, string> };
  });
}
