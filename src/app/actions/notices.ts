"use server";

import { getSessionUser } from "@/lib/auth";
import { markNoticesRead } from "@/modules/notifications/server";

/** Marca como leídos los avisos del usuario de la sesión */
export async function markNoticesReadAction() {
  const me = await getSessionUser();
  if (!me) return;
  await markNoticesRead(me.id);
}
