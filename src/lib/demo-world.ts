import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { studios, users } from "@/db/schema";

// La demo y lo real son dos mundos que no se cruzan: un usuario o un espacio
// de la demo solo invita, contacta, se une o se conecta con la demo, y uno
// real solo con reales. Cada punto donde dos personas o espacios se encuentran
// (invitaciones, Red Contable, conexiones, grupos, cajas, Flotas) lo valida acá.

const DEMO_EMAIL_DOMAIN = "demo.faro.local";

export const isDemoEmail = (email: string | null | undefined) => (email ?? "").trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);

export const WORLD_MESSAGE = "La demo y los datos reales no se mezclan: desde la demo solo podés invitar o contactar a usuarios de la demo, y desde una cuenta real, a cuentas reales.";

export async function userIsDemo(userId: string): Promise<boolean> {
  const [u] = await getDb().select({ demo: users.isDemo }).from(users).where(eq(users.id, userId));
  return Boolean(u?.demo);
}

export async function studioIsDemo(studioId: string): Promise<boolean> {
  const [s] = await getDb().select({ demo: studios.is_demo }).from(studios).where(eq(studios.id, studioId));
  return Boolean(s?.demo);
}

/** Una invitación por mail cruza de mundo: demo → mail real, o real → mail de la demo */
export const crossesWorld = (actorIsDemo: boolean, email: string) => actorIsDemo !== isDemoEmail(email);
