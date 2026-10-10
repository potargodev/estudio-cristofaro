import "server-only";
import { z } from "zod/v4";
import { getSiteUrl } from "@/lib/runtime-config";
import { articleUrl, categoryName, getArticle, searchArticles } from "@/modules/help/catalog";
import { defineTool, ToolError } from "../types";

// Centro de ayuda para el Asistente y MCP: preguntas de uso de Faro se
// responden citando y enlazando los artículos de docs/ayuda (solo lectura).

const ROLES = ["dueno", "contador", "colaborador", "titular"] as const;

export const ayudaTools = [
  defineTool({
    name: "buscar_ayuda",
    title: "Buscar en el centro de ayuda",
    description:
      "Busca artículos del centro de ayuda de Faro (cómo usar la plataforma: registro, planes, invitaciones, roles, vencimientos, documentos, solicitudes, grupos de gastos, IA y aprobaciones, MCP, conexiones, Flotas, Red de estudios). Usala para cualquier pregunta de uso y citá el artículo con su enlace.",
    module: "ayuda",
    level: "lectura",
    roles: ROLES,
    input: z.object({ consulta: z.string().min(2).max(200).describe("Qué quiere hacer la persona, en sus palabras") }),
    async handler(input) {
      const base = getSiteUrl();
      return searchArticles(input.consulta, null, 4).map((a) => ({
        titulo: a.titulo,
        categoria: categoryName(a.categoria),
        enlace: `${base}${articleUrl(a)}`,
        resumen: a.resumen,
        contenido: a.body.slice(0, 2500),
      }));
    },
  }),
  defineTool({
    name: "leer_articulo_ayuda",
    title: "Leer un artículo de ayuda",
    description: "Texto completo de un artículo del centro de ayuda, por su id (categoria/slug).",
    module: "ayuda",
    level: "lectura",
    roles: ROLES,
    input: z.object({ id: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/).describe("categoria/slug, ej. grupos-de-gastos/invitar") }),
    async handler(input) {
      const [c, s] = input.id.split("/");
      const a = getArticle(c, s);
      if (!a) throw new ToolError("No existe ese artículo.", "no_encontrado");
      return { titulo: a.titulo, enlace: `${getSiteUrl()}${articleUrl(a)}`, actualizado: a.actualizado, contenido: a.body };
    },
  }),
];
