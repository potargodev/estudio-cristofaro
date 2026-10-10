"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { plan_requests, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireTenantOwner } from "@/lib/auth";
import { esc, sendMail } from "@/lib/email";
import { getEntitlements, getPlans } from "@/lib/faro/entitlements";
import { isFaroModuleKey } from "@/modules/registry";
import { mailLayout } from "@/lib/notify";
import { getSiteUrl } from "@/lib/runtime-config";

/**
 * "Quiero mejorar mi plan": queda un pedido para el Faro Manager (el cobro
 * llega en la F7). Solo el dueño del tenant, a un plan de su mismo tipo.
 */
export async function requestPlanUpgrade(fd: FormData) {
  const me = await requireTenantOwner();
  const back = String(fd.get("back") ?? "/admin/plan");
  const safeBack = back === "/personal/plan" || /^\/admin\/[a-z0-9/-]+$/.test(back) ? back : "/admin/plan";
  const e = (await getEntitlements(me.studioId))!;
  const to = (await getPlans()).find((p) => p.key === String(fd.get("plan") ?? "") && p.kind === e.tenant.kind);
  const moduleKey = String(fd.get("module") ?? "");
  if (!to || to.key === e.plan.key) redirect(`${safeBack}?pedido=error`);
  const db = getDb();
  const [dup] = await db
    .select({ id: plan_requests.id })
    .from(plan_requests)
    .where(and(eq(plan_requests.studio_id, me.studioId), eq(plan_requests.to_plan, to!.key), eq(plan_requests.status, "pendiente")));
  if (!dup) {
    const [r] = await db
      .insert(plan_requests)
      .values({
        studio_id: me.studioId,
        from_plan: e.plan.key,
        to_plan: to!.key,
        module_key: isFaroModuleKey(moduleKey) ? moduleKey : null,
        message: String(fd.get("message") ?? "").trim().slice(0, 1000) || null,
        requested_by: me.id,
      })
      .returning({ id: plan_requests.id });
    await audit({ studioId: me.studioId, actor: me, action: "plan.mejora_pedido", entityType: "pedido_plan", entityId: r.id, metadata: { de: e.plan.key, a: to!.key, modulo: moduleKey || null } });
    const team = await db.select({ email: users.email }).from(users).where(isNotNull(users.faroRole));
    if (team.length)
      await sendMail({
        to: team.map((t) => t.email),
        subject: `${e.tenant.name} quiere pasar a ${to!.name}`,
        html: mailLayout(
          "Pedido de cambio de plan",
          `<p><strong>${esc(e.tenant.name)}</strong> (${esc(me.email)}) pidió pasar de ${esc(e.plan.name)} a <strong>${esc(to!.name)}</strong>.</p>`,
          { href: `${getSiteUrl()}/faro-manager/${me.studioId}`, label: "Ver el tenant" },
          "Faro",
        ),
      });
  }
  redirect(`${safeBack}?pedido=1`);
}
