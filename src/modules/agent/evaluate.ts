// Hallazgos del Agente a partir de lo que devolvió cada herramienta. Son hechos
// con su importancia, nunca una validación (principios §1). Puro: se prueba
// con unitarias.

import type { AgentFinding, AgentPlanStep, AgentReport } from "@/db/schema";

export type StepOutcome =
  | { status: "ok"; result: unknown }
  | { status: "aprobacion" | "confirmacion"; approvalId: string; summary: string }
  | { status: "denegado" | "error"; message: string };

type Ctx = { today: string; orgName: string | null; orgId: string | null };
type Row = Record<string, unknown>;

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
/** AAAA-MM-DD → DD/MM/AAAA */
const dmy = (v: unknown) => String(v ?? "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1");
const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + d * 86400000).toISOString().slice(0, 10);

/** Hallazgos de un paso de herramienta */
export function findingsFor(step: AgentPlanStep, outcome: StepOutcome, c: Ctx): AgentFinding[] {
  const base = { organizationId: c.orgId, organizationName: c.orgName };
  if (outcome.status !== "ok") return [];
  const r = (outcome.result ?? {}) as Row;
  const out: AgentFinding[] = [];
  switch (step.tool) {
    case "listar_vencimientos": {
      const rows = (r.vencimientos as Row[] | undefined) ?? [];
      const open = rows.filter((v) => ["pendiente", "en_proceso", "vencido"].includes(String(v.estado)));
      const late = open.filter((v) => String(v.estado) === "vencido" || String(v.vencimiento) < c.today);
      const soon = open.filter((v) => String(v.vencimiento) >= c.today && String(v.vencimiento) <= addDays(c.today, 5));
      if (late.length) out.push({ ...base, severity: "alta", title: `${plural(late.length, "vencimiento pasado", "vencimientos pasados")} sin presentar ni pagar`, detail: late.map((v) => `${v.impuesto} ${v.periodo} (venció el ${dmy(v.vencimiento)})`).join(" · "), href: c.orgId ? `/admin/organizaciones/${c.orgId}/vencimientos` : "/admin/vencimientos" });
      if (soon.length) out.push({ ...base, severity: "media", title: `${plural(soon.length, "vencimiento", "vencimientos")} en los próximos 5 días`, detail: soon.map((v) => `${v.impuesto} ${v.periodo} (vence el ${dmy(v.vencimiento)})`).join(" · "), href: c.orgId ? `/admin/organizaciones/${c.orgId}/vencimientos` : "/admin/vencimientos" });
      break;
    }
    case "comprobantes_para_confirmar": {
      const docs = (r.documentos as Row[] | undefined) ?? [];
      const total = n(r.total) || docs.length;
      if (total) out.push({ ...base, severity: "media", title: `${plural(total, "comprobante espera", "comprobantes esperan")} confirmación en Lectura`, detail: "Hasta que se confirmen no cuentan para el crédito fiscal ni para la conciliación.", href: c.orgId ? `/admin/organizaciones/${c.orgId}/lectura` : null });
      const dup = docs.filter((d) => d.repetido).length;
      if (dup) out.push({ ...base, severity: "media", title: `${plural(dup, "comprobante parece repetido", "comprobantes parecen repetidos")}`, detail: "Revisalos antes de confirmar: el mismo emisor, número y total ya está cargado.", href: c.orgId ? `/admin/organizaciones/${c.orgId}/lectura` : null });
      const review = docs.filter((d) => Array.isArray(d.revisar) && (d.revisar as unknown[]).length).length;
      if (review) out.push({ ...base, severity: "baja", title: `${plural(review, "comprobante tiene", "comprobantes tienen")} datos que conviene revisar`, href: c.orgId ? `/admin/organizaciones/${c.orgId}/lectura` : null });
      break;
    }
    case "estado_conciliacion": {
      const m = (r.movimientos ?? {}) as Row;
      const pending = n(m.pendiente) + n(m.sugerido);
      const last = r.ultimo_extracto as Row | null;
      if (!last) out.push({ ...base, severity: "baja", title: "No hay extracto bancario cargado", detail: "Sin extracto no se puede conciliar el período.", href: c.orgId ? `/admin/organizaciones/${c.orgId}/conciliacion` : null });
      if (pending) out.push({ ...base, severity: "media", title: `${plural(pending, "movimiento sin conciliar", "movimientos sin conciliar")}`, detail: n(m.sugerido) ? `${plural(n(m.sugerido), "tiene", "tienen")} una sugerencia lista para confirmar.` : undefined, href: (last?.enlace as string) ?? null });
      if (last && n(last.pagosSinFactura)) out.push({ ...base, severity: "media", title: `${plural(n(last.pagosSinFactura), "pago sin factura", "pagos sin factura")} en el último extracto`, href: (last.enlace as string) ?? null });
      break;
    }
    case "situacion_monotributo": {
      const light = String(r.semaforo ?? "");
      const cap = n(r.tope);
      const pct = cap ? Math.round((n(r.facturado_12_meses) / cap) * 100) : null;
      const detail = `Según lo cargado: ${pct != null ? `${pct} % del tope de la categoría ${r.categoria ?? ""}` : String(r.mensaje ?? "")}. Es un dato, no una revisión profesional.`;
      if (light === "rojo") out.push({ ...base, severity: "alta", title: "Pasó o está por pasar el tope de su categoría", detail });
      else if (light === "amarillo") out.push({ ...base, severity: "media", title: "Se acerca al tope de su categoría", detail });
      break;
    }
    case "analizar_libro_iva": {
      const list = (r.anomalias as Row[] | undefined) ?? [];
      for (const a of list)
        out.push({ ...base, severity: (["alta", "media", "baja"].includes(String(a.importancia)) ? a.importancia : "media") as AgentFinding["severity"], title: `IVA ${a.libro}: ${a.titulo}`, detail: String(a.detalle ?? ""), href: (r.enlace as string) ?? null });
      break;
    }
    case "liquidar_sueldos": {
      const alerts = (r.alertas as string[] | undefined) ?? [];
      const toValidate = (r.escalas_a_validar as string[] | undefined) ?? [];
      out.push({ ...base, severity: "media", title: `Liquidación de sueldos en borrador para aprobar (${plural(n(r.empleados), "empleado", "empleados")})`, detail: `Neto $ ${n(r.neto).toLocaleString("es-AR", { minimumFractionDigits: 2 })} · costo laboral $ ${n(r.costo_laboral).toLocaleString("es-AR", { minimumFractionDigits: 2 })}. Revisala y aprobala: recién ahí se publican los recibos.`, href: (r.enlace as string) ?? null });
      for (const a of alerts.slice(0, 8)) out.push({ ...base, severity: /embargo|Falta el convenio|no está en la escala/.test(a) ? "alta" : "media", title: `Sueldos: ${a}`, href: (r.enlace as string) ?? null });
      if (toValidate.length) out.push({ ...base, severity: "baja", title: `Escalas a validar: ${toValidate.join(", ")}`, detail: "Calculada con la escala de referencia: revisá los básicos con el acta vigente.", href: (r.enlace as string) ?? null });
      break;
    }
    case "listar_comprobantes": {
      const rows = ((r.comprobantes ?? r.facturas) as Row[] | undefined) ?? [];
      const bad = rows.filter((x) => ["rechazada", "error"].includes(String(x.estado)));
      if (bad.length) out.push({ ...base, severity: "alta", title: `${plural(bad.length, "comprobante emitido quedó", "comprobantes emitidos quedaron")} rechazado o con error`, href: c.orgId ? `/admin/organizaciones/${c.orgId}/arca` : "/facturacion" });
      break;
    }
  }
  return out;
}

/** Arma el informe con todo lo que juntó la tarea */
export function buildReport(plan: AgentPlanStep[], results: Record<string, StepOutcome>, ctx: { today: string; orgNames: Record<string, string>; title: string; memory?: string[] }): AgentReport {
  const findings: AgentFinding[] = [];
  const drafts: AgentReport["drafts"] = [];
  let ok = 0;
  let failed = 0;
  for (const s of plan) {
    const o = results[s.id];
    if (!o || s.kind !== "herramienta") continue;
    const orgName = s.organizationId ? (ctx.orgNames[s.organizationId] ?? null) : null;
    if (o.status === "aprobacion" || o.status === "confirmacion") drafts.push({ kind: s.tool ?? "borrador", title: `${o.summary}${orgName ? ` · ${orgName}` : ""}`, approvalId: o.approvalId, href: `/admin/vigia?tab=propuestas#${o.approvalId}` });
    if (o.status === "ok") ok++;
    if (o.status === "error") failed++;
    findings.push(...findingsFor(s, o, { today: ctx.today, orgId: s.organizationId ?? null, orgName }));
  }
  const order = { alta: 0, media: 1, baja: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const count = (sev: keyof typeof order) => findings.filter((f) => f.severity === sev).length;
  const orgs = new Set(plan.map((s) => s.organizationId).filter(Boolean)).size;
  const parts = [
    `${ctx.title}: revisé ${orgs > 1 ? `${orgs} organizaciones` : orgs === 1 ? "1 organización" : "tu cuenta"} con ${plural(ok, "consulta", "consultas")}${failed ? ` (${plural(failed, "no se pudo hacer", "no se pudieron hacer")})` : ""}.`,
    findings.length ? `Encontré ${plural(count("alta"), "hallazgo de importancia alta", "hallazgos de importancia alta")}, ${count("media")} de importancia media y ${count("baja")} de importancia baja.` : "No encontré nada para marcar en lo que pude revisar.",
    drafts.length ? `Dejé ${plural(drafts.length, "borrador", "borradores")} en Propuestas para aprobar.` : "",
    "Son datos y borradores según lo cargado en Faro: no reemplazan el criterio de un contador.",
  ];
  return { summary: parts.filter(Boolean).join(" "), findings, drafts, tasks: [] };
}
