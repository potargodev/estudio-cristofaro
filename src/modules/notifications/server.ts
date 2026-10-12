import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { UUID } from "@/lib/ids";

// Avisos dentro de la app (campanita). Cada aviso es de una sola persona:
// toda lectura y toda marca filtra por el usuario de la sesión.

interface NewNotice {
  kind: "gasto" | "pago" | "grupo" | "mensaje" | "fiscal" | "aviso";
  title: string;
  body?: string | null;
  href?: string | null;
  refId?: string | null;
}


export async function notify(userIds: (string | null | undefined)[], n: NewNotice) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  await getDb()
    .insert(notifications)
    .values(ids.map((user_id) => ({ user_id, kind: n.kind, title: n.title.slice(0, 160), body: n.body?.slice(0, 300) ?? null, href: n.href ?? null, ref_id: n.refId ?? null })));
}

export async function listNotices(userId: string, limit = 20) {
  return getDb().select().from(notifications).where(eq(notifications.user_id, userId)).orderBy(desc(notifications.created_at)).limit(limit);
}

export async function unreadNotices(userId: string) {
  const [r] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.user_id, userId), isNull(notifications.read_at)));
  return r?.n ?? 0;
}

/** Marca como leídos (todos, o los ids dados, siempre solo los del usuario) */
export async function markNoticesRead(userId: string, ids?: string[]) {
  const valid = ids?.filter((x) => UUID.test(x));
  if (ids && !valid?.length) return;
  await getDb()
    .update(notifications)
    .set({ read_at: new Date() })
    .where(and(eq(notifications.user_id, userId), isNull(notifications.read_at), valid ? inArray(notifications.id, valid) : undefined));
}
