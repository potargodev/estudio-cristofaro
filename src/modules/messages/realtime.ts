import "server-only";
import { EventEmitter } from "node:events";
import postgres from "postgres";
import { getDb } from "@/db";

// Tiempo real de Mensajes: cada evento sale por NOTIFY de Postgres (así llega a
// todas las instancias) y una única conexión LISTEN por proceso lo reparte a
// los streams SSE abiertos. Si algo falla, el cliente cae al sondeo.

const CHANNEL = "faro_mensajes";

export type ChatEvent =
  | { type: "message" | "edit" | "delete"; conversationId: string; messageId: string; userId: string }
  | { type: "read" | "typing"; conversationId: string; userId: string }
  | { type: "membership"; userIds: string[] };

const g = globalThis as unknown as { __chatBus?: EventEmitter; __chatListen?: Promise<unknown> };

export function bus() {
  if (!g.__chatBus) {
    g.__chatBus = new EventEmitter();
    g.__chatBus.setMaxListeners(0);
  }
  if (!g.__chatListen && process.env.DATABASE_URL) {
    const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 0 });
    g.__chatListen = sql
      .listen(CHANNEL, (payload) => {
        try {
          g.__chatBus!.emit("event", JSON.parse(payload) as ChatEvent);
        } catch {
          // payload inválido: se ignora
        }
      })
      .catch((e) => {
        console.error("[mensajes] LISTEN", (e as Error).message);
        g.__chatListen = undefined;
      });
  }
  return g.__chatBus;
}

/** Publica un evento (solo ids: el contenido se pide después, con permisos) */
export async function publish(e: ChatEvent) {
  try {
    const client = (getDb() as unknown as { $client: postgres.Sql }).$client;
    await client.notify(CHANNEL, JSON.stringify(e));
  } catch (err) {
    console.error("[mensajes] NOTIFY", (err as Error).message);
  }
}
