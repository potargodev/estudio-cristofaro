"use client";

import "@xyflow/react/dist/style.css";
import { addEdge, Background, Controls, Handle, Position, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { Clock, GitBranch, Play, ShieldCheck, Zap } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { saveFlowAction } from "@/app/admin/flujos-actions";

// Canvas del flujo (@xyflow/react): disparador, condiciones (con salidas «sí»
// y «no»), acciones, aprobaciones y esperas. Debajo, el panel para editar el
// paso elegido. Guardar manda el grafo al servidor, que lo vuelve a validar.

type Kind = "disparador" | "condicion" | "accion" | "aprobacion" | "espera";
type Data = Record<string, unknown>;
type FNode = Node<Data, Kind>;
interface Props {
  id: string;
  name: string;
  graph: { nodes: FNode[]; edges: Edge[] };
  events: { key: string; label: string; campos: string[] }[];
  tools: { name: string; title: string; level: string }[];
  readOnly?: boolean;
}

const ICON = { disparador: Zap, condicion: GitBranch, accion: Play, aprobacion: ShieldCheck, espera: Clock };
const KIND_LABEL: Record<Kind, string> = { disparador: "Disparador", condicion: "Condición", accion: "Acción", aprobacion: "Pedir aprobación", espera: "Esperar" };
const ACTIONS: Record<string, string> = { herramienta: "Usar una herramienta", aviso: "Aviso al equipo", mail: "Mail al equipo", tarea: "Crear una tarea", solicitud: "Abrir una solicitud" };

function summary(type: Kind, d: Data, events: Props["events"], tools: Props["tools"]) {
  if (type === "disparador") return d.tipo === "evento" ? (events.find((e) => e.key === d.evento)?.label ?? "Elegí el evento") : d.tipo === "horario" ? `Cada ${d.frecuencia === "diaria" ? "día" : d.frecuencia === "semanal" ? "semana" : "mes"} a las ${String(d.hora ?? "")}` : d.tipo === "webhook" ? "Webhook entrante" : "Pedido al Vigía";
  if (type === "condicion") return `Si ${String(d.campo ?? "…")} ${String(d.operador ?? "")} ${String(d.valor ?? "")}`;
  if (type === "espera") return `${Number(d.dias ?? 0)} días ${Number(d.horas ?? 0) ? `${Number(d.horas)} h` : ""}`;
  if (type === "aprobacion") return String(d.motivo ?? "Aprobación");
  if (d.accion === "herramienta") return tools.find((t) => t.name === d.herramienta)?.title ?? String(d.herramienta ?? "Elegí la herramienta");
  return `${ACTIONS[String(d.accion)] ?? "Acción"}${d.titulo || d.asunto ? `: ${String(d.titulo ?? d.asunto)}` : ""}`;
}

function StepNode({ type, data, selected }: NodeProps<FNode>) {
  const Icon = ICON[type as Kind] ?? Play;
  return (
    <div className={`w-56 rounded-md border bg-surface px-3 py-2 text-[12px] shadow-sm ${selected ? "border-navy ring-1 ring-navy" : "border-line"}`}>
      {type !== "disparador" && <Handle type="target" position={Position.Top} />}
      <p className="flex items-center gap-1.5 font-semibold text-ink">
        <Icon className="size-3.5 text-rose-deep" aria-hidden /> {KIND_LABEL[type as Kind]}
      </p>
      <p className="mt-0.5 line-clamp-2 text-muted">{String(data.__summary ?? "")}</p>
      {type === "condicion" ? (
        <>
          <Handle type="source" position={Position.Bottom} id="si" style={{ left: "30%" }} />
          <Handle type="source" position={Position.Bottom} id="no" style={{ left: "70%" }} />
          <div className="mt-1 flex justify-between px-6 text-[10px] text-muted">
            <span>sí</span>
            <span>no</span>
          </div>
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} />
      )}
    </div>
  );
}

const field = "mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-[14px] text-ink";

export function FlowEditor(p: Props) {
  const [name, setName] = useState(p.name);
  const [nodes, setNodes, onNodesChange] = useNodesState<FNode>(p.graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(p.graph.edges);
  const [sel, setSel] = useState<string | null>(null);
  const nodeTypes = useMemo(() => ({ disparador: StepNode, condicion: StepNode, accion: StepNode, aprobacion: StepNode, espera: StepNode }), []);
  const view = nodes.map((n) => ({ ...n, data: { ...n.data, __summary: summary(n.type as Kind, n.data, p.events, p.tools) } }));
  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, id: `e${c.source}-${c.target}-${c.sourceHandle ?? ""}`, label: c.sourceHandle ?? undefined }, es)), [setEdges]);
  const selected = nodes.find((n) => n.id === sel) ?? null;
  const set = (patch: Data) => setNodes((ns) => ns.map((n) => (n.id === sel ? { ...n, data: { ...n.data, ...patch } } : n)));
  const add = (type: Kind) => {
    const id = `n${Date.now().toString(36)}`;
    const maxY = Math.max(0, ...nodes.map((n) => n.position.y));
    const data: Data = type === "condicion" ? { campo: "evento.total", operador: "mayor", valor: "0" } : type === "accion" ? { accion: "aviso", para: "equipo", titulo: "Aviso" } : type === "espera" ? { dias: 1 } : { motivo: "¿Seguimos?" };
    setNodes((ns) => [...ns, { id, type, position: { x: 0, y: maxY + 140 }, data }]);
    setSel(id);
  };
  const remove = () => {
    if (!selected || selected.type === "disparador") return;
    setNodes((ns) => ns.filter((n) => n.id !== selected.id));
    setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id));
    setSel(null);
  };
  const graph = JSON.stringify({ nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })), edges: edges.map(({ id, source, target, sourceHandle }) => ({ id, source, target, sourceHandle: sourceHandle ?? null })) });
  const d = (selected?.data ?? {}) as Data;
  const fields = selected?.type === "disparador" ? p.events.find((e) => e.key === d.evento)?.campos ?? [] : p.events.find((e) => e.key === (nodes.find((n) => n.type === "disparador")?.data.evento as string))?.campos ?? [];

  return (
    <form action={saveFlowAction} className="grid gap-3">
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="graph" value={graph} />
      <label className="text-[13px] text-muted">
        Nombre
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} disabled={p.readOnly} className={field} />
      </label>
      {!p.readOnly && (
        <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Agregar pasos">
          {(["condicion", "accion", "aprobacion", "espera"] as Kind[]).map((k) => (
            <button key={k} type="button" onClick={() => add(k)} className="inline-flex h-8 items-center gap-1 rounded-md border border-line bg-surface px-2.5 text-[13px] hover:border-muted">
              + {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      <div className="h-[420px] overflow-hidden rounded-md border border-line bg-canvas sm:h-[520px]" aria-label="Canvas del flujo">
        <ReactFlow nodes={view} edges={edges.map((e) => ({ ...e, label: e.sourceHandle ?? undefined }))} nodeTypes={nodeTypes} onNodesChange={p.readOnly ? undefined : onNodesChange} onEdgesChange={p.readOnly ? undefined : onEdgesChange} onConnect={p.readOnly ? undefined : onConnect} onNodeClick={(_, n) => setSel(n.id)} onPaneClick={() => setSel(null)} fitView proOptions={{ hideAttribution: true }} deleteKeyCode={p.readOnly ? null : ["Backspace", "Delete"]}>
          <Background gap={16} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <p className="text-[12px] text-muted">Tocá un paso para editarlo. Para conectar, arrastrá desde el punto de abajo de un paso hasta otro. Las condiciones tienen dos salidas: sí y no.</p>
      {selected && (
        <section aria-label="Paso elegido" className="grid gap-2 rounded-md border border-navy/40 bg-surface p-4 sm:grid-cols-2">
          <p className="text-[14px] font-semibold sm:col-span-2">{KIND_LABEL[selected.type as Kind]}</p>
          {selected.type === "disparador" && (
            <>
              <label className="text-[13px] text-muted">
                Se dispara
                <select value={String(d.tipo)} onChange={(e) => set({ tipo: e.target.value })} disabled={p.readOnly} className={field}>
                  <option value="evento">Cuando pasa algo (evento)</option>
                  <option value="horario">Por horario</option>
                  <option value="webhook">Webhook entrante</option>
                  <option value="vigia">Cuando se lo pido al Vigía</option>
                </select>
              </label>
              {d.tipo === "evento" && (
                <label className="text-[13px] text-muted">
                  Evento
                  <select value={String(d.evento ?? "")} onChange={(e) => set({ evento: e.target.value })} disabled={p.readOnly} className={field}>
                    {p.events.map((e) => (
                      <option key={e.key} value={e.key}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {d.tipo === "horario" && (
                <>
                  <label className="text-[13px] text-muted">
                    Frecuencia
                    <select value={String(d.frecuencia ?? "diaria")} onChange={(e) => set({ frecuencia: e.target.value })} disabled={p.readOnly} className={field}>
                      <option value="diaria">Todos los días</option>
                      <option value="semanal">Todas las semanas</option>
                      <option value="mensual">Todos los meses</option>
                    </select>
                  </label>
                  <label className="text-[13px] text-muted">
                    Hora
                    <input type="time" value={String(d.hora ?? "09:00")} onChange={(e) => set({ hora: e.target.value })} disabled={p.readOnly} className={field} />
                  </label>
                  {d.frecuencia !== "diaria" && (
                    <label className="text-[13px] text-muted">
                      {d.frecuencia === "semanal" ? "Día (1 = lunes … 7 = domingo)" : "Día del mes"}
                      <input type="number" min={1} max={d.frecuencia === "semanal" ? 7 : 28} value={Number(d.dia ?? 1)} onChange={(e) => set({ dia: Number(e.target.value) })} disabled={p.readOnly} className={field} />
                    </label>
                  )}
                </>
              )}
            </>
          )}
          {selected.type === "condicion" && (
            <>
              <label className="text-[13px] text-muted">
                Campo
                <input list="campos" value={String(d.campo ?? "")} onChange={(e) => set({ campo: e.target.value })} disabled={p.readOnly} className={field} />
                <datalist id="campos">
                  {fields.map((c) => (
                    <option key={c} value={`evento.${c}`} />
                  ))}
                  <option value="consulta.cargo.estado" />
                  <option value="consulta.recibo.estado" />
                </datalist>
              </label>
              <label className="text-[13px] text-muted">
                Operador
                <select value={String(d.operador ?? "igual")} onChange={(e) => set({ operador: e.target.value })} disabled={p.readOnly} className={field}>
                  {["igual", "distinto", "mayor", "menor", "contiene", "existe", "no_existe"].map((o) => (
                    <option key={o} value={o}>
                      {o.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[13px] text-muted sm:col-span-2">
                Valor
                <input value={String(d.valor ?? "")} onChange={(e) => set({ valor: e.target.value })} disabled={p.readOnly} className={field} />
              </label>
            </>
          )}
          {selected.type === "accion" && (
            <>
              <label className="text-[13px] text-muted">
                Qué hace
                <select value={String(d.accion ?? "aviso")} onChange={(e) => set({ accion: e.target.value })} disabled={p.readOnly} className={field}>
                  {Object.entries(ACTIONS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              {d.accion === "herramienta" && (
                <>
                  <label className="text-[13px] text-muted">
                    Herramienta
                    <select value={String(d.herramienta ?? "")} onChange={(e) => set({ herramienta: e.target.value })} disabled={p.readOnly} className={field}>
                      <option value="">Elegí…</option>
                      {p.tools.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.title}
                          {t.level === "sensible" ? " (pasa por Aprobaciones)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[13px] text-muted sm:col-span-2">
                    Datos (JSON, podés usar {"{{evento.campo}}"})
                    <textarea defaultValue={JSON.stringify(d.entrada ?? {}, null, 1)} onBlur={(e) => { try { set({ entrada: JSON.parse(e.target.value || "{}") }); } catch { /* se corrige al guardar */ } }} disabled={p.readOnly} rows={3} className="mt-1 block w-full rounded-md border border-line bg-surface p-2 font-mono text-[12px] text-ink" />
                  </label>
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={!!d.por_organizacion} onChange={(e) => set({ por_organizacion: e.target.checked })} disabled={p.readOnly} /> Una vez por cada organización activa
                  </label>
                </>
              )}
              {(d.accion === "aviso" || d.accion === "mail") && (
                <label className="text-[13px] text-muted">
                  Para
                  <select value={String(d.para ?? "equipo")} onChange={(e) => set({ para: e.target.value })} disabled={p.readOnly} className={field}>
                    <option value="equipo">Todo el equipo</option>
                    <option value="duenos">Los dueños</option>
                  </select>
                </label>
              )}
              {(d.accion === "aviso" || d.accion === "tarea") && (
                <label className="text-[13px] text-muted sm:col-span-2">
                  Título
                  <input value={String(d.titulo ?? "")} onChange={(e) => set({ titulo: e.target.value })} disabled={p.readOnly} className={field} />
                </label>
              )}
              {(d.accion === "mail" || d.accion === "solicitud") && (
                <label className="text-[13px] text-muted sm:col-span-2">
                  Asunto
                  <input value={String(d.asunto ?? "")} onChange={(e) => set({ asunto: e.target.value })} disabled={p.readOnly} className={field} />
                </label>
              )}
              {(d.accion === "aviso" || d.accion === "mail") && (
                <label className="text-[13px] text-muted sm:col-span-2">
                  Texto
                  <input value={String(d.texto ?? "")} onChange={(e) => set({ texto: e.target.value })} disabled={p.readOnly} className={field} />
                </label>
              )}
              {(d.accion === "tarea" || d.accion === "solicitud") && (
                <label className="text-[13px] text-muted">
                  Organización (ID o {"{{evento.organizacion_id}}"})
                  <input value={String(d.organizacion ?? "")} onChange={(e) => set({ organizacion: e.target.value })} disabled={p.readOnly} className={field} />
                </label>
              )}
              {d.accion === "tarea" && (
                <label className="text-[13px] text-muted">
                  Vence en (días)
                  <input type="number" min={0} max={90} value={Number(d.vence_en_dias ?? 3)} onChange={(e) => set({ vence_en_dias: Number(e.target.value) })} disabled={p.readOnly} className={field} />
                </label>
              )}
              {d.accion === "solicitud" && (
                <label className="text-[13px] text-muted sm:col-span-2">
                  Mensaje
                  <input value={String(d.mensaje ?? "")} onChange={(e) => set({ mensaje: e.target.value })} disabled={p.readOnly} className={field} />
                </label>
              )}
            </>
          )}
          {selected.type === "espera" && (
            <>
              <label className="text-[13px] text-muted">
                Días
                <input type="number" min={0} max={90} value={Number(d.dias ?? 0)} onChange={(e) => set({ dias: Number(e.target.value) })} disabled={p.readOnly} className={field} />
              </label>
              <label className="text-[13px] text-muted">
                Horas
                <input type="number" min={0} max={23} value={Number(d.horas ?? 0)} onChange={(e) => set({ horas: Number(e.target.value) })} disabled={p.readOnly} className={field} />
              </label>
            </>
          )}
          {selected.type === "aprobacion" && (
            <label className="text-[13px] text-muted sm:col-span-2">
              Qué se aprueba
              <input value={String(d.motivo ?? "")} onChange={(e) => set({ motivo: e.target.value })} disabled={p.readOnly} className={field} />
            </label>
          )}
          {!p.readOnly && selected.type !== "disparador" && (
            <div className="sm:col-span-2">
              <button type="button" onClick={remove} className="h-9 rounded-md border border-[#efc4bd] px-3 text-[13px] text-[#8f2a1c]">
                Quitar este paso
              </button>
            </div>
          )}
        </section>
      )}
      {!p.readOnly && (
        <div>
          <button type="submit" className="h-10 rounded-md bg-navy px-4 text-[14px] font-medium text-paper">
            Guardar
          </button>
        </div>
      )}
    </form>
  );
}
