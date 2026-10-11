import { getCurrentUser } from "@/lib/auth";
import { invoicePdf } from "@/modules/arca/pdf";
import { ArcaError, getInvoice, orgIssuer, personalIssuer, settingsForInvoice } from "@/modules/arca/server";
import { fullNumber } from "@/modules/arca/calc";
import { CBTE_TYPES } from "@/modules/arca/config";

// PDF de un comprobante (también el borrador, marcado): solo para quien emite.
// ?org= es una organización del estudio de la sesión (se valida).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sin sesión", { status: 401 });
  const org = new URL(req.url).searchParams.get("org");
  try {
    const scope = org ? await orgIssuer(user, org) : await personalIssuer(user);
    const inv = await getInvoice(scope, (await params).id);
    if (!inv) return new Response("No encontrado", { status: 404 });
    const pdf = await invoicePdf(inv, await settingsForInvoice(inv));
    const name = `${CBTE_TYPES[inv.cbte_type].short}-${fullNumber(inv.point_of_sale, inv.number)}.pdf`;
    return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof ArcaError) return new Response("No encontrado", { status: 404 });
    throw e;
  }
}
