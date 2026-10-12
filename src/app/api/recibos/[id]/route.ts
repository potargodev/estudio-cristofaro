import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payslips } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { readStored } from "@/lib/uploads";
import { canSeePayroll, viewerFor } from "@/modules/payroll/access";

export const dynamic = "force-dynamic";
const nf = () => new Response("No encontrado", { status: 404 });

/** Recibo de sueldo: el empleado dueño (publicado), el estudio o quien ve sueldos en la organización. Si no, 404 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getSessionUser();
  if (!me) return new Response("No autorizado", { status: 401 });
  if (!isUuid(id)) return nf();
  const [p] = await getDb().select().from(payslips).where(and(eq(payslips.id, id), eq(payslips.studio_id, me.studioId)));
  if (!p) return nf();
  const v = await viewerFor(p.organization_id, p.studio_id);
  const own = !!v?.employeeId && p.employee_id === v.employeeId && ["publicado", "conforme", "no_conforme"].includes(p.status);
  if (!v || (!own && !canSeePayroll(v))) {
    await audit({ studioId: me.studioId, organizationId: p.organization_id, actor: me, action: "recibo.descargar", entityType: "recibo", entityId: p.id, result: "denegado" });
    return nf();
  }
  if (own && !p.viewed_at) await getDb().update(payslips).set({ viewed_at: new Date() }).where(eq(payslips.id, p.id));
  const { data } = await readStored(p.storage_path).catch(() => ({ data: null as Buffer | null }));
  if (!data) return nf();
  await audit({ studioId: me.studioId, organizationId: p.organization_id, actor: me, action: "recibo.descargar", entityType: "recibo", entityId: p.id });
  return new Response(new Uint8Array(data), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="recibo-${p.period}.pdf"`, "Cache-Control": "private, no-store" } });
}
