import "server-only";
import { z } from "zod/v4";
import { FILE_TEMPLATES, INDUSTRY_NAMES, ITEM_KINDS, templateItems, type ItemKind } from "@/modules/industries/catalog";
import { IndustryError, applyTemplate, getTemplate, listTemplates, previewApply } from "@/modules/industries/server";
import { defineTool, ToolError } from "../types";
import { uuid } from "./helpers";

// Ecosistemas por industria para el Asistente y MCP: consultar rubros y sus
// obligaciones típicas (lectura), ver la vista previa (lectura) y aplicar la
// plantilla a una organización (sensible: pasa por Aprobaciones).

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Rubro por clave o por nombre ("gastronomía", "software") */
function resolveKey(v: string) {
  const w = norm(v);
  const hit = Object.entries(INDUSTRY_NAMES).filter(([k, n]) => k === w || norm(n).includes(w) || w.includes(norm(n)) || k.includes(w.replace(/\s+/g, "_")));
  if (hit.length === 1) return hit[0][0];
  throw new ToolError(`No encontré un único rubro "${v}". Rubros: ${Object.values(INDUSTRY_NAMES).join(", ")}.`, "entrada_invalida");
}

const wrap = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof IndustryError) throw new ToolError(e.message, "entrada_invalida");
    throw e;
  }
};

const ROLES = ["dueno", "contador", "titular"] as const;
const rubro = z.string().min(2).max(80).describe('Clave o nombre del rubro (ej. "gastronomia" o "Gastronomía")');

export const industriasTools = [
  defineTool({
    name: "listar_rubros",
    title: "Ver rubros con plantilla",
    description: "Rubros con plantilla preconfigurada (ecosistemas por industria), con su versión y si están validados por un profesional.",
    module: "industrias",
    level: "lectura",
    roles: [...ROLES, "colaborador"],
    input: z.object({}),
    async handler() {
      return (await listTemplates()).map((t) => ({ clave: t.clave, rubro: t.nombre, version: t.version, estado: t.estado === "validada" ? "validada" : "borrador (sugerencia a revisar)" }));
    },
  }),
  defineTool({
    name: "obligaciones_tipicas_rubro",
    title: "Obligaciones típicas de un rubro",
    description: "Calendario de obligaciones típico de un rubro (además del general por CUIT), con lo que hay que validar.",
    module: "industrias",
    level: "lectura",
    roles: [...ROLES, "colaborador"],
    input: z.object({ rubro }),
    async handler(input) {
      const t = (await getTemplate(resolveKey(input.rubro)))!;
      return {
        rubro: t.nombre,
        estado: t.estado === "validada" ? `validada por ${t.validado_por?.nombre}` : "borrador: sugerencia a revisar por un contador",
        obligaciones: t.obligaciones.map((o) => ({ impuesto: o.impuesto, frecuencia: o.frecuencia, vencimiento: o.vencimiento, aplica_a: o.aplica_a ?? null, a_validar: o.validar ?? null })),
        notas: t.notas,
      };
    },
  }),
  defineTool({
    name: "vista_previa_plantilla_rubro",
    title: "Vista previa de una plantilla de rubro",
    description: "Lo que crearía la plantilla de un rubro en una organización (obligaciones, checklist, categorías, tareas…), sin aplicarla.",
    module: "industrias",
    level: "lectura",
    roles: ROLES,
    input: z.object({ organizacion_id: uuid("ID de la organización"), rubro }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    async handler(input, ctx) {
      await ctx.organization(input.organizacion_id);
      return wrap(async () => {
        const p = await previewApply(ctx.studioId, input.organizacion_id, resolveKey(input.rubro));
        const fresh = p.items.filter((i) => !i.exists);
        return {
          organizacion: p.organization.name,
          rubro: p.template.nombre,
          estado: p.template.estado === "validada" ? "validada" : "borrador (sugerencia a revisar)",
          se_crean: (Object.keys(ITEM_KINDS) as ItemKind[]).map((k) => ({ seccion: ITEM_KINDS[k], cantidad: fresh.filter((i) => i.kind === k).length })).filter((x) => x.cantidad),
          obligaciones: fresh.filter((i) => i.kind === "obligacion").map((i) => i.label),
        };
      });
    },
  }),
  defineTool({
    name: "aplicar_plantilla_rubro",
    title: "Aplicar plantilla de rubro",
    description: 'Aplica la plantilla de un rubro a una organización ("aplicá la plantilla de gastronomía a esta organización"). Antes conviene mostrar la vista previa. Es sensible: queda en Aprobaciones hasta que una persona la apruebe.',
    module: "industrias",
    level: "sensible",
    roles: ["dueno", "contador"],
    input: z.object({ organizacion_id: uuid("ID de la organización"), rubro }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    describe: (i) => {
      const key = (() => {
        try {
          return resolveKey(i.rubro);
        } catch {
          return null;
        }
      })();
      const t = key ? templateItemsCount(key) : null;
      return `Aplicar la plantilla de ${key ? INDUSTRY_NAMES[key] : i.rubro}${t ? ` (${t} ítems: obligaciones, checklist, categorías y tareas)` : ""}`;
    },
    async handler(input, ctx) {
      await ctx.organization(input.organizacion_id);
      return wrap(async () => {
        const r = await applyTemplate(ctx.studioId, ctx.actor, input.organizacion_id, resolveKey(input.rubro));
        return { listo: `Apliqué la plantilla (versión ${r.version}): ${r.created} ítems nuevos en la organización` };
      });
    },
  }),
];

function templateItemsCount(key: string) {
  const t = FILE_TEMPLATES.find((x) => x.clave === key);
  return t ? templateItems(t).length : null;
}
