import agencias_marketing from "../../../data/industries/agencias_marketing.json";
import arquitectura_ingenieria_diseno from "../../../data/industries/arquitectura_ingenieria_diseno.json";
import comercio_minorista from "../../../data/industries/comercio_minorista.json";
import construccion from "../../../data/industries/construccion.json";
import consultoras from "../../../data/industries/consultoras.json";
import ecommerce from "../../../data/industries/ecommerce.json";
import gastronomia from "../../../data/industries/gastronomia.json";
import oficios from "../../../data/industries/oficios.json";
import salud from "../../../data/industries/salud.json";
import servicios_profesionales from "../../../data/industries/servicios_profesionales.json";
import software_exportacion from "../../../data/industries/software_exportacion.json";
import transporte_logistica from "../../../data/industries/transporte_logistica.json";
import { industryTemplateSchema, type IndustryTemplate } from "./schema";

// Plantillas de rubro del repo (/data/industries). Se validan con el esquema al
// cargar: si un archivo no cumple, falla el build. Las ediciones del Faro
// Manager se guardan como versiones nuevas en la base (server.ts).

const RAW = [
  servicios_profesionales,
  agencias_marketing,
  software_exportacion,
  arquitectura_ingenieria_diseno,
  consultoras,
  comercio_minorista,
  gastronomia,
  construccion,
  salud,
  transporte_logistica,
  ecommerce,
  oficios,
];

export const FILE_TEMPLATES: IndustryTemplate[] = RAW.map((r) => {
  const t = industryTemplateSchema.safeParse(r);
  if (!t.success) throw new Error(`Plantilla de rubro inválida (${(r as { clave?: string }).clave}): ${t.error.issues[0]?.path.join(".")} ${t.error.issues[0]?.message}`);
  return t.data;
});

export const INDUSTRY_KEYS = FILE_TEMPLATES.map((t) => t.clave);
export const isIndustryKey = (k: unknown): k is string => typeof k === "string" && INDUSTRY_KEYS.includes(k);

/** Nombre de cada rubro (para selectores) */
export const INDUSTRY_NAMES: Record<string, string> = Object.fromEntries(FILE_TEMPLATES.map((t) => [t.clave, t.nombre]));

/** Qué se crea en la organización, por sección de la plantilla */
export const ITEM_KINDS = {
  obligacion: "Obligaciones del rubro",
  checklist: "Checklist de alta",
  categoria_ingreso: "Categorías de ingresos",
  categoria_gasto: "Categorías de gastos",
  tarea: "Tareas recurrentes del estudio",
  cuenta: "Plan de cuentas modelo",
  actividad: "Actividades sugeridas (ARCA)",
  perfil: "Perfil impositivo y laboral",
  indicador: "Indicadores clave",
  riesgo: "Alertas y riesgos frecuentes",
  flujo: "Flujos sugeridos (cuando exista Flujos)",
} as const;
export type ItemKind = keyof typeof ITEM_KINDS;

export interface TemplateItem {
  kind: ItemKind;
  key: string;
  label: string;
  detail?: string;
  validar?: string;
  data: Record<string, unknown>;
}

/** Ítems que una plantilla deja en una organización */
export function templateItems(t: IndustryTemplate): TemplateItem[] {
  const out: TemplateItem[] = [];
  for (const o of t.obligaciones) out.push({ kind: "obligacion", key: o.clave, label: o.impuesto, detail: `${o.frecuencia} · ${o.vencimiento}${o.aplica_a ? ` · ${o.aplica_a}` : ""}`, validar: o.validar, data: o });
  for (const c of t.checklist_alta) out.push({ kind: "checklist", key: c.clave, label: c.item, detail: c.obligatorio ? "Obligatorio" : "Opcional", data: c });
  for (const c of t.categorias.ingresos) out.push({ kind: "categoria_ingreso", key: c.clave, label: c.nombre, data: c });
  for (const c of t.categorias.gastos) out.push({ kind: "categoria_gasto", key: c.clave, label: c.nombre, data: c });
  for (const x of t.tareas_recurrentes) out.push({ kind: "tarea", key: x.clave, label: x.titulo, detail: x.frecuencia, data: x });
  for (const c of t.plan_de_cuentas) out.push({ kind: "cuenta", key: c.codigo.replace(/[^\w]/g, "_"), label: `${c.codigo} ${c.nombre}`, detail: c.tipo, data: c });
  for (const a of t.actividades) out.push({ kind: "actividad", key: a.codigo, label: `${a.codigo} · ${a.descripcion}`, validar: a.validar, data: a });
  out.push({ kind: "perfil", key: "impositivo", label: "Perfil impositivo típico", detail: `IVA: ${t.perfil_impositivo.iva.tratamiento} · IIBB: ${t.perfil_impositivo.iibb.regimen.replace("_", " ")}`, validar: t.perfil_impositivo.iibb.validar, data: t.perfil_impositivo });
  out.push({ kind: "perfil", key: "laboral", label: "Perfil laboral", detail: t.laboral.convenios.map((c) => `${c.nombre}${c.numero ? ` (${c.numero})` : ""}`).join(" · ") || "Sin convenio habitual", data: t.laboral });
  for (const i of t.indicadores) out.push({ kind: "indicador", key: i.clave, label: i.nombre, detail: i.descripcion, data: i });
  for (const r of t.riesgos) out.push({ kind: "riesgo", key: r.clave, label: r.titulo, detail: r.descripcion, validar: r.validar, data: r });
  for (const f of t.flujos_sugeridos) out.push({ kind: "flujo", key: f.plantilla, label: f.nombre, detail: f.descripcion, data: f });
  return out;
}
