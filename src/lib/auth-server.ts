import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, magicLink, twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, sessions, two_factors, users, verifications } from "@/db/schema";
import { audit } from "./audit";
import { esc, sendMail } from "./email";
import { mailLayout } from "./notify";
import { getSiteUrl } from "./runtime-config";
import { acceptInvitationsFor, hasAccessByEmail } from "./team";
import { finalizePersonalTenant, pendingSignup, tenantFromSignup } from "./faro/tenants";
import { BASE_DOCS } from "@/modules/legal/catalog";
import { recordAcceptance } from "@/modules/legal/server";

// Acceso a la plataforma:
// - Estudio (admin y contador): email y contraseña + segundo factor (TOTP)
//   obligatorio. No pueden entrar con Google ni con enlace por mail.
// - Clientes (miembros de organizaciones): Google o enlace mágico por mail. Sin
//   registro público: el email tiene que tener una invitación vigente o una
//   membresía activa; si no, se rechaza con un mensaje claro. Al entrar se
//   aceptan sus invitaciones pendientes.

/**
 * Orígenes desde los que se acepta login: el de BETTER_AUTH_URL, el de SITE_URL
 * y los que se agreguen en BETTER_AUTH_TRUSTED_ORIGINS (separados por coma).
 * Pasar de staging a producción es solo cambiar esas variables.
 */
function trustedOrigins(): string[] {
  const candidates = [process.env.BETTER_AUTH_URL, getSiteUrl(), ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",")];
  const origins = new Set<string>();
  for (const value of candidates) {
    try {
      if (value?.trim()) origins.add(new URL(value.trim()).origin);
    } catch {
      console.warn(`[auth] Origen inválido ignorado: ${value}`);
    }
  }
  return [...origins];
}

/** Códigos de error que ve la persona (los traducen las pantallas de login) */
export const AUTH_ERRORS = {
  SIN_INVITACION: "Ese email no tiene una invitación vigente. Pedile a quien administra tu organización (o al estudio) que te invite.",
  SIN_ACCESO: "Ese email no tiene acceso a ninguna organización. Puede que la invitación haya vencido o que te hayan quitado el acceso.",
  CLIENTE_SIN_CLAVE: "El portal ya no usa contraseña: entrá con Google o pedí un enlace por mail.",
  ESTUDIO_CON_CLAVE: "Las cuentas del estudio entran con email, contraseña y segundo factor desde /admin/login.",
  USUARIO_DESACTIVADO: "Tu usuario está desactivado. Pedile acceso al estudio.",
  MAIL_NO_ENVIADO: "No pudimos mandarte el mail. Probá con Google o escribile al estudio.",
} as const;
export type AuthErrorCode = keyof typeof AUTH_ERRORS;

const deny = (code: AuthErrorCode) => new APIError("FORBIDDEN", { code, message: AUTH_ERRORS[code] });

/** Google: credenciales reales, o el simulador de las pruebas (GOOGLE_OAUTH_MOCK_URL) */
function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const mock = process.env.GOOGLE_OAUTH_MOCK_URL?.trim();
  return { real: clientId && clientSecret && !mock ? { clientId, clientSecret } : null, mock: mock || null };
}

/** ¿Se muestra el botón "Continuar con Google"? Sin credenciales, no. */
export function googleEnabled() {
  const g = googleConfig();
  return Boolean(g.real || g.mock);
}

/** URL para "Continuar con Google" (Google real o el simulador de pruebas). Null si no hay Google */
export async function googleSignInUrl(callbackURL: string, errorCallbackURL: string, headers: Headers): Promise<string | null> {
  const g = googleConfig();
  if (!g.real && !g.mock) return null;
  // El simulador (genericOAuth) también queda registrado como proveedor social "google"
  const res = (await getAuth().api.signInSocial({ body: { provider: "google", callbackURL, errorCallbackURL }, headers })) as { url?: string };
  return res?.url ?? null;
}

const isSocial = (path?: string) => !!path && (path.startsWith("/callback/") || path.startsWith("/oauth2/callback"));
const isMagic = (path?: string) => path === "/magic-link/verify";

async function userByEmail(email: string) {
  const [u] = await getDb()
    .select({ id: users.id, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  return u ?? null;
}

async function sendMagicLinkMail(email: string, url: string) {
  const existing = await userByEmail(email);
  // El estudio entra con contraseña + 2FA; clientes, titulares (persona o autónomo) y altas nuevas, con enlace
  if (existing && existing.role !== "cliente" && existing.role !== "titular") throw deny("ESTUDIO_CON_CLAVE");
  if (existing && !existing.active) throw deny("USUARIO_DESACTIVADO");
  const signup = existing ? null : await pendingSignup(email);
  if (existing?.role !== "titular" && !signup && !(await hasAccessByEmail(email))) {
    await audit({
      studioId: null,
      actorLabel: email,
      action: "sesion.rechazada",
      result: "denegado",
      metadata: { metodo: "enlace", motivo: "sin invitación ni membresía" },
    });
    throw deny("SIN_ACCESO");
  }
  const sent = await sendMail({
    to: email,
    subject: signup ? "Activá tu cuenta de Faro" : "Tu enlace para entrar a Faro",
    html: mailLayout(
      signup ? "Activá tu cuenta de Faro" : "Entrá a Faro",
      `<p>Tocá el botón para ${signup ? "activar tu cuenta" : "entrar"} como <strong>${esc(email)}</strong>. El enlace sirve una sola vez y vence en 15 minutos.</p>
<p style="color:#5a6176;font-size:13px">Si no lo pediste, ignorá este mail.</p>`,
      { href: url, label: signup ? "Activar mi cuenta" : "Entrar" },
      signup || existing?.role === "titular" ? "Faro" : undefined,
    ),
  });
  if (!sent) throw deny("MAIL_NO_ENVIADO");
}

function createAuth() {
  const db = getDb();
  const google = googleConfig();
  return betterAuth({
    appName: "Faro",
    // Sin BETTER_AUTH_URL se usa SITE_URL
    baseURL: process.env.BETTER_AUTH_URL?.trim() || getSiteUrl(),
    trustedOrigins: trustedOrigins(),
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications, twoFactor: two_factors },
    }),
    emailAndPassword: {
      enabled: true,
      // Sin registro público: los usuarios del estudio los crea un admin desde /admin/usuarios
      disableSignUp: true,
      minPasswordLength: 8,
    },
    socialProviders: google.real ? { google: { ...google.real, prompt: "select_account" } } : {},
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "contador", input: false },
        studioId: { type: "string", required: false, input: false },
        active: { type: "boolean", required: false, defaultValue: true, input: false },
        mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    advanced: { database: { generateId: "uuid" } },
    databaseHooks: {
      user: {
        create: {
          // Solo se crean usuarios por Google o enlace mágico con una invitación vigente.
          // (Los del estudio se insertan directo en la base desde /admin/usuarios y el seed.)
          before: async (user) => {
            const access = await hasAccessByEmail(user.email);
            // Autoregistro sin contraseña (persona o autónomo): el tenant se crea al entrar
            const signup = access?.invitation ? null : await pendingSignup(user.email);
            if (signup) {
              const studioId = await tenantFromSignup(signup);
              const name = user.name?.trim() || signup.name;
              return { data: { ...user, email: user.email.toLowerCase(), name, role: "titular", studioId, emailVerified: true } };
            }
            if (!access?.invitation) {
              await audit({
                studioId: null,
                actorLabel: user.email,
                action: "sesion.rechazada",
                result: "denegado",
                metadata: { motivo: "sin invitación" },
              });
              throw deny("SIN_INVITACION");
            }
            const name = user.name?.trim() || user.email.split("@")[0];
            return { data: { ...user, email: user.email.toLowerCase(), name, role: "cliente", studioId: access.studioId, emailVerified: true } };
          },
          after: async (user) => {
            const u = user as typeof user & { role?: string; studioId?: string };
            if (u.role !== "titular" || !u.studioId) return;
            await finalizePersonalTenant(u.studioId, u.id);
            await recordAcceptance({ id: u.id, email: u.email, studioId: u.studioId }, BASE_DOCS);
            await audit({ studioId: u.studioId, actor: { id: u.id, email: u.email }, action: "faro.registro", entityType: "tenant", entityId: u.studioId, metadata: { via: "sin contraseña" } });
          },
        },
      },
      account: {
        create: {
          // Una cuenta del estudio no se vincula con Google
          before: async (account) => {
            if (account.providerId === "credential") return;
            const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, account.userId));
            if (u && u.role !== "cliente" && u.role !== "titular") throw deny("ESTUDIO_CON_CLAVE");
          },
        },
      },
      session: {
        create: {
          before: async (session, ctx) => {
            const [user] = await db
              .select({ active: users.active, role: users.role, email: users.email, studioId: users.studioId })
              .from(users)
              .where(eq(users.id, session.userId));
            const path = ctx?.path;
            const reject = async (code: AuthErrorCode) => {
              await audit({
                studioId: user?.studioId ?? null,
                actor: user ? { id: session.userId, email: user.email } : null,
                action: "sesion.rechazada",
                result: "denegado",
                metadata: { motivo: code, via: path ?? "interno" },
              });
              return deny(code);
            };
            if (!user?.active) throw await reject("USUARIO_DESACTIVADO");
            if (user.role === "cliente") {
              if (path === "/sign-in/email") throw await reject("CLIENTE_SIN_CLAVE");
              if ((isSocial(path) || isMagic(path)) && !(await hasAccessByEmail(user.email))) throw await reject("SIN_ACCESO");
            } else if (user.role === "titular") {
              // Persona o autónomo: Google, enlace o contraseña
            } else if (isSocial(path) || isMagic(path)) {
              throw await reject("ESTUDIO_CON_CLAVE");
            }
          },
          after: async (session, ctx) => {
            const [user] = await db
              .select({ id: users.id, email: users.email, role: users.role, studioId: users.studioId, twoFactorEnabled: users.twoFactorEnabled })
              .from(users)
              .where(eq(users.id, session.userId));
            if (!user) return;
            const path = ctx?.path;
            // Con 2FA, la sesión de /sign-in/email es provisoria: se audita la del segundo paso
            if (path === "/sign-in/email" && user.twoFactorEnabled) return;
            if (!path || path === "/change-password" || path === "/two-factor/enable") return;
            const accepted = user.role === "cliente" ? await acceptInvitationsFor(user) : [];
            await audit({
              studioId: user.studioId,
              actor: user,
              action: "sesion.iniciar",
              metadata: {
                via: isSocial(path)
                  ? "google"
                  : isMagic(path)
                    ? "enlace por mail"
                    : path.startsWith("/two-factor")
                      ? "contraseña + 2FA"
                      : "contraseña",
                invitaciones_aceptadas: accepted.length,
              },
            });
          },
        },
      },
    },
    plugins: [
      twoFactor({ issuer: "Estudio Cristofaro", backupCodeOptions: { amount: 10 } }),
      magicLink({ expiresIn: 15 * 60, sendMagicLink: async ({ email, url }) => sendMagicLinkMail(email, url) }),
      // Solo pruebas: simulador de Google (scratchpad/mock-google). Nunca en staging ni producción.
      ...(google.mock
        ? [
            genericOAuth({
              config: [
                {
                  providerId: "google",
                  clientId: "mock-client",
                  clientSecret: "mock-secret",
                  authorizationUrl: `${google.mock}/authorize`,
                  tokenUrl: `${google.mock}/token`,
                  userInfoUrl: `${google.mock}/userinfo`,
                  scopes: ["openid", "email", "profile"],
                },
              ],
            }),
          ]
        : []),
      // nextCookies tiene que ir último: guarda las cookies cuando se llama desde server actions
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __auth?: Auth };

/**
 * Instancia de Better Auth. Se crea al primer uso (no al importar el módulo)
 * para que `next build` no necesite base de datos ni secreto.
 */
export function getAuth(): Auth {
  globalForAuth.__auth ??= createAuth();
  return globalForAuth.__auth;
}
