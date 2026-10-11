import { invoicePdf } from "@/modules/arca/pdf";
import { invoiceByToken, settingsForInvoice } from "@/modules/arca/server";
import { fullNumber } from "@/modules/arca/calc";
import { CBTE_TYPES } from "@/modules/arca/config";

// Link para compartir un comprobante autorizado: token aleatorio que quien
// emite puede desactivar o regenerar. Solo comprobantes autorizados.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const inv = await invoiceByToken((await params).token);
  if (!inv) return new Response("Este link no existe o fue desactivado.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const pdf = await invoicePdf(inv, await settingsForInvoice(inv));
  const name = `${CBTE_TYPES[inv.cbte_type].short}-${fullNumber(inv.point_of_sale, inv.number)}.pdf`;
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex" } });
}
