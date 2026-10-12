import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentPlanStep } from "@/db/schema";
import { buildReport, findingsFor } from "./evaluate";
import { dateIn, interpret, organizationIn, periodIn } from "./intent";
import { nextRun, parseSchedule } from "./routines";

const today = "2026-10-12";
const orgs = [
  { id: "a", name: "Agencia Creativa Norte SRL" },
  { id: "b", name: "Agencia Norte" },
  { id: "c", name: "Café de la Esquina" },
];

test("período nombrado: mes del año en curso o del anterior", () => {
  assert.equal(periodIn("cerrá octubre", today), "2026-10");
  assert.equal(periodIn("conciliá el extracto de noviembre", today), "2025-11");
  assert.equal(periodIn("septiembre de 2025", today), "2025-09");
  assert.equal(periodIn("el mes pasado", today), "2026-09");
  assert.equal(periodIn("sin período", today), null);
});

test("fecha: «al 31/12» es la última que pasó", () => {
  assert.equal(dateIn("armame el inventario al 31/12", today), "2025-12-31");
  assert.equal(dateIn("al 30/06/2026", today), "2026-06-30");
  assert.equal(dateIn("al 45/13", today), null);
});

test("organización: el nombre más largo que aparece entero, sin el tipo societario", () => {
  assert.equal(organizationIn("cerrá octubre de Agencia Creativa Norte", orgs)?.id, "a");
  assert.equal(organizationIn("cerrá octubre de agencia norte", orgs)?.id, "b");
  assert.equal(organizationIn("cerrá octubre de la cafeteria", orgs), null);
});

test("interpretación de los pedidos de ejemplo", () => {
  const i = interpret("Cerrá octubre de Agencia Norte", { orgs, today, personal: false });
  assert.deepEqual([i.templateKey, i.scope, i.organizationId, i.period], ["cierre_mensual", "organizacion", "b", "2026-10"]);
  const iva = interpret("Revisá el crédito fiscal de todos mis clientes antes del vencimiento", { orgs, today, personal: false });
  assert.deepEqual([iva.templateKey, iva.scope], ["revision_iva", "cartera"]);
  assert.equal(interpret("¿Qué clientes están cerca del tope del monotributo?", { orgs, today, personal: false }).templateKey, "tope_monotributo");
  assert.equal(interpret("Prepará el resumen mensual para todos los clientes", { orgs, today, personal: false }).period, "2026-09");
  assert.equal(interpret("Conciliá el extracto de septiembre", { orgs, today, personal: false }).templateKey, "conciliar_extracto");
  assert.equal(interpret("¿Quién tiene solicitudes abiertas?", { orgs, today, personal: false }).templateKey, "libre");
  assert.equal(interpret("¿Estoy cerca del tope?", { orgs, today, personal: true }).scope, "personal");
});

test("rutinas: próxima corrida en hora de Buenos Aires", () => {
  const s = parseSchedule({ tipo: "mensual", dia: 5, hora: 8 })!;
  assert.equal(nextRun(s, new Date("2026-10-12T15:00:00Z")).toISOString(), "2026-11-05T11:00:00.000Z");
  assert.equal(nextRun(s, new Date("2026-10-04T15:00:00Z")).toISOString(), "2026-10-05T11:00:00.000Z");
  const w = parseSchedule({ tipo: "semanal", dia_semana: 1, hora: 9 })!; // lunes
  assert.equal(nextRun(w, new Date("2026-10-12T13:00:00Z")).toISOString(), "2026-10-19T12:00:00.000Z"); // lunes 12 a las 10 → el próximo lunes
  const v = parseSchedule({ tipo: "antes_vencimiento", dias: 3, impuesto: "IVA", hora: 7 })!;
  assert.equal(nextRun(v, new Date("2026-10-12T09:00:00Z")).toISOString(), "2026-10-12T10:00:00.000Z");
  assert.equal(parseSchedule({ tipo: "mensual", dia: 31, hora: 8 }), null);
  assert.equal(parseSchedule({ tipo: "semanal", dia_semana: 2, hora: 25 }), null);
});

const step = (tool: string, organizationId = "a"): AgentPlanStep => ({ id: `s-${tool}`, title: tool, kind: "herramienta", tool, organizationId, status: "hecho" });

test("hallazgos: vencidos (alta), próximos (media) y comprobantes para confirmar", () => {
  const f = findingsFor(step("listar_vencimientos"), { status: "ok", result: { vencimientos: [{ impuesto: "IVA", periodo: "2026-09", vencimiento: "2026-10-01", estado: "pendiente" }, { impuesto: "IIBB", periodo: "2026-09", vencimiento: "2026-10-15", estado: "pendiente" }, { impuesto: "F.931", periodo: "2026-09", vencimiento: "2026-10-09", estado: "pagado" }] } }, { today, orgId: "a", orgName: "A" });
  assert.deepEqual(f.map((x) => x.severity), ["alta", "media"]);
  const d = findingsFor(step("comprobantes_para_confirmar"), { status: "ok", result: { total: 2, documentos: [{ repetido: true, revisar: [] }, { repetido: false, revisar: ["fecha"] }] } }, { today, orgId: "a", orgName: "A" });
  assert.deepEqual(d.map((x) => x.severity), ["media", "media", "baja"]);
  const m = findingsFor(step("situacion_monotributo"), { status: "ok", result: { semaforo: "rojo", tope: 100, facturado_12_meses: 104, categoria: "D" } }, { today, orgId: "a", orgName: "A" });
  assert.equal(m[0].severity, "alta");
  assert.match(m[0].detail ?? "", /104 % del tope/);
  assert.match(m[0].detail ?? "", /no una revisión profesional/);
});

test("informe: borradores, orden por importancia y sin validar nada", () => {
  const plan = [step("listar_vencimientos"), step("enviar_resumen_mensual"), step("estado_conciliacion", "b")];
  const r = buildReport(
    plan,
    {
      "s-listar_vencimientos": { status: "ok", result: { vencimientos: [{ impuesto: "IVA", periodo: "2026-09", vencimiento: "2026-10-01", estado: "vencido" }] } },
      "s-enviar_resumen_mensual": { status: "aprobacion", approvalId: "x", summary: "Enviar el resumen" },
      "s-estado_conciliacion": { status: "ok", result: { movimientos: { pendiente: 3 }, ultimo_extracto: null } },
    },
    { today, orgNames: { a: "Agencia", b: "Café" }, title: "Cierre del mes" },
  );
  assert.equal(r.drafts.length, 1);
  assert.equal(r.findings[0].severity, "alta");
  assert.match(r.summary, /2 organizaciones/);
  assert.match(r.summary, /no reemplazan el criterio de un contador/);
});
