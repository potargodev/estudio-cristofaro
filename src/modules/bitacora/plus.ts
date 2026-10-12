import "server-only";
import { getEntitlements } from "@/lib/faro/entitlements";

// Bitácora Gratis y Plus (docs/faro-producto.md §2.g): Plus suma conexiones
// (Mercado Pago y Gmail), coach, metas sin límite e importaciones sin límite.
// Es Plus quien tiene un plan pago: Personas Plus, Autónomos Pro, o la cuenta
// de un estudio (que se lo regala a su equipo y a sus clientes como beneficio).

const FREE_LIMITS = { goals: 1, importsPerMonth: 2 } as const;

export async function bitacoraPlan(user: { studioId: string }) {
  const e = await getEntitlements(user.studioId);
  const plus = !!e && !e.plan.free;
  return { plus, planName: e?.plan.name ?? "Gratis", limits: plus ? { goals: null, importsPerMonth: null } : FREE_LIMITS };
}
