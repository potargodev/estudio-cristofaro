import "server-only";
import { generateText, jsonSchema, stepCountIs, tool, type LanguageModel, type ToolSet } from "ai";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { agent_memory, agent_routines, agent_task_events, agent_tasks, ai_usage, legal_entities, obligations, organizations, studios, users, type AgentPlanStep, type AgentReport } from "@/db/schema";
import { audit } from "@/lib/audit";
import { sendMail } from "@/lib/email";
import { checkLimit, getEntitlements, hasModule } from "@/lib/faro/entitlements";
import { formatDate, todayAR } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { languageModel, recordUsage, resolveModel } from "@/lib/ai/models";
import { estimateCost } from "@/lib/ai/pricing";
import { mailLayout } from "@/lib/notify";
import { costUsd, getPlatformAi, isConfigured, platformModel } from "@/modules/copilot/platform";
import { SHIELD_PROMPT } from "@/modules/escudo/catalog";
import { notify } from "@/modules/notifications/server";
import { executeTool, inputJsonSchema, toolAllowed, TOOLS, type StaffRole, type ToolContext } from "@/modules/tools";
import { getFaroModule } from "@/modules/registry";
import { AGENT_TEMPLATES, getTemplate, type AgentScope, type AgentTemplate } from "./catalog";
import { AgentError } from "./errors";
import { buildReport, type StepOutcome } from "./evaluate";
import { interpret, periodLabel } from "./intent";
import { AGENT_NAME, AGENT_SHORT } from "./name";
import { nextRun, parseSchedule, type RoutineSchedule } from "./routines";

// Agente contable (§2.q): recibe una tarea, arma un plan visible y lo ejecuta
// en segundo plano con las herramientas registradas (las mismas del Vigía y
// del MCP, con los permisos de quien la pidió). Cola en Postgres con el mismo
// patrón que el motor de flujos (turno por fila, FOR UPDATE SKIP LOCKED): una
// tarea avanza de a pasos, se puede pausar o cancelar entre pasos y deja un
// informe con hallazgos, borradores (en Aprobaciones) y tareas del equipo.

const db = () => getDb();

export { AgentError };

export interface AgentActor {
  id: string;
  email: string;
  name: string;
  role: string;
  studioId: string;
  tenantKind: "studio" | "personal" | "persona";
}

/** Tope de gasto de IA por tarea según el nivel de IA del plan (USD) */
const USD_CAP = { consultas: 0.25, acciones: 0.5, avanzado: 2 } as const;
/** Cuánto trabaja una vuelta del motor antes de soltar el turno */
const SLICE_MS = 20_000;
const LOCK_MS = 120_000;
const ACTIVE_ORG = ["onboarding", "activa", "pausada"] as const;

const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + d * 86400000).toISOString().slice(0, 10);

async function event(taskId: string, kind: string, text: string, stepId?: string | null, data?: unknown) {
  await db().insert(agent_task_events).values({ task_id: taskId, kind, text: text.slice(0, 2000), step_id: stepId ?? null, data: (data ?? null) as never });
}

/** Organizaciones activas del estudio */
async function studioOrgs(studioId: string) {
  return db()
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(and(eq(organizations.studio_id, studioId), inArray(organizations.status, [...ACTIVE_ORG])))
    .orderBy(asc(organizations.name));
}

async function orgInStudio(studioId: string, organizationId: string) {
  if (!isUuid(organizationId)) return null;
  const [o] = await db()
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(and(eq(organizations.id, organizationId), eq(organizations.studio_id, studioId)));
  return o ?? null;
}

const MODULE_ROLES = () => getFaroModule("agent")!.roles as string[];

/** ¿Puede esta persona usar el Agente? (rol, tipo de tenant y plan) */
export async function agentAccess(actor: Pick<AgentActor, "role" | "studioId" | "tenantKind">) {
  if (actor.tenantKind === "persona" || !MODULE_ROLES().includes(actor.role)) return { ok: false as const, reason: "rol" };
  if (!(await hasModule(actor.studioId, "agent"))) return { ok: false as const, reason: "plan" };
  return { ok: true as const };
}

async function requireAgent(actor: AgentActor) {
  const a = await agentAccess(actor);
  if (!a.ok) throw new AgentError(a.reason === "plan" ? `El ${AGENT_NAME} no está incluido en tu plan.` : `Tu rol no puede usar el ${AGENT_NAME}.`);
}

export function templatesFor(tenantKind: AgentActor["tenantKind"]) {
  return AGENT_TEMPLATES.filter((t) => (tenantKind === "studio" ? t.scopes.some((s) => s !== "personal") : t.scopes.includes("personal")));
}

// ───────────── Plan ─────────────

async function monotributoOrgs(studioId: string, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows = await db()
    .selectDistinct({ id: legal_entities.organization_id })
    .from(legal_entities)
    .where(and(eq(legal_entities.studio_id, studioId), inArray(legal_entities.organization_id, ids), eq(legal_entities.regime, "monotributo"), eq(legal_entities.active, true)));
  return new Set(rows.map((r) => r.id));
}

/** Pasos de la tarea: herramientas del registro por organización y el informe al final */
async function buildPlan(studioId: string, t: AgentTemplate, scope: AgentScope, orgs: { id: string; name: string }[], params: { period: string | null; date: string | null; today: string }): Promise<AgentPlanStep[]> {
  const steps: AgentPlanStep[] = [];
  const add = (title: string, tool: string, input: Record<string, unknown>, organizationId: string | null) => steps.push({ id: `p${steps.length + 1}`, title, kind: "herramienta", tool, input, organizationId, status: "pendiente" });
  const bankRec = await hasModule(studioId, "bank_rec");
  const open = ["pendiente", "en_proceso", "vencido"];
  if (t.key === "libre") {
    steps.push({ id: "p1", title: "Entender el pedido, armar el plan e investigar con las herramientas", kind: "analisis", status: "pendiente" });
  } else if (scope === "personal") {
    if (t.key === "tope_monotributo") add("Semáforo del monotributo de tu cuenta", "situacion_monotributo", {}, null);
    if (t.key === "inventario") {
      add("Inventario valorizado de tu cuenta", "inventario_valorizado", { ...(params.date ? { fecha: params.date } : {}) }, null);
      add("Productos debajo del mínimo", "stock_bajo_minimo", {}, null);
    }
  } else {
    const mono = t.key === "tope_monotributo" ? await monotributoOrgs(studioId, orgs.map((o) => o.id)) : null;
    const withStock = t.key === "inventario" ? await (async () => {
      const { stockEnabled } = await import("@/modules/stock/server");
      const ok = await Promise.all(orgs.map((o) => stockEnabled(studioId, o.id)));
      return new Set(orgs.filter((_, i) => ok[i]).map((o) => o.id));
    })() : null;
    const staff = t.key === "liquidar_sueldos" ? await (await import("@/modules/liquidacion/server")).orgsWithStaff(studioId, orgs.map((o) => o.id)) : null;
    for (const o of orgs) {
      const of = (s: string) => (orgs.length > 1 ? `${s} · ${o.name}` : s);
      if (t.key === "cierre_mensual") {
        add(of("Vencimientos abiertos"), "listar_vencimientos", { organizacion_id: o.id, estados: open, hasta: addDays(params.today, 5), limite: 50 }, o.id);
        add(of("Comprobantes para confirmar"), "comprobantes_para_confirmar", { organizacion_id: o.id, limite: 50 }, o.id);
        if (bankRec) add(of("Conciliación bancaria"), "estado_conciliacion", { organizacion_id: o.id }, o.id);
        add(of("Análisis del Libro IVA del período"), "analizar_libro_iva", { organizacion_id: o.id, ...(params.period ? { periodo: params.period } : {}) }, o.id);
        add(of("Resumen del mes para el cliente (borrador)"), "enviar_resumen_mensual", { organizacion_id: o.id }, o.id);
      } else if (t.key === "revision_iva") {
        add(of("Vencimientos de los próximos 15 días"), "listar_vencimientos", { organizacion_id: o.id, estados: open, hasta: addDays(params.today, 15), limite: 50 }, o.id);
        add(of("Comprobantes de compra sin confirmar"), "comprobantes_para_confirmar", { organizacion_id: o.id, limite: 50 }, o.id);
        add(of("Análisis del Libro IVA (compras y ventas)"), "analizar_libro_iva", { organizacion_id: o.id, ...(params.period ? { periodo: params.period } : {}) }, o.id);
      } else if (t.key === "conciliar_extracto") {
        add(of("Estado de la conciliación"), "estado_conciliacion", { organizacion_id: o.id }, o.id);
      } else if (t.key === "tope_monotributo") {
        if (mono?.has(o.id)) add(of("Semáforo del monotributo"), "situacion_monotributo", { organizacion_id: o.id }, o.id);
      } else if (t.key === "inventario") {
        if (withStock?.has(o.id)) {
          add(of("Inventario valorizado"), "inventario_valorizado", { organizacion_id: o.id, ...(params.date ? { fecha: params.date } : {}) }, o.id);
          add(of("Productos debajo del mínimo"), "stock_bajo_minimo", { organizacion_id: o.id }, o.id);
        }
      } else if (t.key === "liquidar_sueldos") {
        if (staff?.has(o.id) && params.period) add(of("Liquidación de sueldos (borrador para aprobar)"), "liquidar_sueldos", { organizacion_id: o.id, periodo: params.period }, o.id);
      } else if (t.key === "ajuste_inflacion") {
        add(of("Ajuste por inflación (asiento en borrador)"), "ajustar_por_inflacion", { organizacion_id: o.id, ...(params.date ? { cierre: params.date } : {}) }, o.id);
      } else if (t.key === "resumen_mensual") {
        add(of("Resumen del mes (borrador)"), "enviar_resumen_mensual", { organizacion_id: o.id }, o.id);
      }
    }
  }
  steps.push({ id: `p${steps.length + 1}`, title: "Informe con hallazgos, borradores y tareas", kind: "informe", status: "pendiente" });
  return steps;
}

// ───────────── Crear, ver, pausar y cancelar ─────────────

interface NewTask {
  text?: string | null;
  templateKey?: string | null;
  organizationId?: string | null;
  scope?: AgentScope | null;
  period?: string | null;
  date?: string | null;
  routineId?: string | null;
  /** Organizaciones elegidas por una rutina (antes de un vencimiento) */
  organizationIds?: string[] | null;
}

export async function createTask(actor: AgentActor, input: NewTask) {
  await requireAgent(actor);
  const limit = await checkLimit(actor.studioId, "agentTasksPerMonth");
  if (limit) throw new AgentError(limit);
  const today = todayAR();
  const personal = actor.tenantKind !== "studio";
  const orgs = personal ? [] : await studioOrgs(actor.studioId);
  const text = (input.text ?? "").trim().slice(0, 1000);
  const guess = text ? interpret(text, { orgs, today, personal }) : null;
  const template = getTemplate(input.templateKey ?? guess?.templateKey ?? "");
  if (!template || (personal ? !template.scopes.includes("personal") : !template.scopes.some((s) => s !== "personal"))) throw new AgentError("Elegí una tarea de la lista o contá qué necesitás.");
  if (template.module && !(await hasModule(actor.studioId, template.module))) throw new AgentError(`«${template.title}» necesita un módulo que no está en tu plan.`);
  if (template.key === "libre" && !text) throw new AgentError("Contá qué necesitás que haga.");

  // Alcance: lo que vino del formulario manda sobre lo interpretado; los IDs se validan acá
  let scope: AgentScope = personal ? "personal" : (input.scope ?? guess?.scope ?? "cartera");
  if (personal && scope !== "personal") throw new AgentError("En tu cuenta, el Agente trabaja sobre tus datos.");
  if (!template.scopes.includes(scope)) scope = template.scopes.find((s) => (personal ? s === "personal" : s !== "personal")) ?? template.scopes[0];
  const orgId = input.organizationId || (scope === "organizacion" ? guess?.organizationId : null) || null;
  let target: { id: string; name: string }[] = [];
  if (scope === "organizacion") {
    if (!orgId) throw new AgentError("Elegí la organización o nombrala en el pedido.");
    const o = await orgInStudio(actor.studioId, orgId);
    if (!o) throw new AgentError("Esa organización no es del estudio.");
    target = [o];
  } else if (scope === "cartera") {
    const only = input.organizationIds?.filter(isUuid);
    target = only?.length ? orgs.filter((o) => only.includes(o.id)) : orgs;
    if (!target.length) throw new AgentError("No hay organizaciones activas para revisar.");
  }
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(input.period ?? "") ? input.period! : (guess?.period ?? (template.needs.includes("periodo") ? today.slice(0, 7) : null));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "") ? input.date! : (guess?.date ?? (template.needs.includes("fecha") ? today : null));
  const plan = await buildPlan(actor.studioId, template, scope, target, { period, date, today });
  const where = scope === "organizacion" ? target[0].name : scope === "cartera" ? `${target.length} ${target.length === 1 ? "organización" : "organizaciones"}` : "tu cuenta";
  const title = `${template.title}${period && template.needs.includes("periodo") ? ` · ${periodLabel(period)}` : ""}${date && template.needs.includes("fecha") ? ` · al ${formatDate(date, "numeric")}` : ""} · ${where}`;
  const [row] = await db()
    .insert(agent_tasks)
    .values({
      studio_id: actor.studioId,
      scope,
      organization_id: scope === "organizacion" ? target[0].id : null,
      created_by: actor.id,
      routine_id: input.routineId ?? null,
      template_key: template.key,
      title: title.slice(0, 200),
      prompt: text || template.example,
      params: { period, date, organizationIds: target.map((o) => o.id) },
      plan,
    })
    .returning({ id: agent_tasks.id });
  await event(row.id, "plan", `Plan armado: ${plan.length} pasos.`);
  await audit({ studioId: actor.studioId, organizationId: scope === "organizacion" ? target[0].id : null, actor, action: "agente.tarea_crear", entityType: "agente_tarea", entityId: row.id, metadata: { plantilla: template.key, alcance: scope, organizaciones: target.length, rutina: input.routineId ?? null } });
  return row.id;
}

async function ownTask(actor: Pick<AgentActor, "studioId">, id: string) {
  if (!isUuid(id)) return null;
  const [t] = await db()
    .select()
    .from(agent_tasks)
    .where(and(eq(agent_tasks.id, id), eq(agent_tasks.studio_id, actor.studioId)));
  return t ?? null;
}

export async function getTask(actor: AgentActor, id: string) {
  const t = await ownTask(actor, id);
  if (!t) return null;
  const events = await db().select().from(agent_task_events).where(eq(agent_task_events.task_id, t.id)).orderBy(desc(agent_task_events.created_at)).limit(200);
  const [creator] = t.created_by ? await db().select({ name: users.name }).from(users).where(eq(users.id, t.created_by)) : [];
  return { task: t, events, creator: creator?.name ?? null };
}

export async function listTasks(actor: AgentActor, view: "en_curso" | "historial", limit = 50) {
  const active = ["pendiente", "en_curso", "pausada"];
  return db()
    .select({ id: agent_tasks.id, title: agent_tasks.title, status: agent_tasks.status, template: agent_tasks.template_key, plan: agent_tasks.plan, report: agent_tasks.report, cost: agent_tasks.cost_usd, created_at: agent_tasks.created_at, finished_at: agent_tasks.finished_at, routine_id: agent_tasks.routine_id })
    .from(agent_tasks)
    .where(and(eq(agent_tasks.studio_id, actor.studioId), view === "en_curso" ? inArray(agent_tasks.status, active) : sql`${agent_tasks.status} not in ('pendiente','en_curso','pausada')`))
    .orderBy(desc(agent_tasks.created_at))
    .limit(limit);
}

export async function setTaskState(actor: AgentActor, id: string, action: "pausar" | "reanudar" | "cancelar") {
  await requireAgent(actor);
  const t = await ownTask(actor, id);
  if (!t) throw new AgentError("Esa tarea no existe.");
  const from = { pausar: ["pendiente", "en_curso"], reanudar: ["pausada"], cancelar: ["pendiente", "en_curso", "pausada"] }[action];
  if (!from.includes(t.status)) throw new AgentError("La tarea ya no está en un estado que permita eso.");
  const status = { pausar: "pausada", reanudar: "pendiente", cancelar: "cancelada" }[action];
  const plan = action === "cancelar" ? t.plan.map((s) => (s.status === "pendiente" || s.status === "en_curso" ? { ...s, status: "saltado" as const } : s)) : t.plan;
  const [done] = await db()
    .update(agent_tasks)
    .set({ status, plan, next_attempt_at: new Date(), ...(action === "cancelar" ? { finished_at: new Date() } : {}) })
    .where(and(eq(agent_tasks.id, t.id), inArray(agent_tasks.status, from)))
    .returning({ id: agent_tasks.id });
  if (!done) throw new AgentError("La tarea cambió mientras tanto. Volvé a intentar.");
  await event(t.id, "nota", action === "pausar" ? "Pausada: sigue desde el próximo paso cuando la reanudes." : action === "reanudar" ? "Reanudada." : "Cancelada: no se ejecutan los pasos que faltaban.");
  await audit({ studioId: actor.studioId, organizationId: t.organization_id, actor, action: `agente.tarea_${action}`, entityType: "agente_tarea", entityId: t.id });
}

// ───────────── Modelo y análisis libre ─────────────

type ModelPick = { model: LanguageModel; name: string; cost: (i: number, o: number) => number; record: (i: number, o: number, userId: string) => Promise<void> };

/** Modelo para planificar y analizar: el del estudio (tarea «agente») o, en cuentas personales, el de la plataforma */
async function agentModel(studioId: string, tenantKind: string): Promise<ModelPick | null> {
  const own = await resolveModel(studioId, "agente");
  if (own) {
    return {
      model: languageModel(own.provider, own.model),
      name: own.model,
      cost: (i, o) => estimateCost(own.model, i, o),
      record: (i, o, userId) => recordUsage({ studioId, provider: own.provider, model: own.model, task: "agente", userId, inputTokens: i, outputTokens: o }),
    };
  }
  if (tenantKind === "studio") return null;
  const p = await getPlatformAi();
  if (!isConfigured(p)) return null;
  const name = p.model_agent || p.model_primary;
  return {
    model: platformModel(p, name),
    name,
    cost: (i, o) => costUsd(p, i, o),
    record: async (i, o, userId) => {
      await db().insert(ai_usage).values({ studio_id: studioId, provider_kind: "plataforma", model: name, task: "agente", user_id: userId, input_tokens: i, output_tokens: o, cost_usd: costUsd(p, i, o).toFixed(6) });
    },
  };
}

/** Herramientas del registro para el modelo: cada llamada pasa por executeTool y queda en la bitácora de la tarea */
function agentTools(ctx: ToolContext, taskId: string, stepId: string): ToolSet {
  const tools: ToolSet = {};
  for (const t of TOOLS) {
    if (!toolAllowed(t, ctx)) continue;
    tools[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema(inputJsonSchema(t) as never),
      execute: async (input: unknown) => {
        const o = await executeTool(t.name, input, ctx);
        await event(taskId, "herramienta", `${t.title}: ${o.status === "ok" ? "listo" : o.status === "aprobacion" ? "quedó en Propuestas para aprobar" : "message" in o ? o.message : o.status}`, stepId, { herramienta: t.name, estado: o.status, aprobacion: "approvalId" in o ? o.approvalId : null });
        if (o.status === "ok") return o.result;
        if (o.status === "aprobacion" || o.status === "confirmacion") return { estado: "enviado_a_aprobacion", aprobacion_id: o.approvalId, resumen: o.summary, nota: "No se ejecutó: quedó como borrador en Propuestas para aprobar." };
        return { estado: o.status, motivo: o.message };
      },
    });
  }
  return tools;
}

async function memoryFor(studioId: string, orgIds: string[]) {
  const rows = await db()
    .select({ org: agent_memory.organization_id, content: agent_memory.content, subject: agent_memory.subject })
    .from(agent_memory)
    .where(and(eq(agent_memory.studio_id, studioId), orgIds.length ? or(isNull(agent_memory.organization_id), inArray(agent_memory.organization_id, orgIds)) : isNull(agent_memory.organization_id)))
    .limit(80);
  return rows.map((r) => `${r.subject ? `${r.subject}: ` : ""}${r.content}`);
}

async function runAnalysis(task: typeof agent_tasks.$inferSelect, step: AgentPlanStep, ctx: ToolContext, tenantKind: string, cap: number): Promise<StepOutcome & { text?: string }> {
  const pick = await agentModel(task.studio_id, tenantKind);
  if (!pick) return { status: "error", message: tenantKind === "studio" ? "Configurá un modelo en Configuración → IA (tarea «Agente» o el modelo por defecto) para las tareas libres." : "El modelo de la plataforma no está configurado." };
  if (Number(task.cost_usd) >= cap) return { status: "error", message: "Se alcanzó el tope de gasto de IA de esta tarea." };
  const orgIds = ((task.params.organizationIds as string[] | undefined) ?? []).slice(0, 60);
  const orgs = orgIds.length ? await db().select({ id: organizations.id, name: organizations.name }).from(organizations).where(and(eq(organizations.studio_id, task.studio_id), inArray(organizations.id, orgIds))) : [];
  const memory = await memoryFor(task.studio_id, orgIds);
  const system = `Sos el ${AGENT_NAME} de Faro: un trabajador que resuelve una tarea en varios pasos con las herramientas de Faro y deja un informe. Hoy es ${formatDate(todayAR(), "full")}.
Cómo trabajás:
- Empezá con «Plan:» y una lista corta de pasos. Después usá las herramientas para cada paso. Nunca inventes datos: si algo no está, decilo.
- Lo sensible (comunicaciones a clientes, datos fiscales, pagos) queda en Propuestas para aprobar: decí que quedó como borrador.
- Terminá con «Informe:» y hallazgos con su importancia (alta, media o baja), en español rioplatense.
${SHIELD_PROMPT}
${orgs.length ? `Organizaciones de la tarea (usá estos IDs):\n${orgs.map((o) => `- ${o.name} · id ${o.id}`).join("\n")}` : ""}
${memory.length ? `Criterios que dejó el contador (memoria del ${AGENT_SHORT}):\n${memory.map((m) => `- ${m}`).join("\n")}` : ""}`;
  try {
    const r = await generateText({ model: pick.model, system, prompt: task.prompt, tools: agentTools(ctx, task.id, step.id), stopWhen: stepCountIs(10) });
    const i = r.totalUsage?.inputTokens ?? 0;
    const o = r.totalUsage?.outputTokens ?? 0;
    await pick.record(i, o, ctx.actor.id);
    await db()
      .update(agent_tasks)
      .set({ cost_usd: sql`${agent_tasks.cost_usd} + ${pick.cost(i, o).toFixed(6)}`, tokens: sql`${agent_tasks.tokens} + ${i + o}`, model: pick.name })
      .where(eq(agent_tasks.id, task.id));
    return { status: "ok", result: { texto: r.text }, text: r.text };
  } catch (error) {
    console.error("[agente] análisis", (error as Error).message);
    return { status: "error", message: "El modelo no respondió. Probá de nuevo más tarde." };
  }
}

// ───────────── Motor (cola) ─────────────

async function taskActor(t: typeof agent_tasks.$inferSelect) {
  if (!t.created_by) return null;
  const [u] = await db()
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, studioId: users.studioId, active: users.active, kind: studios.kind })
    .from(users)
    .innerJoin(studios, eq(studios.id, users.studioId))
    .where(eq(users.id, t.created_by));
  if (!u || !u.active || u.studioId !== t.studio_id || !MODULE_ROLES().includes(u.role)) return null;
  return u;
}

const savePlan = (id: string, plan: AgentPlanStep[], extra: Partial<typeof agent_tasks.$inferInsert> = {}) => db().update(agent_tasks).set({ plan, ...extra }).where(eq(agent_tasks.id, id));

async function currentStatus(id: string) {
  const [r] = await db().select({ status: agent_tasks.status }).from(agent_tasks).where(eq(agent_tasks.id, id));
  return r?.status ?? "cancelada";
}

/** Una vuelta sobre una tarea: avanza pasos hasta terminar, pausarse o agotar el tiempo */
async function processTask(id: string) {
  const started = Date.now();
  const [t] = await db().select().from(agent_tasks).where(eq(agent_tasks.id, id));
  if (!t) return;
  const u = await taskActor(t);
  if (!u) {
    await db().update(agent_tasks).set({ status: "error", error: "Quien pidió la tarea ya no tiene acceso.", finished_at: new Date(), locked_until: null }).where(eq(agent_tasks.id, id));
    return;
  }
  if (!(await hasModule(t.studio_id, "agent"))) {
    await db().update(agent_tasks).set({ status: "error", error: `El ${AGENT_NAME} ya no está en el plan.`, finished_at: new Date(), locked_until: null }).where(eq(agent_tasks.id, id));
    return;
  }
  const e = await getEntitlements(t.studio_id);
  const cap = USD_CAP[e?.plan.ai ?? "consultas"];
  const ctx: ToolContext = { studioId: t.studio_id, actor: { id: u.id, email: u.email, name: u.name, role: u.role as StaffRole }, origin: "agente", organizationIds: null, modules: null, canWrite: true };
  const plan = [...t.plan];
  const results = { ...(t.results as Record<string, StepOutcome>) };
  for (let i = 0; i < plan.length; i++) {
    const s = plan[i];
    if (s.status !== "pendiente" && s.status !== "en_curso") continue;
    if (Date.now() - started > SLICE_MS) break;
    if ((await currentStatus(id)) !== "en_curso") return; // pausada o cancelada entre pasos
    plan[i] = { ...s, status: "en_curso" };
    await savePlan(id, plan);
    if (s.kind === "herramienta" && s.tool) {
      const o = await executeTool(s.tool, s.input ?? {}, ctx);
      results[s.id] = o as StepOutcome;
      const ok = o.status === "ok" || o.status === "aprobacion" || o.status === "confirmacion";
      plan[i] = { ...s, status: ok ? "hecho" : o.status === "denegado" ? "saltado" : "error", detail: ok ? (o.status === "ok" ? null : "Quedó como borrador en Propuestas para aprobar.") : "message" in o ? o.message : null };
      await event(id, o.status === "aprobacion" ? "borrador" : ok ? "paso" : "error", `${s.title}: ${plan[i].detail ?? "listo"}`, s.id);
    } else if (s.kind === "analisis") {
      const o = await runAnalysis(t, s, ctx, u.kind, cap);
      results[s.id] = o;
      plan[i] = { ...s, status: o.status === "ok" ? "hecho" : "error", detail: o.status === "ok" ? null : "message" in o ? o.message : null };
      await event(id, o.status === "ok" ? "paso" : "error", o.status === "ok" ? `${s.title}: listo` : `${s.title}: ${plan[i].detail}`, s.id);
    } else if (s.kind === "informe") {
      const report = await finishReport(t, plan, results, ctx);
      plan[i] = { ...s, status: "hecho" };
      const failed = plan.every((x) => x.kind === "informe" || x.status === "error" || x.status === "saltado") && plan.some((x) => x.status === "error");
      await savePlan(id, plan, { results: results as never, report, status: failed ? "error" : "completada", error: failed ? "Ningún paso se pudo hacer." : null, finished_at: new Date(), locked_until: null });
      await event(id, "nota", report.summary);
      await afterFinish({ ...t, report }, u);
      return;
    }
    await db().update(agent_tasks).set({ plan, results: results as never }).where(eq(agent_tasks.id, id));
  }
  // Se acabó el tiempo de esta vuelta: suelta el turno y sigue en la próxima
  await db().update(agent_tasks).set({ locked_until: null, next_attempt_at: new Date() }).where(and(eq(agent_tasks.id, id), eq(agent_tasks.status, "en_curso")));
}

async function finishReport(t: typeof agent_tasks.$inferSelect, plan: AgentPlanStep[], results: Record<string, StepOutcome>, ctx: ToolContext): Promise<AgentReport> {
  const ids = [...new Set(plan.map((s) => s.organizationId).filter((x): x is string => !!x))];
  const names = ids.length ? await db().select({ id: organizations.id, name: organizations.name }).from(organizations).where(and(eq(organizations.studio_id, t.studio_id), inArray(organizations.id, ids))) : [];
  const report = buildReport(plan, results, { today: todayAR(), orgNames: Object.fromEntries(names.map((n) => [n.id, n.name])), title: getTemplate(t.template_key)?.title ?? AGENT_NAME });
  // Lo que escribió el modelo en una tarea libre va al informe, como borrador
  const analysis = plan.find((s) => s.kind === "analisis");
  const text = analysis && results[analysis.id]?.status === "ok" ? ((results[analysis.id] as { result: { texto?: string } }).result.texto ?? "") : "";
  if (text) report.summary = `${text.trim()}\n\n${report.summary}`;
  // Tareas del equipo para lo de importancia alta (una por organización, como máximo 20)
  const seen = new Set<string>();
  for (const f of report.findings.filter((x) => x.severity === "alta" && x.organizationId)) {
    if (seen.has(f.organizationId!) || seen.size >= 20) continue;
    seen.add(f.organizationId!);
    const o = await executeTool("crear_tarea", { titulo: `${f.title}`.slice(0, 160), organizacion_id: f.organizationId, vence: addDays(todayAR(), 3), detalle: `${f.detail ?? ""}\n\nLa detectó el ${AGENT_NAME} en «${t.title}».`.trim().slice(0, 2000) }, ctx);
    if (o.status === "ok") {
      const r = o.result as { tarea?: string };
      report.tasks.push({ id: r.tarea ?? "", title: `${f.title} · ${f.organizationName ?? ""}` });
    }
  }
  return report;
}

/** Aviso a quien la pidió; las rutinas mandan además el resumen por sus canales */
async function afterFinish(t: typeof agent_tasks.$inferSelect & { report: AgentReport }, u: { id: string; email: string; name: string }) {
  const href = `/admin/vigia/agente/${t.id}`;
  const high = t.report.findings.filter((f) => f.severity === "alta").length;
  await notify([u.id], { kind: "aviso", title: `${AGENT_SHORT}: «${t.title}» está lista`, body: high ? `${high} hallazgos de importancia alta.` : "Sin hallazgos de importancia alta.", href, refId: t.id });
  if (!t.routine_id) return;
  const [r] = await db().select().from(agent_routines).where(eq(agent_routines.id, t.routine_id));
  if (!r) return;
  if (r.channels.includes("mail")) {
    const items = t.report.findings.slice(0, 10).map((f) => `<li><strong>${f.severity === "alta" ? "Alta" : f.severity === "media" ? "Media" : "Baja"}</strong> · ${escapeHtml(f.title)}${f.organizationName ? ` (${escapeHtml(f.organizationName)})` : ""}</li>`);
    const base = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "";
    await sendMail({ to: u.email, subject: `${AGENT_NAME}: ${t.title}`, html: mailLayout(t.title, `<p>${escapeHtml(t.report.summary)}</p>${items.length ? `<ul>${items.join("")}</ul>` : ""}`, { href: `${base}${href}`, label: "Ver el informe" }, "Faro") });
  }
  if (r.channels.includes("whatsapp")) {
    const { notifyUserWhatsApp } = await import("@/modules/whatsapp/server");
    const sent = await notifyUserWhatsApp(t.studio_id, u.id, `${t.title}: ${high ? `${high} hallazgos de importancia alta` : "sin hallazgos de importancia alta"}. Mirá el informe en Faro.`);
    if (!sent) await event(t.id, "nota", "No se mandó por WhatsApp: no hay un número verificado con avisos activados.");
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Toma tareas listas sin pisarse con otra instancia y las avanza */
export async function runAgentWorker() {
  const routines = await runDueRoutines();
  const claimed = (await db().execute(sql`
    update agent_tasks set status = 'en_curso', started_at = coalesce(started_at, now()), locked_until = now() + ${`${LOCK_MS} milliseconds`}::interval
    where id in (
      select id from agent_tasks
      where status in ('pendiente', 'en_curso') and next_attempt_at <= now() and (locked_until is null or locked_until < now())
      order by next_attempt_at limit 3 for update skip locked
    ) returning id`)) as unknown as { id: string }[];
  for (const { id } of claimed) {
    try {
      await processTask(id);
    } catch (error) {
      console.error("[agente]", (error as Error).message);
      await db().update(agent_tasks).set({ status: "error", error: "Error interno al ejecutar la tarea.", locked_until: null, finished_at: new Date() }).where(eq(agent_tasks.id, id));
    }
  }
  return { tareas: claimed.length, rutinas: routines };
}

// ───────────── Rutinas ─────────────

export async function listRoutines(actor: AgentActor) {
  return db()
    .select({ r: agent_routines, org: organizations.name })
    .from(agent_routines)
    .leftJoin(organizations, eq(organizations.id, agent_routines.organization_id))
    .where(eq(agent_routines.studio_id, actor.studioId))
    .orderBy(asc(agent_routines.name));
}

export async function saveRoutine(actor: AgentActor, i: { name: string; templateKey: string; scope: AgentScope; organizationId: string | null; schedule: unknown; channels: string[] }) {
  await requireAgent(actor);
  if (!["dueno", "contador", "titular"].includes(actor.role)) throw new AgentError("Las rutinas las arman el dueño, un contador o el titular.");
  const template = getTemplate(i.templateKey);
  if (!template?.routine) throw new AgentError("Esa tarea no se puede programar.");
  const schedule = parseSchedule(i.schedule);
  if (!schedule) throw new AgentError("Revisá cuándo corre la rutina.");
  const personal = actor.tenantKind !== "studio";
  const scope: AgentScope = personal ? "personal" : i.scope === "organizacion" ? "organizacion" : "cartera";
  if (!template.scopes.includes(scope)) throw new AgentError("Esa tarea no se puede programar con ese alcance.");
  if (scope === "organizacion" && !(i.organizationId && (await orgInStudio(actor.studioId, i.organizationId)))) throw new AgentError("Elegí una organización del estudio.");
  if (schedule.tipo === "antes_vencimiento" && scope === "personal") throw new AgentError("En tu cuenta usá una rutina mensual o semanal.");
  const channels = [...new Set(i.channels.filter((c) => ["app", "mail", "whatsapp"].includes(c)))];
  const [row] = await db()
    .insert(agent_routines)
    .values({ studio_id: actor.studioId, scope, organization_id: scope === "organizacion" ? i.organizationId : null, created_by: actor.id, name: i.name.trim().slice(0, 120) || template.title, template_key: template.key, schedule, channels: channels.length ? channels : ["app"], next_run_at: nextRun(schedule, new Date()) })
    .returning({ id: agent_routines.id });
  await audit({ studioId: actor.studioId, organizationId: scope === "organizacion" ? i.organizationId : null, actor, action: "agente.rutina_crear", entityType: "agente_rutina", entityId: row.id, metadata: { plantilla: template.key, cuando: schedule } });
  return row.id;
}

export async function setRoutineState(actor: AgentActor, id: string, action: "pausar" | "activar" | "borrar") {
  await requireAgent(actor);
  if (!["dueno", "contador", "titular"].includes(actor.role)) throw new AgentError("Las rutinas las manejan el dueño, un contador o el titular.");
  if (!isUuid(id)) throw new AgentError("Esa rutina no existe.");
  const where = and(eq(agent_routines.id, id), eq(agent_routines.studio_id, actor.studioId));
  const [r] = await db().select().from(agent_routines).where(where);
  if (!r) throw new AgentError("Esa rutina no existe.");
  if (action === "borrar") await db().delete(agent_routines).where(where);
  else {
    const s = parseSchedule(r.schedule);
    await db().update(agent_routines).set({ status: action === "pausar" ? "pausada" : "activa", next_run_at: action === "activar" && s ? nextRun(s, new Date()) : r.next_run_at }).where(where);
  }
  await audit({ studioId: actor.studioId, organizationId: r.organization_id, actor, action: `agente.rutina_${action}`, entityType: "agente_rutina", entityId: r.id });
}

/** Organizaciones con ese impuesto venciendo dentro de `dias` días (rutina «antes del vencimiento») */
async function orgsDueSoon(studioId: string, s: Extract<RoutineSchedule, { tipo: "antes_vencimiento" }>) {
  const day = addDays(todayAR(), s.dias);
  const rows = await db()
    .selectDistinct({ id: obligations.organization_id })
    .from(obligations)
    .innerJoin(organizations, eq(organizations.id, obligations.organization_id))
    .where(and(eq(obligations.studio_id, studioId), eq(organizations.studio_id, studioId), sql`lower(${obligations.tax}) like ${`%${s.impuesto.toLowerCase()}%`}`, eq(obligations.due_date, day), inArray(obligations.status, ["pendiente", "en_proceso"])));
  return rows.map((r) => r.id);
}

/** Rutinas vencidas → tareas (cada rutina corre en una sola instancia: se toma con skip locked) */
async function runDueRoutines() {
  const due = (await db().execute(sql`
    select id from agent_routines where status = 'activa' and next_run_at <= now() order by next_run_at limit 10 for update skip locked`)) as unknown as { id: string }[];
  let created = 0;
  for (const { id } of due) {
    const [r] = await db().select().from(agent_routines).where(eq(agent_routines.id, id));
    const s = r && parseSchedule(r.schedule);
    if (!r || !s) continue;
    // Se corre el próximo turno antes de crear la tarea: si algo falla, no se repite en bucle
    const [moved] = await db()
      .update(agent_routines)
      .set({ next_run_at: nextRun(s, new Date()), last_run_at: new Date() })
      .where(and(eq(agent_routines.id, r.id), lte(agent_routines.next_run_at, new Date())))
      .returning({ id: agent_routines.id });
    if (!moved || !r.created_by) continue;
    const [u] = await db()
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, studioId: users.studioId, active: users.active, kind: studios.kind })
      .from(users)
      .innerJoin(studios, eq(studios.id, users.studioId))
      .where(eq(users.id, r.created_by));
    if (!u?.active || u.studioId !== r.studio_id) continue;
    const actor: AgentActor = { id: u.id, email: u.email, name: u.name, role: u.role, studioId: u.studioId, tenantKind: u.kind };
    try {
      if (s.tipo === "antes_vencimiento") {
        const ids = await orgsDueSoon(r.studio_id, s);
        if (!ids.length) continue;
        await createTask(actor, { templateKey: r.template_key, scope: "cartera", organizationIds: ids, routineId: r.id });
      } else {
        await createTask(actor, { templateKey: r.template_key, scope: r.scope as AgentScope, organizationId: r.organization_id, routineId: r.id });
      }
      created++;
    } catch (error) {
      console.error("[agente] rutina", r.id, (error as Error).message);
    }
  }
  return created;
}

// ───────────── Memoria ─────────────

export async function listMemory(actor: AgentActor) {
  return db()
    .select({ m: agent_memory, org: organizations.name })
    .from(agent_memory)
    .leftJoin(organizations, eq(organizations.id, agent_memory.organization_id))
    .where(eq(agent_memory.studio_id, actor.studioId))
    .orderBy(asc(organizations.name), desc(agent_memory.updated_at))
    .limit(300);
}

export async function saveMemory(actor: AgentActor, i: { id?: string | null; organizationId: string | null; subject: string | null; content: string }) {
  await requireAgent(actor);
  const content = i.content.trim().slice(0, 1000);
  if (content.length < 3) throw new AgentError("Escribí el criterio.");
  if (i.organizationId && !(await orgInStudio(actor.studioId, i.organizationId))) throw new AgentError("Esa organización no es del estudio.");
  const values = { organization_id: i.organizationId || null, subject: i.subject?.trim().slice(0, 80) || null, content, source: "contador", created_by: actor.id };
  let id = i.id ?? null;
  if (id) {
    if (!isUuid(id)) throw new AgentError("Ese criterio no existe.");
    const [done] = await db()
      .update(agent_memory)
      .set(values)
      .where(and(eq(agent_memory.id, id), eq(agent_memory.studio_id, actor.studioId)))
      .returning({ id: agent_memory.id });
    if (!done) throw new AgentError("Ese criterio no existe.");
  } else {
    [{ id }] = await db().insert(agent_memory).values({ studio_id: actor.studioId, ...values }).returning({ id: agent_memory.id });
  }
  await audit({ studioId: actor.studioId, organizationId: values.organization_id, actor, action: "agente.memoria_guardar", entityType: "agente_memoria", entityId: id! });
}

export async function deleteMemory(actor: AgentActor, id: string) {
  await requireAgent(actor);
  if (!isUuid(id)) throw new AgentError("Ese criterio no existe.");
  const [done] = await db()
    .delete(agent_memory)
    .where(and(eq(agent_memory.id, id), eq(agent_memory.studio_id, actor.studioId)))
    .returning({ id: agent_memory.id, org: agent_memory.organization_id });
  if (!done) throw new AgentError("Ese criterio no existe.");
  await audit({ studioId: actor.studioId, organizationId: done.org, actor, action: "agente.memoria_borrar", entityType: "agente_memoria", entityId: id });
}

/** Costo y cantidad de tareas del mes (para la pantalla) */
export async function monthUsage(studioId: string) {
  const ar = new Date(Date.now() - 3 * 3600_000);
  const first = new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), 1, 3));
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int`, usd: sql<string>`coalesce(sum(${agent_tasks.cost_usd}), 0)` })
    .from(agent_tasks)
    .where(and(eq(agent_tasks.studio_id, studioId), gte(agent_tasks.created_at, first)));
  return { tasks: r.n, usd: Number(r.usd) };
}
