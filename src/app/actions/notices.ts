"use server";

import { getCurrentUser } from "@/lib/auth";
import { markNoticesRead } from "@/modules/notifications/server";

/** Marca como leídos los avisos del usuario de la sesión */
export async function markNoticesReadAction() {
  const me = await getCurrentUser();
  if (!me) return;
  await markNoticesRead(me.id);
}
