"use server";

import { and, eq, inArray, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { obligations } from "@/db/schema";
import { audit, requestIp } from "@/lib/audit";
import { requireStaff } from "@/lib/auth";
import { isUuid } from "@/lib/ids";

const ALLOWED = ["presentado", "pagado"] as const;

/**
 * Acción en lote de /admin/vencimientos: marca como presentados o pagados los
 * vencimientos elegidos. Solo toca los del estudio de la sesión (los ids que
 * vengan del navegador y no sean del estudio se ignoran) y deja auditoría por
 * cada uno.
 */
export async function setObligationsStatus(fd: FormData) {
  const staff = await requireStaff();
  const status = String(fd.get("status") ?? "");
  const back = String(fd.get("back") ?? "/admin/vencimientos");
  const safeBack = back.startsWith("/admin/vencimientos") ? back : "/admin/vencimientos";
  const ids = fd
    .getAll("ids")
    .map(String)
    .filter((id) => isUuid(id))
    .slice(0, 500);
  if (!(ALLOWED as readonly string[]).includes(status) || ids.length === 0) redirect(safeBack);

  const target = status as (typeof ALLOWED)[number];
  // "Pagado" no vuelve a "presentado"
  const skip = target === "presentado" ? (["presentado", "pagado"] as const) : (["pagado"] as const);
  const updated = await getDb()
    .update(obligations)
    .set({ status: target })
    .where(and(eq(obligations.studio_id, staff.studioId), inArray(obligations.id, ids), notInArray(obligations.status, [...skip])))
    .returning({ id: obligations.id, org: obligations.organization_id, tax: obligations.tax, period: obligations.period });

  const ip = await requestIp();
  await Promise.all(
    updated.map((o) =>
      audit({
        studioId: staff.studioId,
        organizationId: o.org,
        actor: staff,
        action: "vencimientos.estado",
        entityType: "obligation",
        entityId: o.id,
        metadata: { estado: target, impuesto: o.tax, periodo: o.period, en_lote: ids.length > 1 },
        ip,
      }),
    ),
  );
  revalidatePath("/admin/vencimientos");
  revalidatePath("/admin");
  const sep = safeBack.includes("?") ? "&" : "?";
  redirect(`${safeBack}${sep}guardado=${updated.length}`);
}
