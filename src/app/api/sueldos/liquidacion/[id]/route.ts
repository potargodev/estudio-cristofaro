import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payroll_runs } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { can } from "@/lib/permissions";
import { exportRun, LiquidacionError } from "@/modules/liquidacion/server";
import { viewerFor } from "@/modules/payroll/access";

export const dynamic = "force-dynamic";
const FORMATS = ["lsd", "f931", "banco_csv", "banco_txt"] as const;

/** Archivos de una liquidación aprobada (LSD, F.931, acreditación): el estudio o quien gestiona sueldos en la organización */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getSessionUser();
  if (!me) return new Response("No autorizado", { status: 401 });
  const format = new URL(req.url).searchParams.get("formato") as (typeof FORMATS)[number];
  if (!isUuid(id) || !FORMATS.includes(format)) return new Response("No encontrado", { status: 404 });
  const [run] = await getDb().select({ org: payroll_runs.organization_id, studio: payroll_runs.studio_id }).from(payroll_runs).where(and(eq(payroll_runs.id, id), eq(payroll_runs.studio_id, me.studioId)));
  const v = run ? await viewerFor(run.org, run.studio) : null;
  if (!run || !v || !(v.studio || (v.role && can(v.role, "sueldos.gestionar")))) {
    await audit({ studioId: me.studioId, actor: me, action: "sueldos.exportar", entityType: "liquidacion", entityId: id, result: "denegado" });
    return new Response("No encontrado", { status: 404 });
  }
  try {
    const out = await exportRun({ studioId: run.studio, organizationId: run.org, canManage: true, fromStudio: v.studio }, me, id, format);
    return new Response(out.body, { headers: { "Content-Type": `${out.type}; charset=utf-8`, "Content-Disposition": `attachment; filename="${out.name}"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof LiquidacionError) return new Response(e.message, { status: 409 });
    throw e;
  }
}
