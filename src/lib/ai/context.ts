// Contexto que se adjunta a un mensaje del Asistente (lo arma la caja de
// entrada). Solo viajan tipo e ID: el servidor resuelve y valida cada uno.

export type ContextKind = "organizacion" | "documento" | "solicitud";
export interface ContextRef {
  kind: ContextKind;
  id: string;
}
export interface ContextItem extends ContextRef {
  label: string;
  hint?: string;
}

export const CONTEXT_LABEL: Record<ContextKind, string> = {
  organizacion: "Organización",
  documento: "Documento",
  solicitud: "Solicitud",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseContextRefs(value: unknown): ContextRef[] {
  if (!Array.isArray(value)) return [];
  const out: ContextRef[] = [];
  for (const v of value.slice(0, 10)) {
    const k = (v as ContextRef)?.kind;
    const id = (v as ContextRef)?.id;
    if ((k === "organizacion" || k === "documento" || k === "solicitud") && typeof id === "string" && UUID.test(id)) out.push({ kind: k, id });
  }
  return out;
}

/** "organizacion:<id>" (parámetro ?contexto= del botón "Preguntar a Faro") */
export function parseContextParam(v: string | undefined): ContextRef[] {
  if (!v) return [];
  return parseContextRefs(
    v.split(",").map((x) => {
      const [kind, id] = x.split(":");
      return { kind, id };
    }),
  );
}
