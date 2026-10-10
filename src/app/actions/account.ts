"use server";

import { isNotNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { esc, sendMail } from "@/lib/email";
import { mailLayout } from "@/lib/notify";
import { getSiteUrl } from "@/lib/runtime-config";

/** Pedido de baja de la cuenta: queda en la auditoría y le llega al equipo de Faro, que la cierra después de ofrecer la exportación */
export async function requestAccountClosureAction(fd: FormData) {
  const me = await getCurrentUser();
  if (!me || me.assisted) redirect("/ingresar");
  const back = me.role === "titular" ? "/personal/cuenta" : "/admin/cuenta";
  if (fd.get("confirm") !== "on") redirect(`${back}?baja=error`);
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 1000) || null;
  await audit({ studioId: me.studioId, actor: me, action: "cuenta.baja_pedido", entityType: "usuario", entityId: me.id, metadata: { motivo: reason, rol: me.role } });
  const team = await getDb().select({ email: users.email }).from(users).where(isNotNull(users.faroRole));
  if (team.length)
    await sendMail({
      to: team.map((t) => t.email),
      subject: `Pedido de baja de cuenta: ${me.email}`,
      html: mailLayout("Pedido de baja", `<p><strong>${esc(me.name)}</strong> (${esc(me.email)}) pidió dar de baja su cuenta.${reason ? ` Motivo: ${esc(reason)}` : ""}</p>`, { href: `${getSiteUrl()}/faro-manager/${me.studioId}`, label: "Ver el tenant" }, "Faro"),
    }).catch(() => undefined);
  redirect(`${back}?baja=1`);
}
