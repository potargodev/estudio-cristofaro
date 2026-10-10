"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { studios } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { RedError, requestProposal } from "@/modules/red/server";

export interface ProposalState {
  ok: boolean;
  message?: string;
  /** Lo que cargó la persona, para no perderlo si hay un error */
  values?: Record<string, string>;
}

const v = (fd: FormData, k: string) => {
  const x = fd.get(k);
  return typeof x === "string" ? x.trim() : "";
};
const PROFILES = ["monotributista", "responsable_inscripto", "sociedad", "empleador", "relacion_dependencia", "otro"];

/** "Pedir propuesta" desde la ficha pública: el estudio se busca por su slug, nunca por un id del navegador */
export async function requestProposalAction(_prev: ProposalState, fd: FormData): Promise<ProposalState> {
  const r = await send(fd);
  return r.ok ? r : { ...r, values: Object.fromEntries(["name", "email", "phone", "profile", "message", "consent"].map((k) => [k, v(fd, k)])) };
}

async function send(fd: FormData): Promise<ProposalState> {
  if (v(fd, "empresa_web")) return { ok: true, message: "Listo." };
  if (!rateLimit(`red:${clientIp(await headers())}`, 5, 3600_000)) return { ok: false, message: "Mandaste varios pedidos seguidos. Probá más tarde." };
  if (fd.get("consent") !== "on") return { ok: false, message: "Para mandar el pedido tenés que aceptar compartir estos datos con el estudio." };
  const name = v(fd, "name");
  const email = v(fd, "email").toLowerCase();
  if (name.length < 2) return { ok: false, message: "Completá tu nombre." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Revisá el email." };
  const [st] = await getDb().select({ id: studios.id, kind: studios.kind }).from(studios).where(eq(studios.slug, v(fd, "studio")));
  if (!st || st.kind !== "studio") return { ok: false, message: "Ese estudio no está disponible en la Red." };
  const user = await getCurrentUser().catch(() => null);
  try {
    await requestProposal({
      studioId: st.id,
      name,
      email,
      phone: v(fd, "phone"),
      profile: PROFILES.includes(v(fd, "profile")) ? v(fd, "profile") : undefined,
      message: v(fd, "message"),
      userId: user && !user.assisted ? user.id : null,
    });
  } catch (e) {
    if (e instanceof RedError) return { ok: false, message: e.message };
    throw e;
  }
  return { ok: true, message: "Listo: le mandamos tu pedido al estudio. Te va a escribir a tu mail." };
}
