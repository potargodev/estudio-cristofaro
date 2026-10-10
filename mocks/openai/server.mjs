// Proveedor de IA de prueba, compatible con la API de OpenAI (chat completions,
// con y sin streaming). Responde de forma determinística según palabras clave
// del último mensaje, para probar el Asistente sin gastar tokens:
//
//   node mocks/openai/server.mjs            → http://localhost:4010/v1
//   PORT=4011 node mocks/openai/server.mjs
//
// En Faro: IA → Configuración → "Compatible con OpenAI", URL base
// http://localhost:4010/v1, modelo "faro-mock". Cada pedido queda en
// GET /__log (para verificar qué herramientas recibió el modelo).

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4010);
const log = [];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const text = (m) => (typeof m?.content === "string" ? m.content : Array.isArray(m?.content) ? m.content.map((p) => p.text ?? "").join(" ") : "");

/** Primer UUID del contexto del sistema para un tipo ("organizacion", "solicitud"…) */
function contextId(system, kind) {
  const line = system.split("\n").find((l) => l.startsWith(`- ${kind}:`));
  return line?.match(UUID)?.[0] ?? null;
}

function firstArray(v, depth = 0) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object" && depth < 3) for (const x of Object.values(v)) { const a = firstArray(x, depth + 1); if (a) return a; }
  return null;
}

function summarize(result) {
  if (!result || typeof result !== "object") return `Resultado: ${JSON.stringify(result)}`;
  if (result.estado === "enviado_a_aprobacion") return `Listo: lo dejé como borrador en **Aprobaciones** para que alguien del estudio lo revise. No se envió nada todavía.\n\n> ${result.resumen}`;
  if (result.estado === "requiere_confirmacion") return `Para hacerlo necesito que lo confirmes en la tarjeta: **${result.resumen}**.`;
  if (result.estado === "denegado" || result.estado === "error") return `No pude hacerlo: ${result.motivo}`;
  const data = result.resultado ?? result;
  if (data && typeof data.listo === "string") return `${data.listo}.${Array.isArray(data.partes) ? `\n\n${data.partes.map((p) => `- ${p}`).join("\n")}` : ""}`;
  const rows = firstArray(result);
  if (rows && rows.length && typeof rows[0] === "object") {
    const cols = Object.keys(rows[0]).filter((k) => !/id$/.test(k) && typeof rows[0][k] !== "object").slice(0, 4);
    const fmt = (v) => (v == null ? "—" : String(v).replace(/\|/g, "/").slice(0, 40));
    return `Encontré **${rows.length}** resultado${rows.length === 1 ? "" : "s"}:\n\n| ${cols.join(" | ")} |\n| ${cols.map(() => "---").join(" | ")} |\n${rows
      .slice(0, 8)
      .map((r) => `| ${cols.map((c) => fmt(r[c])).join(" | ")} |`)
      .join("\n")}`;
  }
  if (rows && rows.length === 0) return "No encontré resultados.";
  return `Esto es lo que encontré:\n\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 1500)}\n\`\`\``;
}

/** Decide la próxima respuesta: { text } o { tool, args } */
function decide(body) {
  const msgs = body.messages ?? [];
  const system = msgs.filter((m) => m.role === "system").map(text).join("\n");
  const last = msgs[msgs.length - 1];
  const tools = new Set((body.tools ?? []).map((t) => t.function?.name));
  if (last?.role === "tool") {
    let parsed;
    try { parsed = JSON.parse(text(last)); } catch { parsed = text(last); }
    return { text: summarize(parsed) };
  }
  const q = text(last).toLowerCase();
  const want = (tool, args) => (tools.has(tool) ? { tool, args } : { text: `No tengo disponible la herramienta \`${tool}\` con tus permisos.` });
  if (/confirm[eé]|cancel[eé]/.test(q)) return { text: "Perfecto, ya quedó registrado." };
  const uuid = q.match(UUID)?.[0];
  // Gastos compartidos: "pagué $48.000 de la cena con Juan y Ana, dividido igual"
  const gasto = q.match(/pagu[eé]\s*\$?\s*([\d.,]+)\s*(?:de (?:la |el |los |las )?(.+?))?\s+con\s+(.+?)(?:,|\.|$)/);
  if (gasto) {
    const monto = Number(gasto[1].replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    const descripcion = gasto[2] ? gasto[2].charAt(0).toUpperCase() + gasto[2].slice(1) : "Gasto";
    const dividir_entre = gasto[3].split(/\s*(?:,|\by\b)\s*/).map((n) => n.trim()).filter(Boolean).map((n) => n.charAt(0).toUpperCase() + n.slice(1));
    return want("crear_gasto", { descripcion, monto, dividir_entre });
  }
  if (/saldo|cu[aá]nto (?:le )?debo|me deben/.test(q)) return want("consultar_saldos", {});
  if (q.includes("respond")) {
    const id = uuid ?? contextId(system, "solicitud");
    return id ? want("responder_solicitud", { solicitud_id: id, mensaje: "Hola, ya revisamos tu consulta: la factura se emite esta semana y te la mandamos por el portal. Cualquier duda, escribinos." }) : { text: "¿Qué solicitud querés responder?" };
  }
  if (q.includes("abrí una solicitud") || q.includes("crear solicitud")) {
    const org = uuid ?? contextId(system, "organizacion");
    return org ? want("crear_solicitud", { organizacion_id: org, tipo: "consulta", asunto: "Pedido recibido por WhatsApp", detalle: "El cliente pidió la constancia de inscripción." }) : { text: "¿En qué organización?" };
  }
  if (q.includes("vencimiento") && q.includes("crear")) {
    const org = uuid ?? contextId(system, "organizacion");
    return want("crear_vencimiento", { organizacion_id: org, impuesto: "IVA", periodo: "2026-10", vencimiento: "2026-11-18", importe: 125000, avisar_al_cliente: true });
  }
  if (q.includes("vencimiento")) return want("listar_vencimientos", {});
  if (q.includes("resumen")) return want("resumen_estudio", {});
  if (q.includes("xubio")) return want("listar_registros_externos", { fuente: "xubio" });
  if (q.includes("mcp externo")) {
    const ext = [...tools].find((t) => t.includes("__"));
    return ext ? want(ext, {}) : { text: "No hay herramientas de MCP externos." };
  }
  if (uuid && q.includes("organizaci")) return want("ver_organizacion", { organizacion_id: uuid });
  if (q.includes("busc") || q.includes("organizaciones")) return want("buscar_organizaciones", {});
  return { text: "Hola, soy el **modelo de prueba** de Faro. Preguntame por vencimientos, organizaciones o solicitudes." };
}

const usage = { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 };

createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/__log") {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(log.slice(-50)));
  }
  if (req.method === "GET" && req.url?.endsWith("/models")) {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ data: [{ id: "faro-mock", object: "model" }] }));
  }
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
    res.statusCode = 404;
    return res.end("{}");
  }
  if (process.env.MOCK_API_KEY && req.headers.authorization !== `Bearer ${process.env.MOCK_API_KEY}`) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: { message: "Invalid API key", type: "invalid_request_error" } }));
  }
  let raw = "";
  for await (const c of req) raw += c;
  const body = JSON.parse(raw || "{}");
  const d = decide(body);
  log.push({ at: new Date().toISOString(), tools: (body.tools ?? []).map((t) => t.function?.name), last: body.messages?.at(-1), decision: d });
  const id = `chatcmpl-${Date.now()}`;
  const base = { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: body.model };
  if (!body.stream) {
    res.setHeader("Content-Type", "application/json");
    const message = d.tool
      ? { role: "assistant", content: null, tool_calls: [{ id: `call_${Date.now()}`, type: "function", function: { name: d.tool, arguments: JSON.stringify(d.args) } }] }
      : { role: "assistant", content: d.text.startsWith("Hola") ? "OK" : d.text };
    return res.end(JSON.stringify({ ...base, object: "chat.completion", choices: [{ index: 0, message, finish_reason: d.tool ? "tool_calls" : "stop" }], usage }));
  }
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  send({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] });
  if (d.tool) {
    send({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `call_${Date.now()}`, type: "function", function: { name: d.tool, arguments: "" } }] }, finish_reason: null }] });
    send({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(d.args) } }] }, finish_reason: null }] });
    send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
  } else {
    for (const piece of d.text.match(/[\s\S]{1,24}/g) ?? []) {
      send({ ...base, choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] });
      await new Promise((r) => setTimeout(r, 15));
    }
    send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
  }
  send({ ...base, choices: [], usage });
  res.end("data: [DONE]\n\n");
}).listen(PORT, () => console.log(`[mock-openai] http://localhost:${PORT}/v1`));
