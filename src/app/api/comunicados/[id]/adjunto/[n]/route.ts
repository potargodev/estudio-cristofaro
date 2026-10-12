import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { announcement_reads, announcements } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { readStored } from "@/lib/uploads";
import { canSeePayroll, viewerFor } from "@/modules/payroll/access";

export const dynamic = "force-dynamic";
const nf = () => new Response("No encontrado", { status: 404 });

/** Adjunto de un comunicado: sus destinatarios, el estudio o quien ve sueldos en la organización */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const me = await getSessionUser();
  if (!me) return new Response("No autorizado", { status: 401 });
  if (!isUuid(id)) return nf();
  const [a] = await getDb().select().from(announcements).where(and(eq(announcements.id, id), eq(announcements.studio_id, me.studioId)));
  const file = a?.attachments[Number(n)];
  if (!a || !file) return nf();
  const v = await viewerFor(a.organization_id, a.studio_id);
  if (!v) return nf();
  let allowed = canSeePayroll(v);
  if (!allowed && v.employeeId) allowed = (await getDb().select().from(announcement_reads).where(and(eq(announcement_reads.announcement_id, a.id), eq(announcement_reads.employee_id, v.employeeId)))).length > 0;
  if (!allowed) return nf();
  const { data } = await readStored(file.path).catch(() => ({ data: null as Buffer | null }));
  if (!data) return nf();
  return new Response(new Uint8Array(data), { headers: { "Content-Type": file.mime, "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`, "Cache-Control": "private, no-store" } });
}
