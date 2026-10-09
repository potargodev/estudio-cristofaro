// Recuperación de acceso del estudio:
//   node dist/reset-password.mjs <email>      (dentro del contenedor)
//   npm run reset-password -- <email>         (en desarrollo)
//
// Genera una contraseña temporal aleatoria, la imprime UNA sola vez, cierra todas
// las sesiones del usuario y lo obliga a cambiarla al entrar. Solo para usuarios
// del estudio (admin o contador). No toca el segundo factor (2FA).

import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { randomInt } from "node:crypto";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { accounts, sessions, users } from "../src/db/schema";

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const block = () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Uso: node dist/reset-password.mjs <email>");
    process.exit(2);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  try {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      console.error(`No existe un usuario con el email ${email}.`);
      process.exitCode = 1;
      return;
    }
    if (user.role !== "admin" && user.role !== "contador") {
      console.error("Este script es solo para usuarios del estudio (admin o contador). Los clientes entran con Google o enlace mágico.");
      process.exitCode = 1;
      return;
    }
    const password = `${block()}-${block()}-${block()}`;
    const hash = await hashPassword(password);
    await db.transaction(async (tx) => {
      const [account] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")));
      if (account) await tx.update(accounts).set({ password: hash }).where(eq(accounts.id, account.id));
      else await tx.insert(accounts).values({ accountId: user.id, providerId: "credential", userId: user.id, password: hash });
      await tx.update(users).set({ mustChangePassword: true, active: true }).where(eq(users.id, user.id));
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
    });
    console.log("");
    console.log(`Contraseña temporal para ${email} (se muestra una sola vez):`);
    console.log("");
    console.log(`    ${password}`);
    console.log("");
    console.log("Se cerraron todas sus sesiones. Al entrar en /admin/login va a tener que elegir una contraseña nueva.");
    console.log("El segundo factor (si lo tenía configurado) sigue activo.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
