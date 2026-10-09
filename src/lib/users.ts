import { randomInt } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Db } from "@/db";
import { accounts, users } from "@/db/schema";
import type { UserRole } from "./types";

/**
 * Crea un usuario con email y contraseña directamente en la base, con el mismo
 * formato que usa Better Auth (cuenta "credential" con la contraseña hasheada).
 * Lo usan el seed y la sección /admin/usuarios, porque el registro público
 * está deshabilitado.
 */
export async function createUserWithPassword(
  db: Db,
  input: {
    studioId: string;
    name: string;
    email: string;
    password: string;
    role: UserRole;
  },
) {
  const hash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        studioId: input.studioId,
        name: input.name,
        email: input.email.toLowerCase(),
        emailVerified: true,
        role: input.role,
      })
      .returning();
    await tx.insert(accounts).values({
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: hash,
    });
    return user;
  });
}

// Sin caracteres que se confunden al dictarlos o leerlos (0/O, 1/l/I)
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Contraseña inicial legible, ej: "Hk7m-q2Pd-9Lte" (14 caracteres, ~70 bits). */
export function generatePassword() {
  const block = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${block()}-${block()}-${block()}`;
}
