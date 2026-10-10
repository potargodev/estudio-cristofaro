"use server";

import { isNotNull } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { esc, sendMail } from "@/lib/email";
import { mailLayout } from "@/lib/notify";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export interface DemoState {
  ok: boolean;
  message?: string;
}

const v = (fd: FormData, k: string) => {
  const x = fd.get(k);
  return typeof x === "string" ? x.trim() : "";
};

/** "Agendar una demo": le llega al equipo de Faro (y queda en la auditoría de plataforma) */
export async function requestDemo(_prev: DemoState, fd: FormData): Promise<DemoState> {
  if (v(fd, "empresa_web")) return { ok: true, message: "Listo." };
  const ip = clientIp(await headers());
  if (!rateLimit(`demo:${ip}`, 3, 3600_000)) return { ok: false, message: "Ya recibimos tu pedido. Te escribimos pronto." };
  const name = v(fd, "name").slice(0, 120);
  const email = v(fd, "email").toLowerCase();
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Completá tu nombre y un email válido." };
  const kind = ["estudio", "contador", "empresa", "otro"].includes(v(fd, "kind")) ? v(fd, "kind") : "otro";
  const size = v(fd, "size").slice(0, 40);
  const message = v(fd, "message").slice(0, 1500);
  await audit({ studioId: null, actorLabel: email, action: "faro.demo_pedido", entityType: "demo", metadata: { nombre: name, tipo: kind, tamano: size || null } });
  const team = await getDb().select({ email: users.email }).from(users).where(isNotNull(users.faroRole));
  if (team.length)
    await sendMail({
      to: team.map((t) => t.email),
      subject: `Pedido de demo: ${name}`,
      html: mailLayout("Pedido de demo", `<p><strong>${esc(name)}</strong> (${esc(email)}) pidió una demo de Faro.</p><p>Tipo: ${esc(kind)}${size ? ` · ${esc(size)}` : ""}</p>${message ? `<p>${esc(message)}</p>` : ""}`, undefined, "Faro"),
    }).catch(() => undefined);
  return { ok: true, message: "¡Gracias! Te escribimos en un día hábil para coordinar una demo de 30 minutos." };
}
