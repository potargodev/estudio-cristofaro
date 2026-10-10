"use server";

import { headers } from "next/headers";
import { getDb } from "@/db";
import { help_feedback } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { ARTICLES } from "@/modules/help/catalog";

export interface FeedbackState {
  ok: boolean;
  message?: string;
}

/** "¿Te sirvió?": sí/no y un comentario opcional, por artículo. Abierto a cualquiera (con límite por IP) */
export async function sendHelpFeedback(_prev: FeedbackState, fd: FormData): Promise<FeedbackState> {
  const article = String(fd.get("article") ?? "");
  const vote = String(fd.get("helpful") ?? "");
  if (!ARTICLES.some((a) => a.id === article) || (vote !== "si" && vote !== "no")) return { ok: false, message: "Elegí sí o no." };
  if (!rateLimit(`ayuda:${clientIp(await headers())}`, 20, 3600_000)) return { ok: false, message: "Recibimos muchas respuestas seguidas. Probá más tarde." };
  const user = await getCurrentUser().catch(() => null);
  const comment = String(fd.get("comment") ?? "").trim().slice(0, 1000) || null;
  await getDb()
    .insert(help_feedback)
    .values({ article_id: article, helpful: vote === "si", comment, user_id: user && !user.assisted ? user.id : null, studio_id: user && !user.assisted ? user.studioId : null });
  return { ok: true, message: vote === "si" ? "¡Gracias! Nos alegra que te haya servido." : "Gracias por avisarnos: lo vamos a mejorar." };
}
