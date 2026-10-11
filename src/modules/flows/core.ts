// Flujos (F4), sin base ni red: el grafo (nodos y conexiones del canvas),
// su validación, el recorrido, las condiciones, las plantillas de texto con
// {{variables}}, el próximo disparo de un horario, los reintentos, el
// catálogo de eventos, las plantillas listas y el armado de un borrador a
// partir de una frase.

export type NodeKind = "disparador" | "condicion" | "accion" | "aprobacion" | "espera";

export type Trigger =
  | { tipo: "evento"; evento: string }
  | { tipo: "horario"; frecuencia: "diaria" | "semanal" | "mensual"; hora: string; dia?: number }
  | { tipo: "webhook" }
  | { tipo: "vigia" };

export interface ConditionData {
  campo: string;
  operador: "igual" | "distinto" | "mayor" | "menor" | "contiene" | "existe" | "no_existe";
  valor?: string;
}

export type ActionData =
  | { accion: "herramienta"; herramienta: string; entrada: Record<string, unknown>; por_organizacion?: boolean }
  | { accion: "aviso"; para: "duenos" | "equipo"; titulo: string; texto?: string }
  | { accion: "mail"; para: "duenos" | "equipo"; asunto: string; texto: string }
  | { accion: "tarea"; titulo: string; detalle?: string; vence_en_dias?: number; organizacion?: string }
  | { accion: "solicitud"; organizacion: string; asunto: string; mensaje: string };

export interface FlowNode {
  id: string;
  type: NodeKind;
  position: { x: number; y: number };
  data: (Trigger & { kind?: "disparador" }) | ConditionData | ActionData | { motivo: string } | { dias?: number; horas?: number } | Record<string, unknown>;
}
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  /** Salida de una condición: "si" o "no" */
  sourceHandle?: string | null;
}
export interface Graph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ───────────── Eventos que emiten los módulos ─────────────

export const EVENTS: Record<string, { label: string; campos: string[] }> = {
  "factura.emitida": { label: "Se emitió una factura en ARCA", campos: ["factura_id", "organizacion_id", "total", "cliente", "tipo"] },
  "documento.leido": { label: "Se leyó un documento con IA", campos: ["documento_id", "organizacion_id", "emisor", "total", "tipo", "repetido"] },
  "documento.confirmado": { label: "Se confirmó un comprobante leído", campos: ["documento_id", "organizacion_id", "emisor", "total", "cuenta"] },
  "solicitud.creada": { label: "Un cliente abrió una solicitud", campos: ["solicitud_id", "organizacion_id", "tipo", "asunto"] },
  "vencimiento.proximo": { label: "Un vencimiento vence en 3 días", campos: ["vencimiento_id", "organizacion_id", "titulo", "fecha", "importe"] },
  "monotributo.cerca_del_tope": { label: "Un monotributista pasó el 80 % del tope", campos: ["organizacion_id", "porcentaje", "categoria"] },
  "honorarios.cargo_generado": { label: "Se generó un cargo de honorarios", campos: ["cargo_id", "organizacion_id", "importe", "vence"] },
  "honorarios.pagado": { label: "Un cliente pagó honorarios", campos: ["cargo_id", "organizacion_id", "importe"] },
  "recibo.firmado": { label: "Un empleado firmó su recibo", campos: ["recibo_id", "organizacion_id", "decision", "periodo"] },
  "recibo.sin_firmar": { label: "Un recibo lleva 7 días sin firmar", campos: ["lote_id", "organizacion_id", "periodo", "pendientes"] },
  "conciliacion.extracto_importado": { label: "Se importó un extracto bancario", campos: ["extracto_id", "organizacion_id", "movimientos"] },
  "empleado.alta": { label: "Se dio de alta un empleado", campos: ["empleado_id", "organizacion_id", "nombre"] },
  "empleado.baja": { label: "Se dio de baja un empleado", campos: ["empleado_id", "organizacion_id", "nombre"] },
  "tarea.creada": { label: "Alguien del equipo creó una tarea", campos: ["tarea_id", "organizacion_id", "titulo", "vence"] },
  "consulta_ia.preparada": { label: "La IA preparó la respuesta a una consulta", campos: ["consulta_id", "solicitud_id", "organizacion_id", "tema"] },
  "whatsapp.recibido": { label: "Llegó un mensaje por WhatsApp", campos: ["mensaje_id", "organizacion_id", "tipo", "texto"] },
};

// ───────────── Validación ─────────────

export interface GraphIssue {
  node?: string;
  message: string;
}

/**
 * Un disparador, todo conectado desde él, sin ciclos, condiciones con sus dos
 * salidas y datos mínimos en cada nodo. `knownTools` son las herramientas
 * que el estudio puede usar.
 */
export function validateGraph(g: Graph, knownTools: Set<string>): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const triggers = g.nodes.filter((n) => n.type === "disparador");
  if (triggers.length !== 1) issues.push({ message: "El flujo tiene que tener un solo disparador." });
  if (g.nodes.length > 40) issues.push({ message: "Un flujo puede tener hasta 40 pasos." });
  const ids = new Set(g.nodes.map((n) => n.id));
  for (const e of g.edges) if (!ids.has(e.source) || !ids.has(e.target)) issues.push({ message: "Hay una conexión a un paso que no existe." });
  const out = (id: string) => g.edges.filter((e) => e.source === id);
  // Ciclos (DFS)
  const state = new Map<string, number>();
  const visit = (id: string): boolean => {
    state.set(id, 1);
    for (const e of out(id)) {
      const s = state.get(e.target);
      if (s === 1) return true;
      if (!s && visit(e.target)) return true;
    }
    state.set(id, 2);
    return false;
  };
  if (triggers[0] && visit(triggers[0].id)) issues.push({ message: "El flujo no puede volver a un paso anterior (tiene un ciclo)." });
  for (const n of g.nodes) {
    if (n.type !== "disparador" && !state.has(n.id)) issues.push({ node: n.id, message: "Este paso no está conectado al disparador." });
    const d = n.data as Record<string, unknown>;
    if (n.type === "disparador") {
      if (d.tipo === "evento" && !(String(d.evento) in EVENTS)) issues.push({ node: n.id, message: "Elegí el evento que dispara el flujo." });
      if (d.tipo === "horario" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.hora ?? ""))) issues.push({ node: n.id, message: "Poné la hora (HH:MM)." });
      if (!["evento", "horario", "webhook", "vigia"].includes(String(d.tipo))) issues.push({ node: n.id, message: "Elegí el tipo de disparador." });
    }
    if (n.type === "condicion") {
      if (!d.campo) issues.push({ node: n.id, message: "La condición necesita un campo." });
      const hs = out(n.id).map((e) => e.sourceHandle);
      if (!hs.includes("si") && !hs.includes("no")) issues.push({ node: n.id, message: "Conectá la salida «sí» o «no» de la condición." });
    }
    if (n.type === "accion") {
      if (d.accion === "herramienta" && !knownTools.has(String(d.herramienta))) issues.push({ node: n.id, message: `La herramienta «${String(d.herramienta ?? "")}» no está disponible.` });
      if ((d.accion === "aviso" || d.accion === "tarea") && !String(d.titulo ?? "").trim()) issues.push({ node: n.id, message: "Poné el título." });
      if (d.accion === "mail" && !String(d.asunto ?? "").trim()) issues.push({ node: n.id, message: "Poné el asunto del mail." });
      if (d.accion === "solicitud" && !String(d.asunto ?? "").trim()) issues.push({ node: n.id, message: "Poné el asunto de la solicitud." });
      if (!["herramienta", "aviso", "mail", "tarea", "solicitud"].includes(String(d.accion))) issues.push({ node: n.id, message: "Elegí qué hace este paso." });
    }
    if (n.type === "espera") {
      const mins = Number(d.dias ?? 0) * 1440 + Number(d.horas ?? 0) * 60;
      if (!(mins > 0) || mins > 90 * 1440) issues.push({ node: n.id, message: "La espera va de 1 hora a 90 días." });
    }
    if (n.type !== "condicion" && out(n.id).length > 1) issues.push({ node: n.id, message: "Solo las condiciones se dividen en dos caminos." });
  }
  return issues;
}

/** Próximos pasos desde un nodo (en una condición, la salida que corresponde) */
export function nextNodes(g: Graph, nodeId: string, branch?: "si" | "no") {
  return g.edges.filter((e) => e.source === nodeId && (branch ? e.sourceHandle === branch : true)).map((e) => e.target);
}

// ───────────── Datos del contexto ─────────────

/** Valor en el contexto por ruta: "evento.total", "pasos.n3.resultado.link" */
export function get(ctx: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), ctx);
}

/** Reemplaza {{ruta}} con valores del contexto (en textos y en objetos) */
export function interpolate<T>(v: T, ctx: unknown): T {
  if (typeof v === "string") {
    const whole = /^\{\{\s*([\w.]+)\s*\}\}$/.exec(v);
    if (whole) return (get(ctx, whole[1]) ?? "") as T;
    return v.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, p) => {
      const x = get(ctx, p);
      return x == null ? "" : String(x);
    }) as T;
  }
  if (Array.isArray(v)) return v.map((x) => interpolate(x, ctx)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, interpolate(x, ctx)])) as T;
  return v;
}

export function evalCondition(c: ConditionData, ctx: unknown): boolean {
  const x = get(ctx, c.campo);
  const val = c.valor ?? "";
  const num = (s: unknown) => Number(String(s).replace(",", "."));
  switch (c.operador) {
    case "existe":
      return x != null && x !== "" && x !== false;
    case "no_existe":
      return x == null || x === "" || x === false;
    case "igual":
      return String(x ?? "").toLowerCase() === val.toLowerCase();
    case "distinto":
      return String(x ?? "").toLowerCase() !== val.toLowerCase();
    case "mayor":
      return num(x) > num(val);
    case "menor":
      return num(x) < num(val);
    case "contiene":
      return String(x ?? "").toLowerCase().includes(val.toLowerCase());
  }
}

// ───────────── Horario y reintentos ─────────────

const AR_OFFSET = -3; // Argentina, sin horario de verano

/** Próximo disparo de un horario (hora de Buenos Aires), estrictamente después de `from` */
export function nextScheduled(t: Extract<Trigger, { tipo: "horario" }>, from = new Date()): Date {
  const [h, m] = t.hora.split(":").map(Number);
  const local = new Date(from.getTime() + AR_OFFSET * 3600_000);
  for (let i = 0; i <= 62; i++) {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i, h, m));
    const ok = t.frecuencia === "diaria" || (t.frecuencia === "semanal" && d.getUTCDay() === (t.dia ?? 1) % 7) || (t.frecuencia === "mensual" && d.getUTCDate() === Math.min(t.dia ?? 1, 28));
    const utc = new Date(d.getTime() - AR_OFFSET * 3600_000);
    if (ok && utc > from) return utc;
  }
  return new Date(from.getTime() + 86400000);
}

/** Espera antes de reintentar un paso fallido: 1, 5 y 30 minutos (3 reintentos) */
export const RETRY_MINUTES = [1, 5, 30];
export const retryAt = (attempt: number, now = new Date()) => (attempt <= RETRY_MINUTES.length ? new Date(now.getTime() + RETRY_MINUTES[attempt - 1] * 60_000) : null);

// ───────────── Plantillas ─────────────

let seq = 0;
const node = (type: NodeKind, data: FlowNode["data"], y: number, x = 0): FlowNode => ({ id: `n${++seq}`, type, position: { x, y }, data });
const chain = (nodes: FlowNode[], branches: [number, number, "si" | "no"][] = []): Graph => {
  const edges: FlowEdge[] = [];
  const branched = new Set(branches.map(([a]) => a));
  nodes.forEach((n, i) => {
    if (i < nodes.length - 1 && !branched.has(i) && nodes[i + 1].position.x === n.position.x) edges.push({ id: `e${n.id}-${nodes[i + 1].id}`, source: n.id, target: nodes[i + 1].id });
  });
  for (const [a, b, h] of branches) edges.push({ id: `e${nodes[a].id}-${nodes[b].id}`, source: nodes[a].id, target: nodes[b].id, sourceHandle: h });
  return { nodes, edges };
};

export interface Template {
  key: string;
  name: string;
  description: string;
  build: () => Graph;
}

export const TEMPLATES: Template[] = [
  {
    key: "recordar_vencimientos",
    name: "Recordar vencimientos al cliente",
    description: "3 días antes de cada vencimiento, le avisa a la organización (pasa por Aprobaciones).",
    build: () => {
      seq = 0;
      return chain([node("disparador", { tipo: "evento", evento: "vencimiento.proximo" }, 0), node("accion", { accion: "herramienta", herramienta: "recordar_vencimiento", entrada: { vencimiento_id: "{{evento.vencimiento_id}}" } }, 140)]);
    },
  },
  {
    key: "pedir_documentacion",
    name: "Pedir documentación faltante",
    description: "El día 1 de cada mes, a cada organización que todavía no subió comprobantes del mes anterior le abre una solicitud pidiéndolos (pasa por Aprobaciones).",
    build: () => {
      seq = 0;
      return chain([node("disparador", { tipo: "horario", frecuencia: "mensual", hora: "09:00", dia: 1 }, 0), node("accion", { accion: "herramienta", herramienta: "pedir_documentacion", entrada: {}, por_organizacion: true }, 140)]);
    },
  },
  {
    key: "recibo_no_firmado",
    name: "Avisar por recibo no firmado",
    description: "Si un lote lleva 7 días con recibos sin firmar, recuerda la firma (pasa por Aprobaciones) y deja una tarea al equipo.",
    build: () => {
      seq = 0;
      return chain([
        node("disparador", { tipo: "evento", evento: "recibo.sin_firmar" }, 0),
        node("accion", { accion: "herramienta", herramienta: "recordar_firma_recibos", entrada: { organizacion_id: "{{evento.organizacion_id}}", lote_id: "{{evento.lote_id}}" } }, 140),
        node("accion", { accion: "tarea", titulo: "Revisar recibos sin firmar ({{evento.periodo}})", detalle: "{{evento.pendientes}} empleados todavía no firmaron.", vence_en_dias: 3, organizacion: "{{evento.organizacion_id}}" }, 280),
      ]);
    },
  },
  {
    key: "resumen_mensual",
    name: "Resumen mensual al cliente",
    description: "El día 2 de cada mes, manda a cada organización el resumen del mes: vencimientos, documentos, solicitudes y honorarios (pasa por Aprobaciones).",
    build: () => {
      seq = 0;
      return chain([node("disparador", { tipo: "horario", frecuencia: "mensual", hora: "10:00", dia: 2 }, 0), node("accion", { accion: "herramienta", herramienta: "enviar_resumen_mensual", entrada: {}, por_organizacion: true }, 140)]);
    },
  },
  {
    key: "cobro_con_recordatorios",
    name: "Cobro con recordatorios",
    description: "Cuando se genera un cargo de honorarios, manda el cobro; a los 7 días, si sigue pendiente, lo vuelve a mandar y avisa al equipo.",
    build: () => {
      seq = 0;
      return chain(
        [
          node("disparador", { tipo: "evento", evento: "honorarios.cargo_generado" }, 0),
          node("accion", { accion: "herramienta", herramienta: "enviar_cobro", entrada: { cargo_id: "{{evento.cargo_id}}" } }, 140),
          node("espera", { dias: 7 }, 280),
          node("condicion", { campo: "consulta.cargo.estado", operador: "igual", valor: "pendiente" }, 420),
          node("accion", { accion: "herramienta", herramienta: "enviar_cobro", entrada: { cargo_id: "{{evento.cargo_id}}" } }, 560),
          node("accion", { accion: "aviso", para: "duenos", titulo: "Cobro impago a los 7 días", texto: "Se volvió a mandar el cobro {{evento.cargo_id}}." }, 700),
        ],
        [[3, 4, "si"]],
      );
    },
  },
  {
    key: "monotributo_tope",
    name: "Alerta de monotributo cerca del tope",
    description: "Cuando una organización pasa el 80 % del tope de su categoría, avisa al equipo y deja una tarea para revisar la recategorización.",
    build: () => {
      seq = 0;
      return chain([
        node("disparador", { tipo: "evento", evento: "monotributo.cerca_del_tope" }, 0),
        node("accion", { accion: "aviso", para: "equipo", titulo: "Monotributo al {{evento.porcentaje}} % del tope", texto: "Categoría {{evento.categoria}}." }, 140),
        node("accion", { accion: "tarea", titulo: "Revisar recategorización (categoría {{evento.categoria}})", vence_en_dias: 7, organizacion: "{{evento.organizacion_id}}" }, 280),
      ]);
    },
  },
];
export const getTemplate = (k: string) => TEMPLATES.find((t) => t.key === k) ?? null;

// ───────────── Frase → borrador ─────────────

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const EVENT_WORDS: [RegExp, string][] = [
  [/factura de proveedor|comprobante|documento|ticket|lectura/, "documento.leido"],
  [/emit(o|a|e)|factur(e|a) en arca|facturo/, "factura.emitida"],
  [/solicitud|pedido del cliente|consulta del cliente/, "solicitud.creada"],
  [/vencimiento|vence/, "vencimiento.proximo"],
  [/monotributo|tope|recategoriz/, "monotributo.cerca_del_tope"],
  [/pag(o|a|an) (los |sus )?honorarios|cobr(o|amos)|pago de honorarios/, "honorarios.pagado"],
  [/cargo|abono|honorario/, "honorarios.cargo_generado"],
  [/no conforme|firm(o|a|e)|recibo/, "recibo.firmado"],
  [/extracto|banco|conciliaci/, "conciliacion.extracto_importado"],
  [/alta de empleado|nuevo empleado|ingres(o|a) un empleado/, "empleado.alta"],
  [/baja de empleado|renunci/, "empleado.baja"],
];

/**
 * Borrador de flujo desde una frase («cada vez que entre una factura de
 * proveedor, avisale a administración»): elige el disparador por palabras
 * clave (evento u horario) y la acción (aviso, mail, tarea o una plantilla).
 * Siempre queda en borrador para revisar en el canvas.
 */
export function flowFromPhrase(frase: string): { name: string; graph: Graph; explicacion: string } {
  seq = 0;
  const f = norm(frase);
  let trigger: Trigger = { tipo: "vigia" };
  const horario = /todos los dias|cada dia|diariamente/.test(f) ? "diaria" : /cada semana|todos los lunes|semanal/.test(f) ? "semanal" : /cada mes|todos los meses|mensual|el dia \d+/.test(f) ? "mensual" : null;
  const hora = /(\d{1,2})(?::(\d{2}))?\s*(?:hs|h|horas)/.exec(f);
  if (horario) trigger = { tipo: "horario", frecuencia: horario, hora: `${String(hora ? Math.min(23, Number(hora[1])) : 9).padStart(2, "0")}:${hora?.[2] ?? "00"}`, dia: horario === "mensual" ? Number(/el dia (\d+)/.exec(f)?.[1] ?? 1) : horario === "semanal" ? 1 : undefined };
  else {
    const ev = EVENT_WORDS.find(([r]) => r.test(f));
    if (ev) trigger = { tipo: "evento", evento: ev[1] };
  }
  const para: "duenos" | "equipo" = /dueno|socio|direccion/.test(f) ? "duenos" : "equipo";
  const label = trigger.tipo === "evento" ? EVENTS[trigger.evento].label : trigger.tipo === "horario" ? `Horario ${trigger.frecuencia}` : "Pedido al Vigía";
  const steps: FlowNode[] = [node("disparador", trigger, 0)];
  if (/no conforme/.test(f)) steps.push(node("condicion", { campo: "evento.decision", operador: "igual", valor: "no_conforme" }, 140));
  const y = steps.length * 140;
  const quien = /administracion/.test(f) ? "administración" : para === "duenos" ? "los dueños" : "el equipo";
  if (/tarea/.test(f)) steps.push(node("accion", { accion: "tarea", titulo: `Revisar: ${label}`, vence_en_dias: 3, organizacion: "{{evento.organizacion_id}}" }, y));
  else if (/mail|correo/.test(f)) steps.push(node("accion", { accion: "mail", para, asunto: label, texto: `Aviso automático: ${label}.` }, y));
  else steps.push(node("accion", { accion: "aviso", para, titulo: label, texto: `Para ${quien}.` }, y));
  const graph: Graph = { nodes: steps, edges: [] };
  for (let i = 0; i < steps.length - 1; i++) graph.edges.push({ id: `e${steps[i].id}-${steps[i + 1].id}`, source: steps[i].id, target: steps[i + 1].id, sourceHandle: steps[i].type === "condicion" ? "si" : null });
  const name = frase.trim().replace(/^./, (c) => c.toUpperCase()).slice(0, 80);
  return { name, graph, explicacion: `Disparador: ${label}. Acción: ${steps[steps.length - 1].data && (steps[steps.length - 1].data as { accion: string }).accion === "tarea" ? "crear una tarea" : (steps[steps.length - 1].data as { accion: string }).accion === "mail" ? "mandar un mail" : "avisar"} a ${quien}.` };
}
