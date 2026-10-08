import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, sessions, users, verifications } from "@/db/schema";

function createAuth() {
  const db = getDb();
  return betterAuth({
    appName: "Estudio Cristofaro",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    emailAndPassword: {
      enabled: true,
      // Sin registro público: los usuarios los crea un admin desde /admin/usuarios
      disableSignUp: true,
      minPasswordLength: 8,
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "contador", input: false },
        studioId: { type: "string", required: true, input: false },
        active: { type: "boolean", required: false, defaultValue: true, input: false },
      },
    },
    advanced: { database: { generateId: "uuid" } },
    databaseHooks: {
      session: {
        create: {
          // Un usuario desactivado no puede iniciar sesión
          before: async (session) => {
            const [user] = await db.select({ active: users.active }).from(users).where(eq(users.id, session.userId));
            if (!user?.active) throw new APIError("FORBIDDEN", { message: "Usuario desactivado" });
          },
        },
      },
    },
    // nextCookies tiene que ir último: guarda las cookies cuando se llama desde server actions
    plugins: [nextCookies()],
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
