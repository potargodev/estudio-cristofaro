// Universo de demostración (Diseño · etapa 5). Todo vive en tenants y usuarios
// marcados is_demo, con mails @demo.faro.local: nunca se mezcla con Estudio
// Cristofaro ni con datos reales, y se borra entero con resetDemo().
//
//   npm run demo:seed   ·  npm run demo:reset   (desarrollo)
//   node dist/demo.mjs seed | reset | estado      (consola de Easypanel)
//   Faro Manager → Plataforma → Demo               (solo faro_owner, auditado)

import { rmSync } from "node:fs";
import path from "node:path";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { audit_log, conversation_members, conversations, fleets, monotributo_scales, studios, users } from "@/db/schema";
import { DEMO_DIR, DEMO_DOMAIN, password, uploadsRoot } from "./base";
import { seedNetwork } from "./network";
import { seedPeople } from "./people";
import { seedStudios } from "./studios";


export const DEMO_PROFILES = [
  { key: "persona", label: "Persona", email: `persona@${DEMO_DOMAIN}`, home: "/personal", what: "Martina Gómez: Bitácora de 6 meses, cajas compartidas, Grupos y su contador conectado." },
  { key: "autonomo", label: "Autónomo", email: `autonomo@${DEMO_DOMAIN}`, home: "/personal", what: "Julián Ríos: caja de negocio, sueldo del dueño, facturación con el semáforo en amarillo y capitán de una Flota." },
  { key: "dueno", label: "Dueña de estudio", email: `duena.estudio@${DEMO_DOMAIN}`, home: "/admin", what: "Gabriela Ferreyra: estudio grande con 8 organizaciones, equipo, honorarios, flujos y la Red Contable." },
  { key: "contador", label: "Contador", email: `contador@${DEMO_DOMAIN}`, home: "/admin", what: "Santiago Molina: contador del estudio grande." },
  { key: "organizacion", label: "Dueña de organización", email: `duena.organizacion@${DEMO_DOMAIN}`, home: "/portal", what: "Dana Lagos: Agencia Creativa Norte SRL en el portal del estudio." },
  { key: "empleado", label: "Empleada", email: `empleada@${DEMO_DOMAIN}`, home: "/portal", what: "Ema Rodríguez: recibos para firmar y comunicados." },
] as const;

interface DemoState {
  loaded: boolean;
  studios: number;
  users: number;
}

export async function demoState(db: Db): Promise<DemoState> {
  const [[s], [u]] = await Promise.all([db.select({ n: sql<number>`count(*)::int` }).from(studios).where(eq(studios.is_demo, true)), db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.isDemo, true))]);
  return { loaded: s.n > 0, studios: s.n, users: u.n };
}

/** Borra todo lo marcado como demo (y solo eso). Devuelve cuántos tenants y usuarios borró */
export async function resetDemo(db: Db) {
  const before = await demoState(db);
  const demoUsers = db.select({ id: users.id }).from(users).where(eq(users.isDemo, true));
  // Conversaciones directas entre usuarios de demo (las de grupos, Flotas y estudios caen en cascada)
  const direct = db.select({ id: conversation_members.conversation_id }).from(conversation_members).where(inArray(conversation_members.user_id, demoUsers));
  await db.delete(conversations).where(and(eq(conversations.kind, "directo"), inArray(conversations.id, direct)));
  await db.delete(fleets).where(eq(fleets.is_demo, true));
  // Los tenants arrastran en cascada a sus usuarios, organizaciones y todo lo demás
  await db.delete(studios).where(eq(studios.is_demo, true));
  await db.delete(users).where(eq(users.isDemo, true));
  rmSync(path.join(uploadsRoot(), DEMO_DIR), { recursive: true, force: true });
  return before;
}

/**
 * Carga la demo desde cero (si había una, la borra antes). Las contraseñas de
 * los usuarios de cada perfil se generan ahora y se devuelven una sola vez:
 * no se guardan en ningún lado.
 */
export async function seedDemo(db: Db, log: (msg: string) => void = () => {}) {
  await resetDemo(db);
  const pass: Record<string, string> = Object.fromEntries(DEMO_PROFILES.map((p) => [p.key, password()]));
  const [scale] = await db.select().from(monotributo_scales).orderBy(desc(monotributo_scales.valid_from)).limit(1);
  const scaleMax = Object.fromEntries(((scale?.categories ?? []) as { letter: string; maxIncome: number }[]).map((c) => [c.letter, c.maxIncome]));
  if (!Object.keys(scaleMax).length) for (const [i, l] of [..."ABCDEFGHIJK"].entries()) scaleMax[l] = 8_000_000 * (i + 1);
  log("Estudios, equipos y organizaciones…");
  const st = await seedStudios(db, pass);
  log("Personas y autónomos…");
  const people = await seedPeople(db, pass, scaleMax);
  log("Cajas compartidas, grupos, conexiones, Red Contable, Flotas y mensajes…");
  await seedNetwork(db, people, st);
  const state = await demoState(db);
  log(`Listo: ${state.studios} espacios y ${state.users} usuarios de demostración.`);
  return { state, credentials: DEMO_PROFILES.map((p) => ({ ...p, password: pass[p.key] })) };
}

/** Registro en la auditoría de la plataforma (cargar o borrar la demo) */
export async function auditDemo(db: Db, action: "demo.cargada" | "demo.borrada", actor: { id: string | null; label: string }, metadata: Record<string, unknown>) {
  await db.insert(audit_log).values({ studio_id: null, actor_id: actor.id, actor_label: actor.label, action, entity_type: "plataforma", result: "ok", metadata });
}
