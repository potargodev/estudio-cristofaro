"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { getAuth } from "@/lib/auth-server";
import { getPlan, type TenantKind } from "@/lib/faro/plans";
import { createTenant } from "@/lib/faro/tenants";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Autoregistro público de Faro: un estudio o contador (tenant studio, plan
// Señal) o un autónomo (tenant personal, plan Destello). Sin pagos: los planes
// pagos se activan después desde el Faro Manager.

export interface RegisterState {
  ok: boolean;
  message?: string;
  field?: string;
  /** Lo que cargó la persona (sin contraseñas), para no perderlo si hay un error */
  values?: Record<string, string>;
}

const v = (fd: FormData, k: string) => {
  const x = fd.get(k);
  return typeof x === "string" ? x.trim() : "";
};

export async function registerTenant(_prev: RegisterState, fd: FormData): Promise<RegisterState> {
  const values = Object.fromEntries(["studio_name", "name", "cuit", "email", "terms"].map((k) => [k, v(fd, k)]));
  const r = await register(fd);
  return r.ok ? r : { ...r, values };
}

async function register(fd: FormData): Promise<RegisterState> {
  // Honeypot: los bots completan el campo oculto
  if (v(fd, "empresa_web")) return { ok: true };
  const h = await headers();
  if (!rateLimit(`registro:${clientIp(h)}`, 5, 3600_000)) return { ok: false, message: "Hiciste muchos intentos. Esperá un rato y volvé a probar." };
  const kind: TenantKind = v(fd, "kind") === "personal" ? "personal" : "studio";
  if (fd.get("terms") !== "on") return { ok: false, field: "terms", message: "Para crear la cuenta tenés que aceptar los términos y la política de privacidad." };
  const email = v(fd, "email").toLowerCase();
  const password = v(fd, "password");
  if (password !== v(fd, "password2")) return { ok: false, field: "password2", message: "Las contraseñas no coinciden." };
  const name = kind === "studio" ? v(fd, "studio_name") : v(fd, "name");
  const plan = kind === "studio" ? "senal" : "destello";
  const r = await createTenant({ kind, name, planKey: plan, cuit: v(fd, "cuit") || null, owner: { name: v(fd, "name"), email, password }, via: "registro" });
  if (!r.ok) return { ok: false, message: r.message };
  await audit({
    studioId: r.studioId,
    actor: { id: r.userId, email },
    action: "faro.registro",
    entityType: "tenant",
    entityId: r.studioId,
    metadata: { tipo: kind, plan: getPlan(plan)?.name, interes: v(fd, "interes") || null },
  });
  // Entra directo: el estudio pasa por el segundo factor obligatorio; el autónomo, a su panel
  try {
    await getAuth().api.signInEmail({ body: { email, password }, headers: h });
  } catch (error) {
    console.error("[registro] login automático", error);
    redirect(kind === "studio" ? "/admin/login" : "/ingresar");
  }
  redirect(kind === "studio" ? "/admin/seguridad?bienvenida=1" : "/personal?bienvenida=1");
}
