"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getAuth } from "@/lib/auth-server";
import { homeFor, isStudioRole } from "@/lib/roles";

export interface ChangeState {
  ok: boolean;
  message?: string;
}

/** Cambio obligatorio después de una contraseña temporal (scripts/reset-password.ts) */
export async function changeTemporaryPassword(_prev: ChangeState, fd: FormData): Promise<ChangeState> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (!isStudioRole(user.role) && user.role !== "autonomo") redirect(homeFor(user.role));
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (next.length < 10) return { ok: false, message: "La contraseña nueva tiene que tener al menos 10 caracteres." };
  if (next !== confirm) return { ok: false, message: "Las contraseñas nuevas no coinciden." };
  if (next === current) return { ok: false, message: "Elegí una contraseña distinta de la temporal." };
  try {
    await getAuth().api.changePassword({
      body: { currentPassword: current, newPassword: next, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch {
    return { ok: false, message: "La contraseña temporal no es correcta." };
  }
  await getDb().update(users).set({ mustChangePassword: false }).where(eq(users.id, user.id));
  redirect("/admin");
}
