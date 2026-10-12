import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { job_leases } from "@/db/schema";

// Tareas internas (instrumentation.ts y los cron externos): cada una corre en
// una sola instancia a la vez. El turno se toma en Postgres con un UPDATE
// atómico, así que dos contenedores o dos vueltas superpuestas no mandan dos
// veces el mismo aviso. Si una vuelta muere, el turno vence solo (ttl).

const INSTANCE = `${process.env.HOSTNAME ?? "faro"}:${process.pid}:${randomUUID().slice(0, 8)}`;

/**
 * Corre `fn` si consigue el turno de la tarea `name`. Devuelve su resultado,
 * o null si otra instancia la está corriendo.
 */
export async function withJobLease<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
  const db = getDb();
  await db.insert(job_leases).values({ name, locked_until: new Date(0) }).onConflictDoNothing();
  const [taken] = await db
    .update(job_leases)
    .set({ holder: INSTANCE, locked_until: sql`now() + ${`${Math.ceil(ttlMs / 1000)} seconds`}::interval`, last_started_at: sql`now()` })
    .where(and(eq(job_leases.name, name), lt(job_leases.locked_until, sql`now()`)))
    .returning({ name: job_leases.name });
  if (!taken) return null;
  try {
    const result = await fn();
    await db.update(job_leases).set({ locked_until: sql`now()`, last_finished_at: sql`now()`, last_error: null }).where(and(eq(job_leases.name, name), eq(job_leases.holder, INSTANCE)));
    return result;
  } catch (error) {
    await db.update(job_leases).set({ locked_until: sql`now()`, last_finished_at: sql`now()`, last_error: String((error as Error).message ?? error).slice(0, 500) }).where(and(eq(job_leases.name, name), eq(job_leases.holder, INSTANCE)));
    throw error;
  }
}

/** Tarea apagada por variable de entorno (por ejemplo GASTOS_JOBS=off o JOBS=off para todas) */
export const jobDisabled = (envVar: string) => process.env.JOBS === "off" || process.env[envVar] === "off";
