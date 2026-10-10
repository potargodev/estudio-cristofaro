"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { clientIp } from "@/lib/rate-limit";
import { isLegalKey, type LegalKey } from "@/modules/legal/catalog";
import { recordAcceptance } from "@/modules/legal/server";

/** Acepta la versión vigente de los documentos elegidos (el usuario sale de la sesión) */
export async function acceptLegalAction(fd: FormData) {
  const user = await getCurrentUser();
  if (!user || user.assisted) redirect("/ingresar");
  const docs = fd.getAll("doc").filter(isLegalKey) as LegalKey[];
  if (docs.length) await recordAcceptance(user, docs, clientIp(await headers()));
  revalidatePath("/", "layout");
  const back = String(fd.get("back") ?? "");
  redirect(/^\/[a-z0-9/_-]*$/i.test(back) && !back.startsWith("//") ? back : "/");
}
