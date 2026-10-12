"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireFaro } from "@/lib/auth";
import { auditDemo, resetDemo, seedDemo } from "@/modules/demo";
import { endViewAs, startViewAs, ViewAsError } from "@/modules/demo/view-as";

// Demo de la plataforma (solo faro_owner): cargar o borrar los espacios de
// demostración. Las contraseñas vuelven una sola vez en la respuesta de la
// acción: no se guardan en ningún lado ni quedan en la auditoría.

export interface DemoActionState {
  ok?: string;
  error?: string;
  credentials?: { label: string; email: string; password: string; home: string; what: string }[];
}

export async function seedDemoAction(_: DemoActionState): Promise<DemoActionState> {
  const me = await requireFaro(true);
  try {
    const db = getDb();
    const { state, credentials } = await seedDemo(db);
    await auditDemo(db, "demo.cargada", { id: me.id, label: me.email }, { espacios: state.studios, usuarios: state.users });
    revalidatePath("/faro-manager", "layout");
    return { ok: `Demo cargada: ${state.studios} espacios y ${state.users} usuarios.`, credentials: credentials.map((c) => ({ label: c.label, email: c.email, password: c.password, home: c.home, what: c.what })) };
  } catch (e) {
    console.error("[demo] seed", e);
    return { error: "No se pudo cargar la demo. Mirá el log del servidor." };
  }
}

export async function resetDemoAction(_: DemoActionState): Promise<DemoActionState> {
  const me = await requireFaro(true);
  const db = getDb();
  const before = await resetDemo(db);
  await auditDemo(db, "demo.borrada", { id: me.id, label: me.email }, { espacios: before.studios, usuarios: before.users });
  revalidatePath("/faro-manager", "layout");
  return { ok: before.loaded ? `Demo borrada: ${before.studios} espacios y ${before.users} usuarios.` : "No había demo cargada." };
}

/** «Ver como…»: entra con la sesión de un usuario de la demo (solo faro_owner) */
export async function viewAsAction(fd: FormData) {
  const me = await requireFaro(true);
  let href: string;
  try {
    href = await startViewAs(me, String(fd.get("userId") ?? ""));
  } catch (e) {
    if (!(e instanceof ViewAsError)) throw e;
    redirect(`/faro-manager/demo?error=${encodeURIComponent(e.message)}`);
  }
  redirect(href);
}

/** Vuelve al usuario de Faro (un clic desde la franja «Viendo como…») */
export async function endViewAsAction() {
  redirect(await endViewAs());
}
