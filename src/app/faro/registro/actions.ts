"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { signup_requests, studios, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { AUTH_ERRORS, getAuth, googleEnabled, googleSignInUrl, type AuthErrorCode } from "@/lib/auth-server";
import { DEFAULT_PLAN, getPlan, type TenantKind } from "@/lib/faro/plans";
import { createTenant, EMAIL_RE, normalizeCuit } from "@/lib/faro/tenants";
import { LEGAL_VERSION } from "@/lib/faro/legal-version";
import { BASE_DOCS } from "@/modules/legal/catalog";
import { recordAcceptance } from "@/modules/legal/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Autoregistro público de Faro: un estudio o contador (tenant studio, plan
// Inicial), un autónomo (tenant personal, plan Autónomos Gratis) o una persona (plan Personas Gratis). Sin pagos: los planes
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
  const values = Object.fromEntries(["studio_name", "name", "cuit", "email", "terms", "tax_regime"].map((k) => [k, v(fd, k)]));
  const r = await register(fd);
  return r.ok ? r : { ...r, values };
}

async function register(fd: FormData): Promise<RegisterState> {
  // Honeypot: los bots completan el campo oculto
  if (v(fd, "empresa_web")) return { ok: true };
  const h = await headers();
  if (!rateLimit(`registro:${clientIp(h)}`, 5, 3600_000)) return { ok: false, message: "Hiciste muchos intentos. Esperá un rato y volvé a probar." };
  const k = v(fd, "kind");
  const kind: TenantKind = k === "personal" || k === "persona" ? k : "studio";
  if (fd.get("terms") !== "on") return { ok: false, field: "terms", message: "Para crear la cuenta tenés que aceptar los términos y la política de privacidad." };
  const email = v(fd, "email").toLowerCase();
  if (kind !== "studio") return passwordless(fd, kind, email, h);
  const password = v(fd, "password");
  if (password !== v(fd, "password2")) return { ok: false, field: "password2", message: "Las contraseñas no coinciden." };
  const name = kind === "studio" ? v(fd, "studio_name") : v(fd, "name");
  const plan = DEFAULT_PLAN[kind];
  const r = await createTenant({ kind, name, planKey: plan, cuit: v(fd, "cuit") || null, owner: { name: v(fd, "name"), email, password }, via: "registro" });
  if (!r.ok) return { ok: false, message: r.message };
  await recordAcceptance({ id: r.userId, email, studioId: r.studioId }, BASE_DOCS, clientIp(h));
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

/**
 * Persona o autónomo: sin contraseña. Se guarda el pedido de alta y la cuenta
 * se crea recién cuando la persona vuelve de Google o del enlace del mail
 * (hook de Better Auth en auth-server.ts), así el email queda verificado.
 */
async function passwordless(fd: FormData, kind: TenantKind, email: string, h: Headers): Promise<RegisterState> {
  if (!EMAIL_RE.test(email)) return { ok: false, field: "email", message: "Revisá el email." };
  const name = v(fd, "name").slice(0, 120);
  if (name.length < 2) return { ok: false, field: "name", message: "Completá tu nombre." };
  let cuit: string | null = null;
  if (kind === "personal") {
    cuit = normalizeCuit(v(fd, "cuit"));
    if (!cuit) return { ok: false, field: "cuit", message: "Revisá el CUIT: tiene que tener 11 números y el dígito verificador correcto." };
  }
  const db = getDb();
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (taken) return { ok: false, field: "email", message: "Ya hay una cuenta con ese email. Ingresá desde «Ingresar»." };
  if (cuit) {
    const [dup] = await db.select({ id: studios.id, kind: studios.kind }).from(studios).where(eq(studios.cuit, cuit));
    if (dup && dup.kind !== "studio") return { ok: false, field: "cuit", message: "Ya hay una cuenta de autónomo con ese CUIT." };
  }
  const taxRegime = v(fd, "tax_regime") === "responsable_inscripto" ? "responsable_inscripto" : "monotributo";
  await db.insert(signup_requests).values({
    email,
    kind,
    name,
    cuit,
    data: { ...(kind === "personal" ? { taxRegime } : {}), interes: v(fd, "interes") || null },
    terms_version: LEGAL_VERSION,
    expires_at: new Date(Date.now() + 3600_000),
  });
  await audit({ studioId: null, actorLabel: email, action: "faro.registro_pedido", entityType: "registro", metadata: { tipo: kind, metodo: v(fd, "method") || "enlace" } });
  const callbackURL = "/bienvenida";
  if (v(fd, "method") === "google" && googleEnabled()) {
    const url = await googleSignInUrl(callbackURL, "/faro/registro", h);
    if (url) redirect(url);
    return { ok: false, message: "No pudimos abrir Google. Probá con el enlace por mail." };
  }
  try {
    await getAuth().api.signInMagicLink({ body: { email, callbackURL, errorCallbackURL: "/faro/registro" }, headers: h });
  } catch (error) {
    const code = (error as { body?: { code?: string } }).body?.code;
    if (code === "MAIL_NO_ENVIADO")
      return { ok: false, message: googleEnabled() ? "Ahora no pudimos mandar el mail. Probá con «Continuar con Google»." : "Ahora no pudimos mandar el mail. Probá de nuevo en un rato." };
    console.error("[registro] enlace", error);
    return { ok: false, message: code && code in AUTH_ERRORS ? AUTH_ERRORS[code as AuthErrorCode] : "No pudimos mandarte el enlace. Probá de nuevo." };
  }
  return { ok: true, message: `Te mandamos un enlace a ${email}. Abrilo desde este dispositivo: vence en 15 minutos y con él se activa tu cuenta.` };
}
