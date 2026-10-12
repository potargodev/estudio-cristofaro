// Demo del Agente contable (§2.q): tareas terminadas sobre la cartera de 20
// organizaciones de Ferreyra & Asociados, con su plan, informe y bitácora;
// una rutina mensual, una antes del vencimiento de IVA y criterios en la
// memoria. Los informes se arman con las mismas funciones del Agente sobre los
// vencimientos que cargó la demo (sin ejecutar herramientas).

import { and, eq, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { agent_memory, agent_routines, agent_task_events, agent_tasks, obligations, type AgentPlanStep } from "@/db/schema";
import { buildReport, type StepOutcome } from "@/modules/agent/evaluate";
import { nextRun } from "@/modules/agent/routines";
import { ago, day, month, type DemoUser } from "./base";

export async function seedAgent(db: Db, studioId: string, owner: DemoUser, contador: DemoUser, orgs: { id: string; name: string }[]) {
  const today = day(0);
  const until = day(15);
  const active = orgs.filter((o) => !/Kiosco Don Pepe/.test(o.name));
  const dues = await db
    .select({ org: obligations.organization_id, impuesto: obligations.tax, periodo: obligations.period, vencimiento: obligations.due_date, estado: obligations.status })
    .from(obligations)
    .where(and(eq(obligations.studio_id, studioId), inArray(obligations.status, ["pendiente", "en_proceso", "vencido"]), lte(obligations.due_date, until)));

  // Revisión del crédito fiscal de toda la cartera (hace 2 días)
  const plan: AgentPlanStep[] = [];
  const results: Record<string, StepOutcome> = {};
  for (const o of active) {
    const v = { id: `p${plan.length + 1}`, title: `Vencimientos de los próximos 15 días · ${o.name}`, kind: "herramienta" as const, tool: "listar_vencimientos", organizationId: o.id, status: "hecho" as const };
    plan.push(v);
    const rows = dues.filter((x) => x.org === o.id);
    results[v.id] = { status: "ok", result: { total: rows.length, vencimientos: rows } };
    const c = { id: `p${plan.length + 1}`, title: `Comprobantes de compra sin confirmar · ${o.name}`, kind: "herramienta" as const, tool: "comprobantes_para_confirmar", organizationId: o.id, status: "hecho" as const };
    plan.push(c);
    results[c.id] = { status: "ok", result: { total: 0, documentos: [] } };
  }
  plan.push({ id: `p${plan.length + 1}`, title: "Informe con hallazgos, borradores y tareas", kind: "informe", status: "hecho" });
  const names = Object.fromEntries(orgs.map((o) => [o.id, o.name]));
  const report = buildReport(plan, results, { today, orgNames: names, title: "Revisión del crédito fiscal (IVA)" });
  const period = month(0);
  const [t1] = await db
    .insert(agent_tasks)
    .values({ studio_id: studioId, scope: "cartera", created_by: contador.id, template_key: "revision_iva", title: `Revisión del crédito fiscal (IVA) · ${active.length} organizaciones`, prompt: "Revisá el crédito fiscal de todos mis clientes antes del vencimiento", params: { period, organizationIds: active.map((o) => o.id) }, status: "completada", plan, results: results as never, report, started_at: ago(2), finished_at: ago(2), created_at: ago(2) })
    .returning({ id: agent_tasks.id });
  await db.insert(agent_task_events).values([
    { task_id: t1.id, kind: "plan", text: `Plan armado: ${plan.length} pasos.`, created_at: ago(2) },
    { task_id: t1.id, kind: "nota", text: report.summary, created_at: ago(2) },
  ]);

  // Clientes cerca del tope del monotributo (hace 6 días), con lo que mostró el semáforo
  const mono = orgs.filter((o) => /Café|Panadería|Taller|Gimnasio|Fletes|Veterinaria/.test(o.name));
  const lights = ["rojo", "amarillo", "verde", "amarillo", "verde", "verde"];
  const plan2: AgentPlanStep[] = mono.map((o, i) => ({ id: `p${i + 1}`, title: `Semáforo del monotributo · ${o.name}`, kind: "herramienta", tool: "situacion_monotributo", organizationId: o.id, status: "hecho" }));
  const results2: Record<string, StepOutcome> = Object.fromEntries(mono.map((o, i) => [`p${i + 1}`, { status: "ok", result: { semaforo: lights[i % lights.length], tope: 26_000_000, facturado_12_meses: [27_100_000, 22_500_000, 9_000_000][i % 3], categoria: "D" } }]));
  plan2.push({ id: `p${plan2.length + 1}`, title: "Informe con hallazgos, borradores y tareas", kind: "informe", status: "hecho" });
  const report2 = buildReport(plan2, results2, { today, orgNames: names, title: "Clientes cerca del tope del monotributo" });
  await db.insert(agent_tasks).values({ studio_id: studioId, scope: "cartera", created_by: owner.id, template_key: "tope_monotributo", title: `Clientes cerca del tope del monotributo · ${orgs.length} organizaciones`, prompt: "¿Qué clientes están cerca del tope del monotributo?", params: { organizationIds: orgs.map((o) => o.id) }, status: "completada", plan: plan2, results: results2 as never, report: report2, started_at: ago(6), finished_at: ago(6), created_at: ago(6) });

  // Rutinas: cierre el día 5 y revisión de IVA 3 días antes del vencimiento
  const monthly = { tipo: "mensual" as const, dia: 5, hora: 8 };
  const beforeIva = { tipo: "antes_vencimiento" as const, dias: 3, impuesto: "IVA", hora: 7 };
  await db.insert(agent_routines).values([
    { studio_id: studioId, scope: "cartera", created_by: owner.id, name: "Cierre mensual de la cartera", template_key: "cierre_mensual", schedule: monthly, channels: ["app", "mail"], next_run_at: nextRun(monthly, new Date()), last_run_at: ago(7) },
    { studio_id: studioId, scope: "cartera", created_by: contador.id, name: "Revisión de IVA 3 días antes", template_key: "revision_iva", schedule: beforeIva, channels: ["app", "whatsapp"], next_run_at: nextRun(beforeIva, new Date()), last_run_at: ago(2) },
  ]);

  // Memoria: criterios del contador
  const agencia = orgs[0];
  await db.insert(agent_memory).values([
    { studio_id: studioId, organization_id: agencia.id, kind: "cuenta_proveedor", subject: "Edenor", content: "Las facturas de Edenor van a «Servicios públicos», centro de costo Oficina.", source: "contador", created_by: contador.id },
    { studio_id: studioId, organization_id: agencia.id, kind: "tratamiento", subject: "Percepciones de IIBB CABA", content: "Se computan como pago a cuenta del anticipo del mes siguiente.", source: "contador", created_by: contador.id },
    { studio_id: studioId, organization_id: null, kind: "criterio", subject: null, content: "No tomar crédito fiscal de facturas B o C: marcarlas para revisar.", source: "contador", created_by: owner.id },
  ]);
}
