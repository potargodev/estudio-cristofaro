// Agente contable (§2.q, etapa 1): plan visible, cola con pasos, pausa y
// cancelación, informe con hallazgos y borradores en Aprobaciones, interruptor
// de automatización, tarea libre con el modelo de prueba, rutinas, tope del
// plan, la herramienta del Vigía, aislamiento entre estudios forzando IDs y,
// con la demo cargada, una tarea sobre la cartera de 20 organizaciones.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/agente.mts
// (necesita datos.mjs, proveedor.mjs y el simulador de IA en :4010)

import { readFileSync } from "node:fs";
import postgres from "postgres";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message || "error";
  }
};

const agent = await import("../../src/modules/agent/server.ts");
const { setAutomation, automationAllows } = await import("../../src/modules/agent/automations.ts");
const { executeTool } = await import("../../src/modules/tools/index.ts");

const actorOf = async (id: string) => {
  const [u] = await sql`select u.id, u.name, u.email, u.studio_id, u.role, s.kind from users u join studios s on s.id = u.studio_id where u.id = ${id}`;
  return { id: u.id, name: u.name, email: u.email, role: u.role, studioId: u.studio_id, tenantKind: u.kind };
};
const A = await actorOf(d.users.adminA);
const B = await actorOf(d.users.adminB);
const colab = await actorOf(d.users.colaboradorA);
const [norte] = await sql`select id, name from organizations where id = ${d.orgs.norte}`;

/** Corre el motor hasta que la tarea termine (el servidor también puede tomarla: se espera el estado) */
async function finish(id: string, max = 80) {
  for (let i = 0; i < max; i++) {
    await agent.runAgentWorker();
    const [t] = await sql`select status from agent_tasks where id = ${id}`;
    if (!["pendiente", "en_curso"].includes(t.status)) return t.status as string;
    await new Promise((r) => setTimeout(r, 150));
  }
  return "sin terminar";
}

// El Agente está en Profesional y Avanzado: se habilita a los estudios de prueba con un override del Faro Manager
await sql`insert into tenant_modules (studio_id, module_key, enabled) values (${A.studioId}, 'agent', true), (${B.studioId}, 'agent', true) on conflict (studio_id, module_key) do update set enabled = true, expires_at = null`;
await sql`delete from agent_tasks where studio_id in ${sql([A.studioId, B.studioId])}`;
await sql`delete from agent_routines where studio_id in ${sql([A.studioId, B.studioId])}`;
await sql`delete from agent_memory where studio_id in ${sql([A.studioId, B.studioId])}`;
await sql`delete from automation_switches where studio_id in ${sql([A.studioId, B.studioId])}`;

// ─── Plan y ejecución sobre una organización ───
const t1 = await agent.createTask(A, { text: `Cerrá octubre de ${norte.name}` });
const [row1] = await sql`select template_key, scope, organization_id, params, plan, status from agent_tasks where id = ${t1}`;
check("pedido libre → cierre del mes de esa organización", row1.template_key === "cierre_mensual" && row1.scope === "organizacion" && row1.organization_id === norte.id && row1.params.period === "2026-10", JSON.stringify({ t: row1.template_key, s: row1.scope, p: row1.params.period }));
check("plan visible antes de empezar (pasos e informe)", row1.plan.length >= 4 && row1.plan.at(-1).kind === "informe" && row1.plan.every((s: { status: string }) => s.status === "pendiente"));
check("queda en la auditoría", (await sql`select 1 from audit_log where action = 'agente.tarea_crear' and entity_id = ${t1}`).length === 1);
check("termina", (await finish(t1)) === "completada");
const [done1] = await sql`select plan, report, results from agent_tasks where id = ${t1}`;
check("todos los pasos hechos o salteados", done1.plan.every((s: { status: string }) => ["hecho", "saltado"].includes(s.status)));
check("informe con resumen que no valida nada", /no reemplazan el criterio de un contador/.test(done1.report.summary));
const draft = done1.report.drafts[0];
const [ap] = draft ? await sql`select status, origin, level, tool from approvals where id = ${draft.approvalId}` : [];
check("el resumen al cliente quedó en Propuestas para aprobar (origen Agente)", ap?.status === "pendiente" && ap.origin === "agente" && ap.level === "sensible" && ap.tool === "enviar_resumen_mensual");
check("bitácora en vivo: un evento por paso", (await sql`select count(*)::int n from agent_task_events where task_id = ${t1}`)[0].n >= done1.plan.length);
check("aviso en la app a quien la pidió", (await sql`select 1 from notifications where user_id = ${A.id} and ref_id = ${t1}`).length === 1);

// ─── Pausa, reanudación y cancelación ───
const t2 = await agent.createTask(A, { templateKey: "revision_iva", scope: "cartera" });
await agent.setTaskState(A, t2, "pausar");
await agent.runAgentWorker();
const [p2] = await sql`select status, plan from agent_tasks where id = ${t2}`;
check("pausada: el motor no la toma", p2.status === "pausada" && p2.plan.every((s: { status: string }) => s.status === "pendiente"));
await agent.setTaskState(A, t2, "reanudar");
check("reanudada: termina", (await finish(t2)) === "completada");
const t3 = await agent.createTask(A, { templateKey: "tope_monotributo", scope: "cartera" });
await agent.setTaskState(A, t3, "cancelar");
const [c3] = await sql`select status, plan from agent_tasks where id = ${t3}`;
check("cancelada: los pasos que faltaban quedan salteados", c3.status === "cancelada" && c3.plan.every((s: { status: string }) => s.status === "saltado"));
check("cancelar dos veces: error claro", (await throws(() => agent.setTaskState(A, t3, "cancelar"))) !== null);

// ─── Interruptor de automatización (regla fiscal) ───
check("colaborador no activa automatizaciones", (await throws(() => setAutomation({ ...colab }, { action: "enviar_resumen_mensual", organizationId: norte.id, state: "activa" }))) !== null);
check("una acción fuera del catálogo no se automatiza (emitir comprobantes)", (await throws(() => setAutomation(A, { action: "preparar_factura", organizationId: null, state: "activa" }))) !== null);
await setAutomation(A, { action: "enviar_resumen_mensual", organizationId: norte.id, state: "activa" });
check("activada para esa organización", (await automationAllows(A.studioId, norte.id, "enviar_resumen_mensual")) && !(await automationAllows(A.studioId, d.orgs.sur, "enviar_resumen_mensual")));
const t4 = await agent.createTask(A, { templateKey: "resumen_mensual", scope: "organizacion", organizationId: norte.id });
await finish(t4);
const [r4] = await sql`select results, report from agent_tasks where id = ${t4}`;
const res4 = Object.values(r4.results)[0] as { status: string };
check("con la automatización activa, el Agente lo hace solo", res4.status === "ok" && r4.report.drafts.length === 0, res4.status);
check("…y queda en la auditoría", (await sql`select 1 from audit_log where action = 'automatizacion.ejecutar' and studio_id = ${A.studioId}`).length >= 1);
await setAutomation(A, { action: "enviar_resumen_mensual", organizationId: norte.id, state: "pausada" });
const t5 = await agent.createTask(A, { templateKey: "resumen_mensual", scope: "organizacion", organizationId: norte.id });
await finish(t5);
const [r5] = await sql`select report from agent_tasks where id = ${t5}`;
check("en pausa: vuelve a Propuestas para aprobar", r5.report.drafts.length === 1);
check("cada cambio del interruptor queda auditado", (await sql`select count(*)::int n from audit_log where action like 'automatizacion.%' and action <> 'automatizacion.ejecutar' and studio_id = ${A.studioId}`)[0].n >= 2);

// ─── Tarea libre: el modelo arma el plan y usa las herramientas ───
const t6 = await agent.createTask(A, { text: "¿Qué clientes tienen solicitudes abiertas sin responder?" });
check("pedido libre sin plantilla → tarea libre", (await sql`select template_key from agent_tasks where id = ${t6}`)[0].template_key === "libre");
check("libre: termina", (await finish(t6)) === "completada");
const [r6] = await sql`select report, cost_usd, tokens, model from agent_tasks where id = ${t6}`;
const tools6 = await sql`select data->>'herramienta' h from agent_task_events where task_id = ${t6} and kind = 'herramienta'`;
check("libre: usó las herramientas registradas (bucle del AI SDK)", tools6.some((x) => x.h === "listar_solicitudes") && tools6.some((x) => x.h === "listar_vencimientos"), tools6.map((x) => x.h).join(","));
check("libre: el informe trae el plan y los hallazgos del modelo", /Plan:/.test(r6.report.summary) && /Informe:/.test(r6.report.summary));
check("libre: costo y tokens medidos por tarea", Number(r6.cost_usd) >= 0 && r6.tokens > 0 && r6.model === "faro-mock", `${r6.tokens} tokens`);
check("libre: uso registrado como tarea «agente»", (await sql`select 1 from ai_usage where studio_id = ${A.studioId} and task = 'agente'`).length >= 1);

// ─── Rutinas ───
const rid = await agent.saveRoutine(A, { name: "Cierre de la cartera", templateKey: "cierre_mensual", scope: "cartera", organizationId: null, schedule: { tipo: "mensual", dia: 5, hora: 8 }, channels: ["app", "mail"] });
await sql`update agent_routines set next_run_at = now() - interval '1 minute' where id = ${rid}`;
await agent.runAgentWorker();
const [rt] = await sql`select next_run_at > now() as futura from agent_routines where id = ${rid}`;
check("rutina vencida → tarea creada y próxima corrida corrida", (await sql`select 1 from agent_tasks where routine_id = ${rid}`).length === 1 && rt.futura);
await agent.runAgentWorker();
check("la misma rutina no se dispara dos veces", (await sql`select count(*)::int n from agent_tasks where routine_id = ${rid}`)[0].n === 1);
const due = new Date(Date.now() - 3 * 3600_000 + 3 * 86400000).toISOString().slice(0, 10);
await sql`insert into obligations (studio_id, organization_id, tax, period, due_date, status) values (${A.studioId}, ${norte.id}, 'IVA', '2026-10', ${due}, 'pendiente')`;
const rv = await agent.saveRoutine(A, { name: "IVA 3 días antes", templateKey: "revision_iva", scope: "cartera", organizationId: null, schedule: { tipo: "antes_vencimiento", dias: 3, impuesto: "IVA", hora: 7 }, channels: ["app"] });
await sql`update agent_routines set next_run_at = now() - interval '1 minute' where id = ${rv}`;
await agent.runAgentWorker();
const [tv] = await sql`select params from agent_tasks where routine_id = ${rv}`;
check("rutina antes del vencimiento: toma las organizaciones con IVA en 3 días", tv && (tv.params.organizationIds as string[]).includes(norte.id) && !(tv.params.organizationIds as string[]).includes(d.orgs.ajena));
check("colaborador no arma rutinas", (await throws(() => agent.saveRoutine(colab, { name: "x", templateKey: "cierre_mensual", scope: "cartera", organizationId: null, schedule: { tipo: "mensual", dia: 5, hora: 8 }, channels: [] }))) !== null);

// ─── Memoria ───
await agent.saveMemory(A, { organizationId: norte.id, subject: "Edenor", content: "Las facturas de Edenor van a Servicios públicos." });
check("memoria por organización, visible", (await agent.listMemory(A)).some((m) => m.m.subject === "Edenor" && m.org === norte.name));

// ─── Tope del plan ───
const [{ n: used }] = await sql`select count(*)::int n from agent_tasks where studio_id = ${A.studioId} and created_at >= date_trunc('month', now())`;
await sql`update studios set limits = limits || ${sql.json({ agentTasksPerMonth: used })} where id = ${A.studioId}`;
check("tope de tareas del plan: no crea una más", /permite hasta/.test((await throws(() => agent.createTask(A, { templateKey: "tope_monotributo", scope: "cartera" }))) ?? ""));
await sql`update studios set limits = limits - 'agentTasksPerMonth' where id = ${A.studioId}`;

// ─── Desde el Vigía ───
const ctx = { studioId: A.studioId, actor: { id: A.id, email: A.email, name: A.name, role: A.role as "dueno" }, organizationIds: null, modules: null, canWrite: true };
const fromVigia = await executeTool("encargar_al_agente", { pedido: "Revisá el crédito fiscal de todos mis clientes" }, { ...ctx, origin: "asistente" });
check("el Vigía le pasa la tarea al Agente (con confirmación)", fromVigia.status === "confirmacion");
const fromMcp = await executeTool("encargar_al_agente", { pedido: "Revisá el crédito fiscal de todos mis clientes" }, { ...ctx, origin: "mcp" });
check("por MCP con escritura: se crea y devuelve el enlace", fromMcp.status === "ok" && /\/admin\/vigia\/agente\//.test(JSON.stringify(fromMcp)));

// ─── Aislamiento entre estudios (IDs forzados) ───
check("tarea sobre una organización de otro estudio: rechazada", (await throws(() => agent.createTask(A, { templateKey: "cierre_mensual", scope: "organizacion", organizationId: d.orgs.ajena }))) !== null);
check("otro estudio no ve la tarea", (await agent.getTask(B, t1)) === null);
check("otro estudio no la pausa ni la cancela", (await throws(() => agent.setTaskState(B, t1, "cancelar"))) !== null);
check("otro estudio no la lista", (await agent.listTasks(B, "historial")).every((x) => x.id !== t1));
const [mem] = await sql`select id from agent_memory where studio_id = ${A.studioId} limit 1`;
check("otro estudio no borra la memoria", (await throws(() => agent.deleteMemory(B, mem.id))) !== null);
check("memoria sobre una organización ajena: rechazada", (await throws(() => agent.saveMemory(A, { organizationId: d.orgs.ajena, subject: null, content: "criterio ajeno" }))) !== null);
check("otro estudio no pausa la rutina", (await throws(() => agent.setRoutineState(B, rid, "pausar"))) !== null);
check("rutina sobre una organización ajena: rechazada", (await throws(() => agent.saveRoutine(A, { name: "x", templateKey: "cierre_mensual", scope: "organizacion", organizationId: d.orgs.ajena, schedule: { tipo: "mensual", dia: 5, hora: 8 }, channels: [] }))) !== null);
check("automatización sobre una organización ajena: rechazada", (await throws(() => setAutomation(A, { action: "pedir_documentacion", organizationId: d.orgs.ajena, state: "activa" }))) !== null);
check("un ID mal formado no rompe nada", (await agent.getTask(A, "no-es-un-id")) === null && (await throws(() => agent.setTaskState(A, "' or 1=1 --", "cancelar"))) !== null);

// ─── Plan: cuentas personales y planes sin el módulo ───
const tit = await actorOf(d.users.titular);
await sql`delete from tenant_modules where studio_id = ${tit.studioId} and module_key = 'agent'`;
const [tplan] = await sql`select plan_key as plan from studios where id = ${tit.studioId}`;
check("cuenta personal sin Pro: el Agente no está", (await agent.agentAccess(tit)).ok === (tplan.plan === "autonomo_pro"));

// ─── Cartera de 20 organizaciones de la demo ───
const [duena] = await sql`select u.id from users u join studios s on s.id = u.studio_id where u.email = 'duena.estudio@demo.faro.local' and s.is_demo`;
if (duena) {
  const D = await actorOf(duena.id);
  const [{ n: orgs }] = await sql`select count(*)::int n from organizations where studio_id = ${D.studioId} and status in ('onboarding','activa','pausada')`;
  const tid = await agent.createTask(D, { text: "Revisá el crédito fiscal de todos mis clientes antes del vencimiento" });
  const [tt] = await sql`select params, plan from agent_tasks where id = ${tid}`;
  check("demo: cartera de 20 organizaciones", orgs === 20 && (tt.params.organizationIds as string[]).length === 20, `${orgs}`);
  const t0 = Date.now();
  check("demo: la tarea sobre la cartera termina", (await finish(tid, 200)) === "completada", `${Date.now() - t0} ms`);
  const [rr] = await sql`select report, plan from agent_tasks where id = ${tid}`;
  const sev = (s: string) => rr.report.findings.filter((f: { severity: string }) => f.severity === s).length;
  check("demo: informe con hallazgos por importancia", rr.report.findings.length > 0 && sev("alta") > 0, `alta ${sev("alta")} · media ${sev("media")} · baja ${sev("baja")}`);
  check("demo: tareas del equipo para lo de importancia alta", rr.report.tasks.length > 0 && rr.report.tasks.length <= 20, `${rr.report.tasks.length}`);
  const otherDemo = (await sql`select o.id from organizations o join studios s on s.id = o.studio_id where s.is_demo and s.id <> ${D.studioId} limit 1`)[0];
  check("demo: no toca organizaciones de otro estudio", rr.plan.every((s: { organizationId?: string }) => !s.organizationId || s.organizationId !== otherDemo?.id));
} else console.log("(sin la demo: se saltea la cartera de 20)");

await sql`delete from tenant_modules where studio_id in ${sql([A.studioId, B.studioId])} and module_key = 'agent'`;
await sql.end();
console.log(fails ? `\n${fails} fallas` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
