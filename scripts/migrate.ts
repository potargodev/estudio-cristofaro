// Aplica las migraciones de /drizzle. El contenedor lo corre al arrancar
// (`node dist/migrate.mjs`), antes de levantar el servidor.

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    console.log("[migrate] Base actualizada.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[migrate] Error", error);
  process.exit(1);
});
