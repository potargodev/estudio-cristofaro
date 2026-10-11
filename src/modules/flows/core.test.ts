import assert from "node:assert/strict";
import test from "node:test";
import { evalCondition, flowFromPhrase, interpolate, nextNodes, nextScheduled, retryAt, TEMPLATES, validateGraph, type Graph } from "./core";

const tools = new Set(["enviar_cobro", "recordar_firma_recibos", "recordar_vencimiento", "pedir_documentacion", "enviar_resumen_mensual"]);

test("las plantillas son válidas", () => {
  for (const t of TEMPLATES) assert.deepEqual(validateGraph(t.build(), tools), [], t.key);
});

test("validación", () => {
  const g: Graph = { nodes: [{ id: "a", type: "disparador", position: { x: 0, y: 0 }, data: { tipo: "evento", evento: "factura.emitida" } }, { id: "b", type: "accion", position: { x: 0, y: 1 }, data: { accion: "herramienta", herramienta: "borrar_todo", entrada: {} } }, { id: "c", type: "accion", position: { x: 0, y: 2 }, data: { accion: "aviso", para: "equipo", titulo: "x" } }], edges: [{ id: "1", source: "a", target: "b" }, { id: "2", source: "b", target: "a" }] };
  const msgs = validateGraph(g, tools).map((i) => i.message).join(" | ");
  assert.match(msgs, /no está disponible/);
  assert.match(msgs, /ciclo/);
  assert.match(msgs, /no está conectado/);
  assert.deepEqual(validateGraph({ nodes: [], edges: [] }, tools).map((i) => i.message), ["El flujo tiene que tener un solo disparador."]);
});

test("recorrido, condiciones e interpolación", () => {
  const g = TEMPLATES.find((t) => t.key === "cobro_con_recordatorios")!.build();
  const cond = g.nodes.find((n) => n.type === "condicion")!;
  assert.equal(nextNodes(g, cond.id, "si").length, 1);
  assert.equal(nextNodes(g, cond.id, "no").length, 0);
  const ctx = { evento: { total: 1500, cliente: "Juan", decision: "no_conforme" } };
  assert.equal(evalCondition({ campo: "evento.total", operador: "mayor", valor: "1000" }, ctx), true);
  assert.equal(evalCondition({ campo: "evento.decision", operador: "igual", valor: "NO_CONFORME" }, ctx), true);
  assert.equal(evalCondition({ campo: "evento.nada", operador: "existe" }, ctx), false);
  assert.deepEqual(interpolate({ a: "Hola {{evento.cliente}}", n: "{{evento.total}}", x: ["{{evento.falta}}"] }, ctx), { a: "Hola Juan", n: 1500, x: [""] });
});

test("horarios (hora de Buenos Aires) y reintentos", () => {
  const from = new Date("2026-10-11T15:00:00Z"); // 12:00 en Buenos Aires, domingo
  assert.equal(nextScheduled({ tipo: "horario", frecuencia: "diaria", hora: "09:00" }, from).toISOString(), "2026-10-12T12:00:00.000Z");
  assert.equal(nextScheduled({ tipo: "horario", frecuencia: "diaria", hora: "13:30" }, from).toISOString(), "2026-10-11T16:30:00.000Z");
  assert.equal(nextScheduled({ tipo: "horario", frecuencia: "mensual", hora: "09:00", dia: 1 }, from).toISOString(), "2026-11-01T12:00:00.000Z");
  assert.equal(nextScheduled({ tipo: "horario", frecuencia: "semanal", hora: "09:00", dia: 1 }, from).getUTCDay(), 1);
  assert.ok(retryAt(1)!);
  assert.equal(retryAt(4), null);
});

test("frase → borrador", () => {
  const r = flowFromPhrase("cada vez que entre una factura de proveedor, avisale a administración");
  assert.deepEqual(r.graph.nodes[0].data, { tipo: "evento", evento: "documento.leido" });
  assert.equal((r.graph.nodes[1].data as { accion: string }).accion, "aviso");
  assert.deepEqual(validateGraph(r.graph, tools), []);
  const h = flowFromPhrase("todos los días a las 8 hs mandame un mail con los vencimientos");
  assert.deepEqual(h.graph.nodes[0].data, { tipo: "horario", frecuencia: "diaria", hora: "08:00", dia: undefined });
  const c = flowFromPhrase("si un empleado firma no conforme, creá una tarea");
  assert.equal(c.graph.nodes[1].type, "condicion");
  assert.deepEqual(validateGraph(c.graph, tools), []);
});
