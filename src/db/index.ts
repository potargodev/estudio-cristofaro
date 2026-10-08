import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

// Una sola conexión por proceso (en desarrollo sobrevive al hot reload).
const globalForDb = globalThis as unknown as { __db?: Db };

export const isDbConfigured = Boolean(process.env.DATABASE_URL);

/** Cliente de Drizzle. Tira error si falta DATABASE_URL: quien lo llame decide el respaldo. */
export function getDb(): Db {
  if (globalForDb.__db) return globalForDb.__db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const client = postgres(url, { max: 10, connect_timeout: 5, idle_timeout: 30 });
  const db = drizzle(client, { schema });
  globalForDb.__db = db;
  return db;
}

export { schema };
