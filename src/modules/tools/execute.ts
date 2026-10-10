import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { approvals, organizations } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isUuid } from "@/lib/ids";
import { getTool, levelFor } from "./registry";
import { ToolError, type HandlerContext, type ToolActor, type ToolContext, type ToolDefinition, type ToolModule, type ToolOutcome } from "./types";

// Única puerta de ejecución de herramientas. Valida en el servidor, en este
// orden: que exista, el rol, el módulo del alcance, la entrada, la escritura y
// la organización (del estudio y permitida). Después:
// - lectura: se ejecuta;
// - escritura: desde el Asistente pide confirmación en línea (queda una
//   propuesta de nivel "escritura" que confirma la misma persona); desde MCP
//   con alcance de escritura se ejecuta;
// - sensible: nunca se ejecuta sola, crea una propuesta en Aprobaciones.
// Toda ejecución queda en la auditoría con el origen y el resultado.

const NOT_FOUND = "No existe o no está dentro de lo que este pedido puede ver.";

export function handlerContext(ctx: ToolContext): HandlerContext {
  const cache = new Map<string, { id: string; name: string }>();
  return {
    ...ctx,
    allowedOrganizations: ctx.organizationIds,
    async organization(id: string) {
      if (!id || !isUuid(id)) throw new ToolError("ID de organización inválido.", "entrada_invalida");
      if (ctx.organizationIds && !ctx.organizationIds.includes(id)) throw new ToolError(NOT_FOUND, "sin_permiso");
      const hit = cache.get(id);
      if (hit) return hit;
      const [org] = await getDb()
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(and(eq(organizations.id, id), eq(organizations.studio_id, ctx.studioId)));
      if (!org) throw new ToolError(NOT_FOUND, "sin_permiso");
      cache.set(id, org);
      return org;
    },
  };
}

/** ¿Puede este contexto usar la herramienta? (rol y módulo; la escritura se mira según la entrada) */
export function toolAllowed(t: ToolDefinition, ctx: Pick<ToolContext, "actor" | "modules">) {
  return t.roles.includes(ctx.actor.role) && (!ctx.modules || ctx.modules.includes(t.module as ToolModule));
}

const firstIssue = (e: unknown) => {
  const issues = (e as { issues?: { path: PropertyKey[]; message: string }[] }).issues;
  const i = issues?.[0];
  return i ? `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}` : "Entrada inválida.";
};

async function deny(ctx: ToolContext, tool: string, message: string, organizationId?: string | null): Promise<ToolOutcome> {
  await audit({
    studioId: ctx.studioId,
    organizationId: organizationId ?? null,
    actor: ctx.actor,
    action: "herramienta.denegada",
    entityType: "herramienta",
    entityId: tool,
    result: "denegado",
    metadata: { origen: ctx.origin, motivo: message, acceso_mcp: ctx.mcpAccessId ?? null },
  });
  return { status: "denegado", message };
}

async function propose(t: ToolDefinition, input: Record<string, unknown>, ctx: ToolContext, level: "escritura" | "sensible", organizationId: string | null) {
  const summary = t.describe ? t.describe(input as never) : t.title;
  const [row] = await getDb()
    .insert(approvals)
    .values({
      studio_id: ctx.studioId,
      organization_id: organizationId,
      origin: ctx.origin,
      level,
      tool: t.name,
      title: summary,
      input,
      context: { organizationIds: ctx.organizationIds, modules: ctx.modules },
      requested_by: ctx.actor.id,
      requested_label: ctx.origin === "mcp" ? `MCP · ${ctx.actor.email}` : ctx.actor.email,
      mcp_access_id: ctx.mcpAccessId ?? null,
      conversation_id: ctx.conversationId ?? null,
    })
    .returning({ id: approvals.id });
  await audit({
    studioId: ctx.studioId,
    organizationId,
    actor: ctx.actor,
    action: level === "sensible" ? "aprobacion.proponer" : "herramienta.confirmar_pedido",
    entityType: "aprobacion",
    entityId: row.id,
    metadata: { origen: ctx.origin, herramienta: t.name, acceso_mcp: ctx.mcpAccessId ?? null },
  });
  return { id: row.id, summary };
}

async function run(t: ToolDefinition, input: Record<string, unknown>, ctx: ToolContext, hctx: HandlerContext, organizationId: string | null): Promise<ToolOutcome> {
  const started = Date.now();
  try {
    const result = await t.handler(input, hctx);
    await audit({
      studioId: ctx.studioId,
      organizationId,
      actor: ctx.actor,
      action: "herramienta.ejecutar",
      entityType: "herramienta",
      entityId: t.name,
      metadata: { origen: ctx.origin, ms: Date.now() - started, acceso_mcp: ctx.mcpAccessId ?? null, conversacion: ctx.conversationId ?? null },
    });
    return { status: "ok", result };
  } catch (error) {
    const known = error instanceof ToolError;
    if (!known) console.error(`[tools] ${t.name}`, error);
    const message = known ? error.message : "Error interno al ejecutar la herramienta.";
    await audit({
      studioId: ctx.studioId,
      organizationId,
      actor: ctx.actor,
      action: "herramienta.ejecutar",
      entityType: "herramienta",
      entityId: t.name,
      result: known && error.code === "sin_permiso" ? "denegado" : "error",
      metadata: { origen: ctx.origin, error: message, acceso_mcp: ctx.mcpAccessId ?? null },
    });
    return known && error.code === "sin_permiso" ? { status: "denegado", message } : { status: "error", message };
  }
}

export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const t = getTool(name);
  if (!t) return deny(ctx, name, "Esa herramienta no existe.");
  if (!t.roles.includes(ctx.actor.role)) return deny(ctx, name, "Tu rol no tiene permiso para esta herramienta.");
  if (ctx.modules && !ctx.modules.includes(t.module)) return deny(ctx, name, "Este acceso no incluye el módulo de esta herramienta.");
  const parsed = t.input.safeParse(rawInput ?? {});
  if (!parsed.success) return { status: "error", message: `Entrada inválida: ${firstIssue(parsed.error)}` };
  const input = parsed.data as Record<string, unknown>;
  const level = levelFor(t, input);
  if (level !== "lectura" && !ctx.canWrite) return deny(ctx, name, "Este acceso es de solo lectura.");

  const hctx = handlerContext(ctx);
  let organizationId: string | null = null;
  try {
    organizationId = t.organizationOf ? await t.organizationOf(input as never, hctx) : null;
    if (organizationId) await hctx.organization(organizationId);
  } catch (error) {
    return deny(ctx, name, error instanceof ToolError ? error.message : NOT_FOUND);
  }

  if (level === "sensible") {
    const p = await propose(t, input, ctx, "sensible", organizationId);
    return { status: "aprobacion", approvalId: p.id, summary: p.summary };
  }
  if (level === "escritura" && ctx.origin === "asistente") {
    const p = await propose(t, input, ctx, "escritura", organizationId);
    return { status: "confirmacion", approvalId: p.id, summary: p.summary };
  }
  return run(t, input, ctx, hctx, organizationId);
}

export type Decision = { approve: true; input?: Record<string, unknown> } | { approve: false; reason: string };

export type DecisionResult = { ok: true; status: "ejecutada" | "rechazada"; result?: unknown } | { ok: false; message: string };

/**
 * Aprobar (ejecuta y audita), editar y aprobar o rechazar una propuesta. Las de
 * nivel "escritura" (confirmaciones del Asistente) solo las confirma quien las
 * pidió. Se ejecuta con los límites del pedido original y el rol de quien aprueba.
 */
export async function decideApproval(approvalId: string, approver: ToolActor & { studioId: string }, decision: Decision): Promise<DecisionResult> {
  if (!isUuid(approvalId)) return { ok: false, message: "Propuesta inexistente." };
  const db = getDb();
  const [a] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, approvalId), eq(approvals.studio_id, approver.studioId)));
  if (!a) return { ok: false, message: "Propuesta inexistente." };
  if (a.status !== "pendiente") return { ok: false, message: "Esa propuesta ya se resolvió." };
  if (a.level === "escritura" && a.requested_by !== approver.id) return { ok: false, message: "Solo quien la pidió puede confirmar esta acción." };
  const t = getTool(a.tool);
  if (!t) return { ok: false, message: "La herramienta ya no existe." };

  if (!decision.approve) {
    const [done] = await db
      .update(approvals)
      .set({ status: a.level === "escritura" ? "cancelada" : "rechazada", decided_by: approver.id, decided_at: new Date(), reason: decision.reason.slice(0, 1000) })
      .where(and(eq(approvals.id, a.id), eq(approvals.status, "pendiente")))
      .returning({ id: approvals.id });
    if (!done) return { ok: false, message: "Esa propuesta ya se resolvió." };
    await audit({
      studioId: a.studio_id,
      organizationId: a.organization_id,
      actor: approver,
      action: "aprobacion.rechazar",
      entityType: "aprobacion",
      entityId: a.id,
      metadata: { herramienta: a.tool, motivo: decision.reason, origen: a.origin },
    });
    return { ok: true, status: "rechazada" };
  }

  if (!t.roles.includes(approver.role)) return { ok: false, message: "Tu rol no puede aprobar esta acción." };
  const edited = decision.input !== undefined;
  const parsed = t.input.safeParse(decision.input ?? a.input);
  if (!parsed.success) return { ok: false, message: `Revisá el borrador: ${firstIssue(parsed.error)}` };
  const input = parsed.data as Record<string, unknown>;
  const context = a.context as { organizationIds?: string[] | null; modules?: ToolModule[] | null };
  const ctx: ToolContext = {
    studioId: a.studio_id,
    actor: { id: approver.id, email: approver.email, name: approver.name, role: approver.role },
    origin: a.origin,
    organizationIds: context.organizationIds ?? null,
    modules: context.modules ?? null,
    canWrite: true,
    mcpAccessId: a.mcp_access_id,
    conversationId: a.conversation_id,
  };
  const hctx = handlerContext(ctx);
  // El borrador editado no puede cambiar de organización
  try {
    const org = t.organizationOf ? await t.organizationOf(input as never, hctx) : null;
    if ((org ?? null) !== (a.organization_id ?? null)) return { ok: false, message: "El borrador editado no puede cambiar de organización." };
    if (org) await hctx.organization(org);
  } catch (error) {
    return { ok: false, message: error instanceof ToolError ? error.message : NOT_FOUND };
  }
  // Se marca antes de ejecutar: dos clics simultáneos no ejecutan dos veces
  const [claimed] = await db
    .update(approvals)
    .set({ status: "ejecutada", decided_by: approver.id, decided_at: new Date(), edited, input })
    .where(and(eq(approvals.id, a.id), eq(approvals.status, "pendiente")))
    .returning({ id: approvals.id });
  if (!claimed) return { ok: false, message: "Esa propuesta ya se resolvió." };

  const outcome = await run(t, input, ctx, hctx, a.organization_id);
  const ok = outcome.status === "ok";
  await db
    .update(approvals)
    .set({ status: ok ? "ejecutada" : "error", result: ok ? { ok: true, data: outcome.result as never } : { ok: false, message: "message" in outcome ? outcome.message : "Error" } })
    .where(eq(approvals.id, a.id));
  await audit({
    studioId: a.studio_id,
    organizationId: a.organization_id,
    actor: approver,
    action: a.level === "sensible" ? "aprobacion.aprobar" : "herramienta.confirmar",
    entityType: "aprobacion",
    entityId: a.id,
    result: ok ? "ok" : "error",
    metadata: { herramienta: a.tool, editada: edited, origen: a.origin },
  });
  if (!ok) return { ok: false, message: "message" in outcome ? outcome.message : "No se pudo ejecutar." };
  return { ok: true, status: "ejecutada", result: outcome.result };
}
