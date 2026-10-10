import { NextResponse } from "next/server";
import { isIndustryKey } from "@/modules/industries/catalog";

/** Selector de rubro (form GET): lleva a la vista previa de la plantilla elegida */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rubro = new URL(request.url).searchParams.get("rubro");
  const base = new URL(request.url);
  base.search = "";
  base.pathname = isIndustryKey(rubro) && /^[0-9a-f-]{36}$/i.test(id) ? `/admin/organizaciones/${id}/rubro/${rubro}` : `/admin/organizaciones/${id}`;
  return NextResponse.redirect(base);
}
