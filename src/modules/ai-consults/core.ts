// Consultas laborales y fiscales con IA: reglas puras (sin base de datos)

export const CONSULT_TOPICS = { laboral: "Laboral", fiscal: "Impositiva o fiscal" } as const;
export type ConsultTopic = keyof typeof CONSULT_TOPICS;
export const isTopic = (v: unknown): v is ConsultTopic => typeof v === "string" && v in CONSULT_TOPICS;

export const CONSULT_STATUS = { generando: "Preparando", borrador: "Para revisar", aprobada: "Enviada", descartada: "Descartada", error: "Sin borrador" } as const;
export type ConsultStatus = keyof typeof CONSULT_STATUS;

/** Prompt de redacción: contexto mínimo y pedido de prudencia (el estudio revisa antes de enviar) */
export function consultPrompt(i: { topic: ConsultTopic; studio: string; organization: string; subject: string; question: string; history?: string[] }) {
  return [
    `CONSULTA_IA · tema: ${i.topic}`,
    `Sos parte del equipo del estudio contable "${i.studio}" (Argentina). Un cliente, "${i.organization}", hizo una consulta ${i.topic === "laboral" ? "laboral (sueldos, convenios, ART, licencias, cargas sociales)" : "impositiva o fiscal (ARCA, monotributo, IVA, Ganancias, Ingresos Brutos)"}.`,
    "Prepará un borrador de respuesta en español rioplatense (voseo), claro y breve, para que una persona del estudio lo revise antes de enviarlo.",
    "Si falta información, decí qué datos necesitás. No inventes normas, fechas ni importes: si no estás seguro, indicá que el estudio lo confirma. No prometas resultados.",
    `Asunto: ${i.subject}`,
    ...(i.history?.length ? ["Mensajes anteriores:", ...i.history] : []),
    `Consulta: ${i.question}`,
  ].join("\n");
}

/** ¿El texto aprobado difiere del borrador? (se registra si el estudio lo editó) */
export const wasEdited = (draft: string | null, final: string) => (draft ?? "").replace(/\s+/g, " ").trim() !== final.replace(/\s+/g, " ").trim();
