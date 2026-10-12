import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { approvals, fee_charges, flow_events, flow_runs, flow_steps, flows, organizations, payslips, tasks, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { esc, sendMail } from "@/lib/email";
import { checkLimit, getEntitlements, hasModule } from "@/lib/faro/entitlements";
import { mailLayout } from "@/lib/notify";
import { getSiteUrl } from "@/lib/runtime-config";
import { notify } from "@/modules/notifications/server";
import { executeTool, getTool } from "@/modules/tools";
import { moduleOfTool } from "@/modules/registry";
import { EVENTS, evalCondition, flowFromPhrase, getTemplate, interpolate, nextNodes, nextScheduled, retryAt, validateGraph, type ActionData, type ConditionData, type Graph, type Trigger } from "./core";

// Motor de flujos: cola en Postgres (FOR UPDATE SKIP LOCKED), reintentos con
// espera creciente, idempotencia por corrida y por paso, registro de cada
// paso y pausa. Las herramientas corren con el rol de quien activó el flujo
// y con origen «flujo»: lo sensible (fiscal, pagos, comunicaciones) queda en
// Aprobaciones y la corrida espera hasta que una persona decide.

const db = () => getDb();
const UUID = /^[0-9a-f-]{36}$/i;
export class FlowError extends Error {}
type Actor = { id: string; email: string; name?: string };
type Flow = typeof flows.$inferSelect;
type Run = typeof flow_runs.$inferSelect;

const triggerOf = (g: Graph): Trigger | null => (g.nodes.find((n) => n.type === "disparador")?.data as Trigger | undefined) ?? null;

/** Herramientas que el estudio puede usar en un flujo (las de sus módulos) */
export async function availableTools(studioId: string) {
  const e = await getEntitlements(studioId);
  const { TOOLS } = await import("@/modules/tools/registry");
  return TOOLS.filter((t) => {
    const m = moduleOfTool(t.name);
    return !m || !!e?.modules.has(m);
  }).map((t) => ({ name: t.name, title: t.title, level: typeof t.level === "function" ? "segun_datos" : t.level }));
}

async function requireFlows(studioId: string) {
  if (!(await hasModule(studioId, "flows"))) throw new FlowError("Los flujos no están incluidos en el plan.");
}

// ───────────── ABM ─────────────

export async function listFlows(studioId: string) {
  return db().select().from(flows).where(eq(flows.studio_id, studioId)).orderBy(desc(flows.updated_at));
}

export async function getFlow(studioId: string, id: string) {
  if (!UUID.test(id)) return null;
  const [f] = await db().select().from(flows).where(and(eq(flows.id, id), eq(flows.studio_id, studioId)));
  return f ?? null;
}

async function insertFlow(studioId: string, actor: Actor, name: string, graph: Graph, templateKey: string | null, description: string | null) {
  await requireFlows(studioId);
  const t = triggerOf(graph);
  const [f] = await db()
    .insert(flows)
    .values({ studio_id: studioId, name: name.slice(0, 120), description, graph: graph as unknown as Record<string, unknown>, template_key: templateKey, trigger_type: t?.tipo ?? "vigia", trigger_event: t?.tipo === "evento" ? t.evento : null, created_by: actor.id, updated_by: actor.id })
    .returning();
  await audit({ studioId, actor, action: "flujo.creado", entityType: "flujo", entityId: f.id, metadata: { plantilla: templateKey } });
  return f;
}

export async function createFromTemplate(studioId: string, actor: Actor, key: string) {
  const t = getTemplate(key);
  if (!t) throw new FlowError("Esa plantilla no existe.");
  return insertFlow(studioId, actor, t.name, t.build(), t.key, t.description);
}

export async function createBlank(studioId: string, actor: Actor) {
  return insertFlow(studioId, actor, "Flujo nuevo", { nodes: [{ id: "n1", type: "disparador", position: { x: 0, y: 0 }, data: { tipo: "evento", evento: "factura.emitida" } }], edges: [] }, null, null);
}

/** El Vigía propone un flujo desde una frase: queda en borrador para revisar */
export async function createFromPhrase(studioId: string, actor: Actor, frase: string) {
  if (frase.trim().length < 8) throw new FlowError("Contame qué querés automatizar.");
  const r = flowFromPhrase(frase);
  const f = await insertFlow(studioId, actor, r.name, r.graph, null, r.explicacion);
  return { flow: f, explicacion: r.explicacion };
}

export async function saveFlow(studioId: string, actor: Actor, id: string, i: { name: string; graph: Graph }) {
  const f = await getFlow(studioId, id);
  if (!f) throw new FlowError("No encontramos ese flujo.");
  const known = new Set((await availableTools(studioId)).map((t) => t.name));
  const issues = validateGraph(i.graph, known);
  if (f.status === "activo" && issues.length) throw new FlowError(`No se puede guardar un flujo activo con errores: ${issues[0].message}`);
  const t = triggerOf(i.graph);
  await db()
    .update(flows)
    .set({ name: i.name.trim().slice(0, 120) || f.name, graph: i.graph as unknown as Record<string, unknown>, trigger_type: t?.tipo ?? "vigia", trigger_event: t?.tipo === "evento" ? t.evento : null, next_run_at: f.status === "activo" && t?.tipo === "horario" ? nextScheduled(t) : f.next_run_at, version: f.version + 1, updated_by: actor.id })
    .where(eq(flows.id, f.id));
  await audit({ studioId, actor, action: "flujo.editado", entityType: "flujo", entityId: f.id, metadata: { version: f.version + 1 } });
  return issues;
}

/** Activar (valida y respeta el límite del plan), pausar o reanudar */
export async function setFlowStatus(studioId: string, actor: Actor, id: string, status: "activo" | "pausado") {
  const f = await getFlow(studioId, id);
  if (!f) throw new FlowError("No encontramos ese flujo.");
  await requireFlows(studioId);
  const g = f.graph as unknown as Graph;
  if (status === "activo") {
    const issues = validateGraph(g, new Set((await availableTools(studioId)).map((t) => t.name)));
    if (issues.length) throw new FlowError(issues[0].message);
    if (f.status !== "activo") {
      const limit = await checkLimit(studioId, "flows");
      if (limit) throw new FlowError(limit);
    }
  }
  const t = triggerOf(g);
  await db()
    .update(flows)
    .set({ status, updated_by: actor.id, next_run_at: status === "activo" && t?.tipo === "horario" ? nextScheduled(t) : null, webhook_token: t?.tipo === "webhook" ? (f.webhook_token ?? randomBytes(18).toString("base64url")) : f.webhook_token })
    .where(eq(flows.id, f.id));
  await audit({ studioId, actor, action: status === "activo" ? (f.status === "pausado" ? "flujo.reanudado" : "flujo.activado") : "flujo.pausado", entityType: "flujo", entityId: f.id });
}

export async function deleteFlow(studioId: string, actor: Actor, id: string) {
  const f = await getFlow(studioId, id);
  if (!f) return;
  await db().delete(flows).where(eq(flows.id, f.id));
  await audit({ studioId, actor, action: "flujo.borrado", entityType: "flujo", entityId: f.id, metadata: { nombre: f.name } });
}

export async function listRuns(studioId: string, flowId: string) {
  return db().select().from(flow_runs).where(and(eq(flow_runs.flow_id, flowId), eq(flow_runs.studio_id, studioId))).orderBy(desc(flow_runs.created_at)).limit(50);
}

export async function runView(studioId: string, runId: string) {
  if (!UUID.test(runId)) return null;
  const [r] = await db().select().from(flow_runs).where(and(eq(flow_runs.id, runId), eq(flow_runs.studio_id, studioId)));
  if (!r) return null;
  const steps = await db().select().from(flow_steps).where(eq(flow_steps.run_id, r.id)).orderBy(asc(flow_steps.started_at));
  return { r, steps };
}

// ───────────── Disparos ─────────────

async function createRun(f: Flow, source: string, context: Record<string, unknown>, key: string) {
  const g = f.graph as unknown as Graph;
  const t = g.nodes.find((n) => n.type === "disparador");
  if (!t) return null;
  const [r] = await db()
    .insert(flow_runs)
    .values({ flow_id: f.id, studio_id: f.studio_id, idempotency_key: key.slice(0, 200), source, context: { ...context, flujo: { id: f.id, nombre: f.name }, pasos: {} }, cursor: [t.id] })
    .onConflictDoNothing()
    .returning();
  if (r) await db().update(flows).set({ last_run_at: new Date() }).where(eq(flows.id, f.id));
  return r ?? null;
}

/** Webhook entrante: el token identifica el flujo; la clave de idempotencia evita corridas repetidas */
export async function triggerWebhook(token: string, body: Record<string, unknown>, key: string) {
  if (!/^[\w-]{20,40}$/.test(token)) return { status: 404 as const };
  const [f] = await db().select().from(flows).where(and(eq(flows.webhook_token, token), eq(flows.status, "activo"), eq(flows.trigger_type, "webhook")));
  if (!f) return { status: 404 as const };
  const r = await createRun(f, "webhook", { evento: body }, `wh:${key}`);
  return { status: r ? (201 as const) : (200 as const), runId: r?.id ?? null };
}

/** Corrida a pedido: «Probar» en el canvas o el Vigía (disparador «mensaje al Vigía») */
export async function triggerManual(studioId: string, actor: Actor, flowId: string, datos: Record<string, unknown>, source: "prueba" | "vigia") {
  const f = await getFlow(studioId, flowId);
  if (!f) throw new FlowError("No encontramos ese flujo.");
  if (source === "vigia" && f.status !== "activo") throw new FlowError("Ese flujo no está activo.");
  const r = await createRun(f, source, { evento: datos, pedido_por: actor.email }, `${source}:${Date.now()}:${randomBytes(4).toString("hex")}`);
  await audit({ studioId, actor, action: "flujo.ejecutado", entityType: "flujo", entityId: f.id, metadata: { origen: source, corrida: r?.id } });
  return r!;
}

// ───────────── Ejecución ─────────────

async function staffOf(studioId: string, para: "duenos" | "equipo") {
  return db().select({ id: users.id, email: users.email }).from(users).where(and(eq(users.studioId, studioId), eq(users.active, true), inArray(users.role, para === "duenos" ? ["dueno"] : ["dueno", "contador", "colaborador"])));
}

/** Datos vivos para las condiciones: «consulta.cargo.estado», «consulta.recibo.estado» */
async function lookup(campo: string, ctx: Record<string, unknown>, studioId: string) {
  const ev = (ctx.evento ?? {}) as Record<string, unknown>;
  if (campo === "consulta.cargo.estado" && typeof ev.cargo_id === "string" && UUID.test(ev.cargo_id)) {
    const [c] = await db().select({ s: fee_charges.status }).from(fee_charges).where(and(eq(fee_charges.id, ev.cargo_id), eq(fee_charges.studio_id, studioId)));
    return c?.s ?? null;
  }
  if (campo === "consulta.recibo.estado" && typeof ev.recibo_id === "string" && UUID.test(ev.recibo_id)) {
    const [p] = await db().select({ s: payslips.status }).from(payslips).where(and(eq(payslips.id, ev.recibo_id), eq(payslips.studio_id, studioId)));
    return p?.s ?? null;
  }
  return undefined;
}

class Wait {
  constructor(
    public until: Date | null,
    public approvalId: string | null,
  ) {}
}
class Permanent extends Error {}

async function step(run: Run, nodeId: string, kind: string, status: string, input: unknown, output: unknown, error: string | null, startedAt = new Date()) {
  await db().insert(flow_steps).values({ run_id: run.id, node_id: nodeId, kind, status, attempt: run.attempts + 1, input: input as Record<string, unknown>, output: output as Record<string, unknown>, error: error?.slice(0, 500) ?? null, started_at: startedAt, finished_at: status === "esperando" ? null : new Date() });
}

async function toolCtx(f: Flow) {
  const [u] = await db().select({ id: users.id, email: users.email, name: users.name, role: users.role }).from(users).where(eq(users.id, f.updated_by ?? f.created_by ?? "00000000-0000-0000-0000-000000000000"));
  if (!u || !["dueno", "contador", "colaborador", "titular"].includes(u.role)) throw new Permanent("Quien activó el flujo ya no tiene acceso: activalo de nuevo.");
  return { studioId: f.studio_id, actor: { id: u.id, email: u.email, name: u.name, role: u.role as "dueno" }, origin: "flujo" as const, organizationIds: null, modules: null, canWrite: true };
}

async function runTool(f: Flow, name: string, input: Record<string, unknown>) {
  const t = getTool(name);
  if (!t) throw new Permanent(`La herramienta «${name}» ya no existe.`);
  const out = await executeTool(name, input, await toolCtx(f));
  if (out.status === "denegado") throw new Permanent(out.message);
  if (out.status === "error") throw new Error(out.message);
  return out;
}

/** Ejecuta un nodo; devuelve los próximos nodos o tira Wait (espera) */
async function execNode(f: Flow, run: Run, g: Graph, nodeId: string, ctx: Record<string, unknown>): Promise<string[]> {
  const n = g.nodes.find((x) => x.id === nodeId);
  if (!n) return [];
  const pasos = ctx.pasos as Record<string, unknown>;
  // Idempotencia por paso: si ya terminó bien en esta corrida (un reintento), no se repite
  const [done] = await db().select().from(flow_steps).where(and(eq(flow_steps.run_id, run.id), eq(flow_steps.node_id, n.id), eq(flow_steps.status, "ok"))).limit(1);
  if (done && n.type !== "condicion") {
    pasos[n.id] = done.output;
    return nextNodes(g, n.id);
  }
  if (n.type === "disparador") {
    await step(run, n.id, "disparador", "ok", null, { origen: run.source }, null);
    return nextNodes(g, n.id);
  }
  if (n.type === "condicion") {
    const c = n.data as ConditionData;
    const view = c.campo.startsWith("consulta.") ? { ...ctx, consulta: { cargo: { estado: await lookup("consulta.cargo.estado", ctx, f.studio_id) }, recibo: { estado: await lookup("consulta.recibo.estado", ctx, f.studio_id) } } } : ctx;
    const ok = evalCondition(c, view);
    await step(run, n.id, "condicion", "ok", c, { resultado: ok ? "si" : "no" }, null);
    return nextNodes(g, n.id, ok ? "si" : "no");
  }
  if (n.type === "espera") {
    const d = n.data as { dias?: number; horas?: number };
    const [waiting] = await db().select().from(flow_steps).where(and(eq(flow_steps.run_id, run.id), eq(flow_steps.node_id, n.id), eq(flow_steps.status, "esperando"))).limit(1);
    const until = waiting ? new Date(waiting.started_at.getTime() + (Number(d.dias ?? 0) * 1440 + Number(d.horas ?? 0) * 60) * 60_000) : new Date(Date.now() + (Number(d.dias ?? 0) * 1440 + Number(d.horas ?? 0) * 60) * 60_000);
    if (waiting && until <= new Date()) {
      await db().update(flow_steps).set({ status: "ok", finished_at: new Date(), output: { esperado_hasta: until.toISOString() } }).where(eq(flow_steps.id, waiting.id));
      return nextNodes(g, n.id);
    }
    if (!waiting) await step(run, n.id, "espera", "esperando", d, { hasta: until.toISOString() }, null);
    throw new Wait(until, null);
  }
  if (n.type === "aprobacion") {
    const motivo = interpolate(String((n.data as { motivo?: string }).motivo ?? "Continuar el flujo"), ctx);
    const out = await runTool(f, "continuar_flujo", { corrida_id: run.id, paso: n.id, motivo });
    if (out.status === "aprobacion" || out.status === "confirmacion") {
      await step(run, n.id, "aprobacion", "esperando", { motivo }, { aprobacion: out.approvalId }, null);
      throw new Wait(null, out.approvalId);
    }
    await step(run, n.id, "aprobacion", "ok", { motivo }, out, null);
    return nextNodes(g, n.id);
  }
  // Acción
  const a = interpolate(n.data as ActionData, ctx);
  let output: unknown;
  if (a.accion === "herramienta") {
    if (a.por_organizacion) {
      const orgs = await db().select({ id: organizations.id }).from(organizations).where(and(eq(organizations.studio_id, f.studio_id), inArray(organizations.status, ["activa", "onboarding"])));
      const results: unknown[] = [];
      for (const o of orgs) {
        const r = await executeTool(a.herramienta, { ...a.entrada, organizacion_id: o.id }, await toolCtx(f));
        results.push({ organizacion_id: o.id, estado: r.status, ...(r.status === "aprobacion" ? { aprobacion: r.approvalId } : {}) });
      }
      output = { organizaciones: results.length, resultados: results };
    } else {
      const out = await runTool(f, a.herramienta, a.entrada);
      if (out.status === "aprobacion" || out.status === "confirmacion") {
        await step(run, n.id, "accion", "esperando", a, { aprobacion: out.approvalId, resumen: out.summary }, null);
        throw new Wait(null, out.approvalId);
      }
      output = out.status === "ok" ? out.result : out;
    }
  } else if (a.accion === "aviso") {
    const to = await staffOf(f.studio_id, a.para);
    await notify(to.map((u) => u.id), { kind: "aviso", title: a.titulo.slice(0, 140), body: a.texto?.slice(0, 280), href: `/admin/vigia/flujos/${f.id}` });
    output = { avisados: to.length };
  } else if (a.accion === "mail") {
    const to = await staffOf(f.studio_id, a.para);
    for (const u of to) await sendMail({ to: u.email, subject: a.asunto.slice(0, 140), html: mailLayout(a.asunto, `<p>${esc(a.texto)}</p><p style="color:#666">Flujo «${esc(f.name)}».</p>`, { href: `${getSiteUrl()}/admin/vigia/flujos/${f.id}`, label: "Ver el flujo" }, "Faro") });
    output = { mails: to.length };
  } else if (a.accion === "tarea") {
    let org: string | null = a.organizacion && UUID.test(String(a.organizacion)) ? String(a.organizacion) : null;
    if (org) {
      const [o] = await db().select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, org), eq(organizations.studio_id, f.studio_id)));
      org = o?.id ?? null;
    }
    const due = a.vence_en_dias ? new Date(Date.now() - 3 * 3600_000 + a.vence_en_dias * 86400000).toISOString().slice(0, 10) : null;
    const [t] = await db().insert(tasks).values({ studio_id: f.studio_id, organization_id: org, title: a.titulo.slice(0, 160), detail: a.detalle?.slice(0, 1000) ?? null, due_date: due, source: "flujo", source_ref: `${run.id}:${n.id}`, created_by: f.updated_by }).onConflictDoNothing().returning({ id: tasks.id });
    output = { tarea: t?.id ?? null };
  } else if (a.accion === "solicitud") {
    const out = await runTool(f, "crear_solicitud", { organizacion_id: a.organizacion, tipo: "consulta", asunto: a.asunto, detalle: a.mensaje });
    if (out.status === "aprobacion" || out.status === "confirmacion") {
      await step(run, n.id, "accion", "esperando", a, { aprobacion: out.approvalId }, null);
      throw new Wait(null, out.approvalId);
    }
    output = out.status === "ok" ? out.result : out;
  } else throw new Permanent("Acción desconocida.");
  pasos[n.id] = output;
  await step(run, n.id, "accion", "ok", a, output, null);
  return nextNodes(g, n.id);
}

async function process(run: Run) {
  const [f] = await db().select().from(flows).where(eq(flows.id, run.flow_id));
  if (!f) return;
  if (f.status === "pausado") {
    await db().update(flow_runs).set({ status: "pendiente", next_attempt_at: new Date(Date.now() + 5 * 60_000) }).where(eq(flow_runs.id, run.id));
    return;
  }
  const g = f.graph as unknown as Graph;
  const ctx = run.context;
  const cursor = [...run.cursor];
  let guard = 0;
  while (cursor.length && guard++ < 100) {
    const nodeId = cursor[0];
    try {
      const next = await execNode(f, run, g, nodeId, ctx);
      cursor.shift();
      cursor.push(...next);
      await db().update(flow_runs).set({ cursor, context: ctx, attempts: 0 }).where(eq(flow_runs.id, run.id));
    } catch (e) {
      if (e instanceof Wait) {
        await db().update(flow_runs).set({ status: "esperando", cursor, context: ctx, next_attempt_at: e.until ?? new Date(Date.now() + 365 * 86400000), waiting_approval_id: e.approvalId }).where(eq(flow_runs.id, run.id));
        return;
      }
      const msg = (e as Error).message;
      const attempts = run.attempts + 1;
      const next = e instanceof Permanent ? null : retryAt(attempts);
      await step(run, nodeId, g.nodes.find((x) => x.id === nodeId)?.type ?? "?", "error", null, null, msg);
      await db().update(flow_runs).set({ status: next ? "pendiente" : "error", attempts, next_attempt_at: next ?? new Date(), cursor, context: ctx, error: msg.slice(0, 500), finished_at: next ? null : new Date() }).where(eq(flow_runs.id, run.id));
      if (!next) await audit({ studioId: f.studio_id, actorLabel: "Flujos", action: "flujo.corrida_error", entityType: "corrida", entityId: run.id, result: "error", metadata: { flujo: f.name, paso: nodeId, error: msg.slice(0, 200) } });
      return;
    }
  }
  await db().update(flow_runs).set({ status: "completada", cursor: [], context: ctx, finished_at: new Date(), error: null }).where(eq(flow_runs.id, run.id));
}

/** Corridas esperando una aprobación: aprobada sigue; rechazada termina */
async function resumeApprovals() {
  const waiting = await db().select({ r: flow_runs, a: approvals }).from(flow_runs).innerJoin(approvals, eq(approvals.id, flow_runs.waiting_approval_id)).where(and(eq(flow_runs.status, "esperando"), isNotNull(flow_runs.waiting_approval_id)));
  for (const { r, a } of waiting) {
    if (a.status === "pendiente") continue;
    const node = r.cursor[0];
    const ok = a.status === "ejecutada";
    const [st] = await db().select().from(flow_steps).where(and(eq(flow_steps.run_id, r.id), eq(flow_steps.node_id, node), eq(flow_steps.status, "esperando"))).limit(1);
    if (st) await db().update(flow_steps).set({ status: ok ? "ok" : "rechazado", finished_at: new Date(), output: { aprobacion: a.id, estado: a.status, resultado: a.result ?? null } }).where(eq(flow_steps.id, st.id));
    if (ok) await db().update(flow_runs).set({ status: "pendiente", waiting_approval_id: null, next_attempt_at: new Date() }).where(eq(flow_runs.id, r.id));
    else await db().update(flow_runs).set({ status: a.status === "rechazada" ? "rechazada" : "error", waiting_approval_id: null, finished_at: new Date(), error: a.status === "rechazada" ? `Rechazado en Aprobaciones${a.reason ? `: ${a.reason}` : ""}` : `La acción aprobada falló (${a.status}).` }).where(eq(flow_runs.id, r.id));
  }
}

/** Una vuelta del motor (cada minuto): eventos → corridas, horarios, aprobaciones resueltas y la cola */
export async function runFlowWorker(now = new Date()) {
  let created = 0;
  const evs = await db().select().from(flow_events).where(isNull(flow_events.processed_at)).orderBy(asc(flow_events.created_at)).limit(200);
  for (const ev of evs) {
    const targets = await db().select().from(flows).where(and(eq(flows.studio_id, ev.studio_id), eq(flows.trigger_event, ev.name), eq(flows.status, "activo")));
    for (const f of targets) if (await createRun(f, "evento", { evento: ev.payload }, `ev:${ev.id}`)) created++;
    await db().update(flow_events).set({ processed_at: new Date() }).where(eq(flow_events.id, ev.id));
  }
  const due = await db().select().from(flows).where(and(eq(flows.status, "activo"), eq(flows.trigger_type, "horario"), lte(flows.next_run_at, now)));
  for (const f of due) {
    const t = triggerOf(f.graph as unknown as Graph);
    if (t?.tipo !== "horario") continue;
    if (await createRun(f, "horario", { evento: { programado: f.next_run_at?.toISOString() } }, `h:${f.next_run_at?.toISOString()}`)) created++;
    await db().update(flows).set({ next_run_at: nextScheduled(t, now) }).where(eq(flows.id, f.id));
  }
  await resumeApprovals();
  // Cola: toma corridas listas sin pisarse con otro proceso
  const claimed = await db().execute(sql`
    update flow_runs set status = 'en_curso', started_at = coalesce(started_at, now())
    where id in (
      select id from flow_runs
      where (status = 'pendiente' or (status = 'esperando' and waiting_approval_id is null)) and next_attempt_at <= ${now.toISOString()}::timestamptz
        and flow_id not in (select id from flows where status = 'pausado')
      order by next_attempt_at limit 25 for update skip locked
    ) returning id`);
  const ids = (claimed as unknown as { id: string }[]).map((r) => r.id);
  let ran = 0;
  for (const id of ids) {
    const [r] = await db().select().from(flow_runs).where(eq(flow_runs.id, id));
    if (r) {
      await process(r);
      ran++;
    }
  }
  return { created, ran };
}

/** Recupera corridas que quedaron «en curso» por un corte (más de 10 minutos) */
export async function recoverStuck() {
  await db().update(flow_runs).set({ status: "pendiente" }).where(and(eq(flow_runs.status, "en_curso"), lte(flow_runs.started_at, new Date(Date.now() - 10 * 60_000)), or(isNull(flow_runs.finished_at))));
}

export const EVENT_LIST = Object.entries(EVENTS).map(([k, v]) => ({ key: k, ...v }));
