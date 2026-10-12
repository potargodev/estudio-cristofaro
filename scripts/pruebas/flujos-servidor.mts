// F4 del lado del servidor: reintentos con espera y error final, error
// permanente sin reintentos, idempotencia por paso (un reintento no repite lo
// hecho), eventos sin duplicados, escaneo de vencimientos, acción por cada
// organización, límite del plan, validación al activar, herramientas del
// Vigía y aislamiento.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/flujos-servidor.mts

import { readFileSync } from "node:fs";
import postgres from "postgres";
import type { Graph } from "../../src/modules/flows/core.ts";
import { createBlank, getFlow, runFlowWorker, saveFlow, setFlowStatus, triggerManual } from "../../src/modules/flows/engine.ts";
import { emitEvent } from "../../src/modules/flows/events.ts";
import { runFlowScans } from "../../src/modules/flows/scans.ts";
import { executeTool } from "../../src/modules/tools/index.ts";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!);
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};
const A = d.studios.A;
const SB = d.studios.B;
const actor = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A" };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com", name: "Admin B" };
const tick = async (n = 1) => {
  for (let i = 0; i < n; i++) {
    await sql`update flow_runs set next_attempt_at = now() where status in ('pendiente') and studio_id in ${sql([A, SB])}`;
    await runFlowWorker();
    // La tarea de flujos del servidor puede haber tomado una corrida al mismo tiempo (skip locked): esperar a que la termine
    for (let w = 0; w < 50 && (await sql`select 1 from flow_runs where status = 'en_curso' and studio_id in ${sql([A, SB])} limit 1`).length; w++) await new Promise((ok) => setTimeout(ok, 100));
  }
};
const fails_ = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return "";
  } catch (e) {
    return (e as Error).message;
  }
};
await sql`delete from flows where studio_id in ${sql([A, SB])}`;
await sql`delete from flow_runs where studio_id in ${sql([A, SB])}`;
await sql`delete from flow_events where studio_id in ${sql([A, SB])}`;
await sql`delete from tasks where studio_id in ${sql([A, SB])} and source = 'flujo'`;

const g = (nodes: Graph["nodes"], edges: Graph["edges"]): Graph => ({ nodes, edges });
const pos = (y: number) => ({ x: 0, y });

// Reintentos: aviso (ok) → herramienta que falla (vencimiento inexistente)
const f1 = await createBlank(A, actor);
await saveFlow(A, actor, f1.id, {
  name: "Reintentos",
  graph: g(
    [
      { id: "t", type: "disparador", position: pos(0), data: { tipo: "vigia" } },
      { id: "a", type: "accion", position: pos(1), data: { accion: "aviso", para: "duenos", titulo: "Paso uno {{evento.x}}" } },
      { id: "b", type: "accion", position: pos(2), data: { accion: "herramienta", herramienta: "listar_flujos", entrada: { limite: "{{evento.limite}}" } } },
    ],
    [
      { id: "1", source: "t", target: "a" },
      { id: "2", source: "a", target: "b" },
    ],
  ),
});
await setFlowStatus(A, actor, f1.id, "activo");
const before = (await sql`select count(*)::int n from notifications where title = 'Paso uno 7'`)[0].n;
const run = await triggerManual(A, actor, f1.id, { x: 7, limite: "muchos" }, "prueba");
await tick(1);
let [r] = await sql`select status, attempts from flow_runs where id = ${run.id}`;
check("un paso que falla se reintenta (1 minuto)", r.status === "pendiente" && r.attempts === 1, JSON.stringify(r));
await tick(4);
[r] = await sql`select status, attempts, error from flow_runs where id = ${run.id}`;
check("tras 3 reintentos queda con error", r.status === "error" && r.attempts === 4, JSON.stringify(r));
const after = (await sql`select count(*)::int n from notifications where title = 'Paso uno 7'`)[0].n;
const avisos = after - before;
check("idempotencia por paso: el aviso no se repitió en los reintentos", avisos >= 1 && (await sql`select count(*)::int n from flow_steps where run_id = ${run.id} and node_id = 'a' and status = 'ok'`)[0].n === 1, `avisos ${avisos}`);
check("cada intento quedó registrado", (await sql`select count(*)::int n from flow_steps where run_id = ${run.id} and node_id = 'b' and status = 'error'`)[0].n === 4);

// Error permanente (sin permiso o fuera del alcance): sin reintentos
const fp = await createBlank(A, actor);
await saveFlow(A, actor, fp.id, { name: "Permanente", graph: g([{ id: "t", type: "disparador", position: pos(0), data: { tipo: "vigia" } }, { id: "b", type: "accion", position: pos(1), data: { accion: "herramienta", herramienta: "ver_organizacion", entrada: { organizacion_id: d.orgs.ajena } } }], [{ id: "1", source: "t", target: "b" }]) });
await setFlowStatus(A, actor, fp.id, "activo");
const rp = await triggerManual(A, actor, fp.id, {}, "prueba");
await tick(1);
const [rpr] = await sql`select status, attempts from flow_runs where id = ${rp.id}`;
check("organización de otro estudio en una herramienta: error sin reintentos", rpr.status === "error" && rpr.attempts === 1, JSON.stringify(rpr));

// Eventos sin duplicados y corrida única por evento
const f2 = await createBlank(A, actor);
await saveFlow(A, actor, f2.id, { name: "Factura", graph: g([{ id: "t", type: "disparador", position: pos(0), data: { tipo: "evento", evento: "factura.emitida" } }, { id: "a", type: "accion", position: pos(1), data: { accion: "tarea", titulo: "Revisar factura {{evento.factura_id}}", vence_en_dias: 2, organizacion: "{{evento.organizacion_id}}" } }], [{ id: "1", source: "t", target: "a" }]) });
await setFlowStatus(A, actor, f2.id, "activo");
await emitEvent(A, "factura.emitida", { factura_id: "F-1", organizacion_id: d.orgs.norte }, "F-1");
await emitEvent(A, "factura.emitida", { factura_id: "F-1", organizacion_id: d.orgs.norte }, "F-1");
check("el mismo evento se encola una sola vez", (await sql`select count(*)::int n from flow_events where studio_id = ${A} and name = 'factura.emitida'`)[0].n === 1);
await runFlowWorker();
await runFlowWorker();
check("una sola corrida y una sola tarea", (await sql`select count(*)::int n from flow_runs where flow_id = ${f2.id}`)[0].n === 1 && (await sql`select count(*)::int n from tasks where studio_id = ${A} and title = 'Revisar factura F-1' and organization_id = ${d.orgs.norte}`)[0].n === 1);
await emitEvent(SB, "factura.emitida", { factura_id: "F-2" }, "F-2");
check("otro estudio sin flujos activos no encola eventos", (await sql`select count(*)::int n from flow_events where studio_id = ${SB}`)[0].n === 0);

// Tarea con una organización de otro estudio: queda sin organización
const f3 = await createBlank(A, actor);
await saveFlow(A, actor, f3.id, { name: "Org ajena", graph: g([{ id: "t", type: "disparador", position: pos(0), data: { tipo: "vigia" } }, { id: "a", type: "accion", position: pos(1), data: { accion: "tarea", titulo: "Tarea ajena", organizacion: d.orgs.ajena } }], [{ id: "1", source: "t", target: "a" }]) });
await setFlowStatus(A, actor, f3.id, "activo");
await triggerManual(A, actor, f3.id, {}, "prueba");
await runFlowWorker();
const [ta] = await sql`select organization_id from tasks where studio_id = ${A} and title = 'Tarea ajena'`;
check("una organización de otro estudio no se asigna", ta && ta.organization_id === null);

// Escaneo: vencimiento en 2 días con plantilla de recordatorio (sensible → Aprobaciones)
const f4 = await createBlank(A, actor);
await saveFlow(A, actor, f4.id, { name: "Vencimientos", graph: g([{ id: "t", type: "disparador", position: pos(0), data: { tipo: "evento", evento: "vencimiento.proximo" } }, { id: "a", type: "accion", position: pos(1), data: { accion: "herramienta", herramienta: "recordar_vencimiento", entrada: { vencimiento_id: "{{evento.vencimiento_id}}" } } }], [{ id: "1", source: "t", target: "a" }]) });
await setFlowStatus(A, actor, f4.id, "activo");
const [ob] = await sql`insert into obligations (studio_id, organization_id, tax, period, due_date) values (${A}, ${d.orgs.norte}, 'IVA', '2026-09', (now() + interval '2 days')::date) returning id`;
await runFlowScans();
await runFlowWorker();
await runFlowWorker();
const [vr] = await sql`select r.status, a.tool, a.origin from flow_runs r left join approvals a on a.id = r.waiting_approval_id where r.flow_id = ${f4.id}`;
check("vencimiento en 2 días → evento → recordatorio en Aprobaciones", vr?.status === "esperando" && vr.tool === "recordar_vencimiento" && vr.origin === "flujo", JSON.stringify(vr));
await sql`delete from obligations where id = ${ob.id}`;

// Límite del plan (Inicial: 1 flujo activo) y validación
const b1 = await createBlank(SB, actorB);
await saveFlow(SB, actorB, b1.id, { name: "B1", graph: g([{ id: "t", type: "disparador", position: pos(0), data: { tipo: "vigia" } }, { id: "a", type: "accion", position: pos(1), data: { accion: "aviso", para: "equipo", titulo: "x" } }], [{ id: "1", source: "t", target: "a" }]) });
await setFlowStatus(SB, actorB, b1.id, "activo");
const b2 = await createBlank(SB, actorB);
await saveFlow(SB, actorB, b2.id, { name: "B2", graph: g([{ id: "t", type: "disparador", position: pos(0), data: { tipo: "vigia" } }, { id: "a", type: "accion", position: pos(1), data: { accion: "aviso", para: "equipo", titulo: "y" } }], [{ id: "1", source: "t", target: "a" }]) });
check("límite de flujos activos del plan Inicial", /límite|plan|flujo/i.test(await fails_(() => setFlowStatus(SB, actorB, b2.id, "activo"))));
const b3 = await createBlank(SB, actorB);
check("no se activa un flujo con errores", (await fails_(() => setFlowStatus(SB, actorB, b3.id, "pausado").then(() => setFlowStatus(SB, actorB, b3.id, "activo")))).length > 0);

// Aislamiento
check("getFlow de otro estudio → null", (await getFlow(SB, f1.id)) === null);
check("activar un flujo de otro estudio → error", (await fails_(() => setFlowStatus(SB, actorB, f1.id, "activo"))).length > 0);
check("ejecutar un flujo de otro estudio → error", (await fails_(() => triggerManual(SB, actorB, f1.id, {}, "prueba"))).length > 0);

// Vigía
const ctx = { studioId: A, actor: { ...actor, role: "dueno" as const }, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };
const prop = await executeTool("proponer_flujo", { frase: "si un empleado firma no conforme, creá una tarea" }, ctx);
check("Vigía: proponer un flujo desde el asistente pide confirmación", prop.status === "confirmacion");
const prop2 = await executeTool("proponer_flujo", { frase: "si un empleado firma no conforme, creá una tarea" }, { ...ctx, origin: "mcp" as const });
const borrador = (prop2 as { result?: { borrador?: string } }).result?.borrador;
check("Vigía (MCP): borrador creado", prop2.status === "ok" && !!borrador);
const [bf] = await sql`select status, trigger_event from flows where id = ${borrador}`;
check("el borrador queda sin activar con el evento correcto", bf.status === "borrador" && bf.trigger_event === "recibo.firmado");
const ex = await executeTool("ejecutar_flujo", { flujo_id: f3.id }, { ...ctx, origin: "mcp" as const });
check("Vigía: ejecutar un flujo «pedido al Vigía»", ex.status === "ok", JSON.stringify(ex).slice(0, 120));
const exB = await executeTool("ejecutar_flujo", { flujo_id: f3.id }, { ...ctx, studioId: SB, actor: { ...actorB, role: "dueno" as const }, origin: "mcp" as const });
check("Vigía: otro estudio no ejecuta el flujo", exB.status !== "ok");

await sql`update flows set status = 'pausado' where studio_id in ${sql([A, SB])}`;
await sql.end();
console.log(fails ? `\n${fails} fallaron` : "\nTodo bien");
process.exit(fails ? 1 : 0);
