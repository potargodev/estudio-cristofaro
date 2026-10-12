// Aplica las migraciones de /drizzle. El contenedor lo corre al arrancar
// (`node dist/migrate.mjs`), antes de levantar el servidor.
//
// Misma tabla y mismo criterio que el migrador de Drizzle (drizzle.__drizzle_migrations,
// se aplica lo posterior a la última registrada), con dos diferencias:
// - cada migración va en su propia transacción: un valor nuevo de un enum no se
//   puede usar en la misma transacción en que se agrega, y con todas juntas una
//   base vacía no se podía crear;
// - un candado de Postgres evita que dos instancias migren a la vez.

import { readMigrationFiles } from "drizzle-orm/migrator";
import path from "node:path";
import postgres from "postgres";

const LOCK_KEY = 4_204_202_026; // candado consultivo del migrador

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const migrations = readMigrationFiles({ migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`SELECT pg_advisory_lock(${LOCK_KEY})`;
    await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`;
    const [last] = await sql<{ created_at: string }[]>`SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`;
    const pending = migrations.filter((m) => !last || Number(last.created_at) < m.folderMillis);
    for (const m of pending) {
      await sql.begin(async (tx) => {
        for (const stmt of m.sql) if (stmt.trim()) await tx.unsafe(stmt);
        await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${m.hash}, ${m.folderMillis})`;
      });
    }
    console.log(pending.length ? `[migrate] ${pending.length} migraciones aplicadas.` : "[migrate] Base al día.");
  } finally {
    await sql`SELECT pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[migrate] Error", error);
  process.exit(1);
});
