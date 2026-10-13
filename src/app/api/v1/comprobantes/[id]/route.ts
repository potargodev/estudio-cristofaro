import { withApi } from "@/modules/api/http";
import { apiInvoice } from "@/modules/api/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApi(req, async (a) => ({ body: await apiInvoice(a, id) }));
}
