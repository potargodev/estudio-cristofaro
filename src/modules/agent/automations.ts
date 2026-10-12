import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { automation_switches, organizations } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isUuid } from "@/lib/ids";
import { AgentError } from "./errors";

// Regla fiscal de §2.q: lo que presenta, emite, paga o comunica algo sensible
// queda para aprobar, salvo que el titular o su contador hayan activado esa
// automatización. Cada interruptor es por acción y por organización (o para
// todas), queda en la auditoría y se puede pausar sin perder la configuración.
// La emisión de comprobantes y las presentaciones no están en el catálogo:
// siempre pasan por Aprobaciones (docs/decisiones.md).

export const AUTOMATABLE = {
  enviar_resumen_mensual: { label: "Enviar el resumen mensual al cliente", group: "Comunicaciones" },
  recordar_vencimiento: { label: "Recordar un vencimiento al cliente", group: "Comunicaciones" },
  pedir_documentacion: { label: "Pedir documentación al cliente", group: "Comunicaciones" },
  recordar_firma_recibos: { label: "Recordar la firma de recibos", group: "Comunicaciones" },
  "conciliacion.ajuste": { label: "Asentar las diferencias de conciliación dentro de la tolerancia", group: "Conciliación" },
  "stock.publicar": { label: "Publicar la existencia en las tiendas conectadas", group: "Stock" },
} as const;
type AutomatableAction = keyof typeof AUTOMATABLE;
const isAutomatable = (a: string): a is AutomatableAction => a in AUTOMATABLE;

/** ¿Esta acción puede ejecutarse sin aprobación para esta organización? (interruptor activo y sin pausa) */
export async function automationAllows(studioId: string, organizationId: string | null, action: string) {
  if (!isAutomatable(action)) return false;
  const rows = await getDb()
    .select({ enabled: automation_switches.enabled, paused: automation_switches.paused, org: automation_switches.organization_id })
    .from(automation_switches)
    .where(
      and(
        eq(automation_switches.studio_id, studioId),
        eq(automation_switches.action, action),
        organizationId ? or(eq(automation_switches.organization_id, organizationId), isNull(automation_switches.organization_id)) : isNull(automation_switches.organization_id),
      ),
    );
  // El de la organización manda sobre el general
  const own = rows.find((r) => r.org === organizationId) ?? rows.find((r) => r.org === null);
  return Boolean(own?.enabled && !own.paused);
}

export async function listAutomations(studioId: string) {
  return getDb()
    .select({ id: automation_switches.id, action: automation_switches.action, organizationId: automation_switches.organization_id, organization: organizations.name, enabled: automation_switches.enabled, paused: automation_switches.paused, setAt: automation_switches.set_at })
    .from(automation_switches)
    .leftJoin(organizations, eq(organizations.id, automation_switches.organization_id))
    .where(eq(automation_switches.studio_id, studioId));
}

type SwitchActor = { id: string; email: string; role: string; studioId: string };

/** Solo el dueño o un contador del estudio (o el titular de su cuenta) activan, pausan o apagan */
export const canSwitch = (role: string) => ["dueno", "contador", "titular"].includes(role);

export async function setAutomation(actor: SwitchActor, input: { action: string; organizationId: string | null; state: "activa" | "pausada" | "apagada" }) {
  if (!canSwitch(actor.role)) throw new AgentError("Solo el dueño, un contador o el titular activan automatizaciones.");
  if (!isAutomatable(input.action)) throw new AgentError("Esa acción no se puede automatizar.");
  if (input.organizationId) {
    if (!isUuid(input.organizationId)) throw new AgentError("Organización inválida.");
    const [org] = await getDb()
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.id, input.organizationId), eq(organizations.studio_id, actor.studioId)));
    if (!org) throw new AgentError("Organización inválida.");
  }
  const values = { enabled: input.state !== "apagada", paused: input.state === "pausada", set_by: actor.id, set_at: new Date() };
  const db = getDb();
  const where = and(
    eq(automation_switches.studio_id, actor.studioId),
    eq(automation_switches.action, input.action),
    input.organizationId ? eq(automation_switches.organization_id, input.organizationId) : isNull(automation_switches.organization_id),
  );
  const [existing] = await db.select({ id: automation_switches.id }).from(automation_switches).where(where);
  if (existing) await db.update(automation_switches).set(values).where(eq(automation_switches.id, existing.id));
  else await db.insert(automation_switches).values({ studio_id: actor.studioId, organization_id: input.organizationId, action: input.action, ...values });
  await audit({
    studioId: actor.studioId,
    organizationId: input.organizationId,
    actor,
    action: `automatizacion.${input.state === "activa" ? "activar" : input.state === "pausada" ? "pausar" : "apagar"}`,
    entityType: "automatizacion",
    entityId: input.action,
    metadata: { accion: input.action, alcance: input.organizationId ? "organizacion" : "todas" },
  });
}
