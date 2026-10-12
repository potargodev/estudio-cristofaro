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
let failNext = 0; // POST /__fail {"n": 3} → las próximas n respuestas son 429
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
  // Centro de ayuda: responde citando el artículo
  if (rows && rows.length && rows[0]?.enlace && rows[0]?.titulo) return `${rows[0].resumen}\n\nFuente: [${rows[0].titulo}](${rows[0].enlace})`;
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

const num = (v) => {
  const t = String(v).toLowerCase().replace(/\$/g, "");
  const k = t.endsWith("k") ? 1000 : 1;
  return Number(t.replace(/k$/, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) * k;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const people = (s) => s.split(/\s*(?:,|\by\b)\s*/).map((n) => n.trim()).filter(Boolean).map(cap);

/** Vigía (§2.m): varias tool calls por mensaje, imágenes y consultas */
function copilot(body, last, q) {
  const parts = Array.isArray(last?.content) ? last.content : [];
  if (parts.some((p) => p.type === "image_url" || p.type === "file")) return { tools: [{ tool: "crear_movimiento", args: { tipo: "gasto", monto: 18450, descripcion: "Coto", categoria: "Supermercado", medio_pago: "debito" } }] };
  const grupo = q.match(/cre[aá] (?:un )?grupo (.+?) con (.+?)(?:\.|$)/);
  if (grupo) return { tools: [{ tool: "crear_grupo", args: { nombre: cap(grupo[1].trim()), tipo: "viaje", integrantes: people(grupo[2]) } }] };
  const caja = q.match(/pagu[eé]\s*\$?\s*([\d.,]+k?)\s+(?:de |en |por )?(?:la |el |los |las )?(.+?)\s+(?:con|para) (?:mi |mis |los |las )?(pareja|novi[ao]|familia|socios?|abuel[oa]s|padres|viejos)/);
  if (caja) return { tools: [{ tool: "registrar_en_caja_compartida", args: { caja: caja[3], descripcion: cap(caja[2].trim()), monto: num(caja[1]) } }] };
  const gasto = q.match(/pagu[eé]\s*\$?\s*([\d.,]+k?)\s*(?:de (?:la |el |los |las )?(.+?))?\s+con\s+(.+?)(?:\s+en (?:el grupo )?(.+?))?(?:,|\.|$)/);
  if (gasto) return { tools: [{ tool: "crear_gasto_en_grupo", args: { descripcion: cap(gasto[2] ?? "Gasto"), monto: num(gasto[1]), dividir_entre: people(gasto[3]), ...(gasto[4] ? { grupo: gasto[4] } : {}) } }] };
  if (/cu[aá]nto gast[eé]/.test(q)) return { tools: [{ tool: "consultar_bitacora", args: /delivery|comida/.test(q) ? { categoria: "Comida y delivery" } : {} }] };
  const debo = q.match(/(?:debo|deben|saldo)(?: (?:a|con) ([a-záéíóúñ]+))?/);
  if (debo) return { tools: [{ tool: "consultar_saldos", args: debo[1] ? { persona: cap(debo[1]) } : {} }] };
  const rec = q.match(/recordame (.+?) el (\d{4}-\d{2}-\d{2})(?: a las (\d{1,2}))?/);
  if (rec) return { tools: [{ tool: "recordar", args: { texto: rec[1], cuando: `${rec[2]}T${String(rec[3] ?? 9).padStart(2, "0")}:00` } }] };
  const ayer = /\bayer\b/.test(q);
  const d = new Date(Date.now() - 3 * 3600_000 - (ayer ? 86400_000 : 0)).toISOString().slice(0, 10);
  const items = [...q.matchAll(/(\d[\d.,]*k?)\s+(?:de |en (?:el |la )?)?([a-záéíóúñ ]+?)(?=\s+y\s+|,|\.|$)/g)].map((m) => ({
    tool: "crear_movimiento",
    args: { tipo: /cobr|sueldo|changa/.test(m[2]) ? "ingreso" : "gasto", monto: num(m[1]), fecha: d, descripcion: cap(m[2].replace(/\s+(para el|del|de mi) (negocio|trabajo|laburo)$/, "").trim()), ...(/nafta|sube|uber/.test(m[2]) ? { categoria: "Transporte" } : /chino|super/.test(m[2]) ? { categoria: "Supermercado" } : {}), ...(/negocio|trabajo|laburo|changa/.test(q) ? { caja: "negocio" } : {}) },
  }));
  if (items.length) return { tools: items };
  return { text: "Contame un gasto, por ejemplo «5000 de nafta»." };
}

/** Decide la próxima respuesta: { text } o { tool, args } (o { tools } con varias) */
// Lectura inteligente (F6): devuelve el JSON tipado según el nombre del
// archivo que viene en el pedido ("archivo: edenor.pdf", "ticket", "dudoso", "roto")
function extraction(q) {
  const file = (q.match(/archivo:\s*(\S+)/) ?? [])[1] ?? "";
  const base = { tipo_documento: "factura", cuit_receptor: null, moneda: "ARS", no_gravado: null, exento: null, percepciones: [], cae: null, vencimiento_cae: null };
  const today = new Date().toISOString().slice(0, 10);
  if (file.includes("roto")) return "No pude leer el documento.";
  if (file.includes("ticket"))
    return JSON.stringify({ ...base, tipo_documento: "ticket", cuit_emisor: "30500010912", razon_social_emisor: "Supermercado Día", letra: "B", codigo_comprobante: 6, punto_venta: 12, numero: 99881, fecha: today, neto_gravado: 10000, iva: [{ alicuota: 21, importe: 2100 }], total: 12100, confianza: { cuit_emisor: 0.9, fecha: 0.95, total: 0.97, numero: 0.85 } });
  // §2.q etapa 2: factura de compra con ítems, percepciones por jurisdicción y una retención informada
  if (file.includes("mayorista")) {
    const n = Number((file.match(/(\d+)/) ?? [])[1] ?? 100);
    return JSON.stringify({ ...base, cuit_emisor: "30712345671", razon_social_emisor: "Molinos del Plata SA", letra: "A", codigo_comprobante: 1, punto_venta: 7, numero: n, fecha: today, neto_gravado: 230000, iva: [{ alicuota: 21, importe: 48300 }], percepciones: [{ concepto: "Percepción IIBB CABA (AGIP)", importe: 6900 }, { concepto: "Percepción IVA RG 2408", importe: 6900 }], retenciones: [{ concepto: "Retención Ganancias RG 830", importe: 1500 }], items: [{ descripcion: "Harina 000 x 25 kg", codigo: "HAR25", cantidad: 10, precio_unitario: 18000, alicuota: 21, importe: 180000 }, { descripcion: "Levadura 500 g", codigo: "LEV500", cantidad: 20, precio_unitario: 2500, alicuota: 21, importe: 50000 }], total: 292100, cae: "75123456789013", vencimiento_cae: today, confianza: { cuit_emisor: 0.98, fecha: 0.97, total: 0.99, numero: 0.96, cae: 0.93 } });
  }
  if (file.includes("dudoso"))
    return JSON.stringify({ ...base, cuit_emisor: "30711111112", razon_social_emisor: "Proveedor Dudoso SRL", letra: "A", codigo_comprobante: 1, punto_venta: 3, numero: 120, fecha: today, neto_gravado: 50000, iva: [{ alicuota: 21, importe: 10500 }], total: 70000, cae: "123", confianza: { cuit_emisor: 0.55, fecha: 0.9, total: 0.6, numero: 0.7 } });
  const n = Number((file.match(/(\d+)/) ?? [])[1] ?? 45);
  return JSON.stringify({ ...base, cuit_emisor: "30711111111", razon_social_emisor: "Edenor S.A.", letra: "A", codigo_comprobante: 1, punto_venta: 2, numero: n, fecha: today, neto_gravado: 100000, iva: [{ alicuota: 21, importe: 21000 }], percepciones: [{ concepto: "Percepción IIBB", importe: 3000 }], total: 124000, cae: "75123456789012", vencimiento_cae: today, confianza: { cuit_emisor: 0.98, fecha: 0.96, total: 0.99, numero: 0.95, cae: 0.9 } });
}

// Consultas laborales y fiscales (ai_consults): borrador de respuesta para que el estudio lo revise
function consult(q) {
  const laboral = q.includes("tema: laboral");
  return laboral
    ? "Gracias por tu consulta. El aguinaldo (SAC) se paga en dos cuotas, la primera hasta el 30 de junio y la segunda hasta el 18 de diciembre, y equivale al 50% de la mejor remuneración mensual del semestre. Si el empleado trabajó menos tiempo, se calcula en proporción. Cualquier duda, te ayudamos con la liquidación."
    : "Gracias por tu consulta. Si sos monotributista, la recategorización es semestral (enero y julio) y se hace con los ingresos de los últimos 12 meses. Si te pasás del tope de tu categoría tenés que subir; si superás el máximo de la escala, pasás al régimen general. Revisamos tus números y te confirmamos la categoría que corresponde.";
}

/** Agente contable (§2.q): plan, una herramienta por paso y el informe al final */
function agent(msgs, tools) {
  const done = msgs.filter((m) => m.role === "tool").length;
  const ask = text(msgs.find((m) => m.role === "user")).toLowerCase();
  const steps = /solicitud/.test(ask) ? [["listar_solicitudes", { estados: ["abierta"] }], ["listar_vencimientos", {}]] : [["resumen_estudio", {}]];
  const next = steps[done];
  if (next && tools.has(next[0])) return { tool: next[0], args: next[1] };
  const results = msgs.filter((m) => m.role === "tool").map((m) => { try { return JSON.parse(text(m)); } catch { return {}; } });
  const open = results[0]?.total ?? firstArray(results[0])?.length ?? 0;
  return { text: `Plan:\n- Buscar las solicitudes abiertas de la cartera\n- Cruzarlas con los vencimientos próximos\n\nInforme:\n- (media) Hay ${open} solicitudes abiertas para responder.\n- (baja) Revisá las que llevan más de una semana sin respuesta.` };
}

function decide(body) {
  const msgs = body.messages ?? [];
  const system = msgs.filter((m) => m.role === "system").map(text).join("\n");
  const last = msgs[msgs.length - 1];
  const tools = new Set((body.tools ?? []).map((t) => t.function?.name));
  if (system.includes("Agente contable de Faro")) return agent(msgs, tools);
  if (last?.role === "tool") {
    let parsed;
    try { parsed = JSON.parse(text(last)); } catch { parsed = text(last); }
    return { text: summarize(parsed) };
  }
  const q = text(last).toLowerCase();
  if (q.includes("lectura_inteligente")) return { text: extraction(q) };
  if (q.includes("consulta_ia")) return { text: consult(q) };
  if (tools.has("crear_movimiento")) return copilot(body, last, q);
  const want = (tool, args) => (tools.has(tool) ? { tool, args } : { text: `No tengo disponible la herramienta \`${tool}\` con tus permisos.` });
  if (/confirm[eé]|cancel[eé]/.test(q)) return { text: "Perfecto, ya quedó registrado." };
  const uuid = q.match(UUID)?.[0];
  // Grupos de gastos: "pagué $48.000 de la cena con Juan y Ana, dividido igual"
  const gasto = q.match(/pagu[eé]\s*\$?\s*([\d.,]+)\s*(?:de (?:la |el |los |las )?(.+?))?\s+con\s+(.+?)(?:,|\.|$)/);
  if (gasto) {
    const monto = Number(gasto[1].replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    const descripcion = gasto[2] ? gasto[2].charAt(0).toUpperCase() + gasto[2].slice(1) : "Gasto";
    const dividir_entre = gasto[3].split(/\s*(?:,|\by\b)\s*/).map((n) => n.trim()).filter(Boolean).map((n) => n.charAt(0).toUpperCase() + n.slice(1));
    return want("crear_gasto", { descripcion, monto, dividir_entre });
  }
  if (/^¿?c[oó]mo |d[oó]nde (est[aá]|se)/.test(q.trim())) return want("buscar_ayuda", { consulta: q.replace(/[¿?]/g, "").trim() });
  if (/saldo|cu[aá]nto (?:le )?debo|me deben/.test(q)) return want("consultar_saldos", {});
  // Rubros: "aplicá la plantilla de gastronomía a esta organización" / "¿qué obligaciones típicas tiene la construcción?"
  const plantilla = q.match(/plantilla de ([a-záéíóúñ\s-]+?)(?: a | en |$)/);
  if (plantilla && /apl[ií]c/.test(q)) {
    const org = uuid ?? contextId(system, "organizacion");
    return org ? want("aplicar_plantilla_rubro", { organizacion_id: org, rubro: plantilla[1].trim() }) : { text: "¿A qué organización?" };
  }
  const tipicas = q.match(/obligaciones t[ií]picas (?:tiene |de )?(?:el |la |los |las )?(?:rubro )?([a-záéíóúñ\s-]+)/);
  if (tipicas) return want("obligaciones_tipicas_rubro", { rubro: tipicas[1].replace(/[?¿]/g, "").trim() });
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
  if (req.method === "POST" && req.url === "/__fail") {
    let raw = "";
    for await (const c of req) raw += c;
    failNext = Number(JSON.parse(raw || "{}").n ?? 0);
    return res.end(JSON.stringify({ failNext }));
  }
  if ((req.url?.endsWith("/chat/completions") || req.url?.endsWith("/audio/transcriptions")) && failNext > 0) {
    failNext--;
    for await (const _ of req);
    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: { message: "Rate limit reached (prueba)", type: "rate_limit_exceeded", code: "rate_limit_exceeded" } }));
  }
  // Transcripción de audio (Whisper): texto fijo
  if (req.method === "POST" && req.url?.endsWith("/audio/transcriptions")) {
    for await (const _ of req);
    log.push({ at: new Date().toISOString(), transcription: true });
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ text: "ayer 5000 de nafta y 3200 en el chino" }));
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
  log.push({ at: new Date().toISOString(), tools: (body.tools ?? []).map((t) => t.function?.name), last: body.messages?.at(-1), decision: d, system: text(body.messages?.find((m) => m.role === "system")).slice(0, 20000) });
  const id = `chatcmpl-${Date.now()}`;
  const base = { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: body.model };
  if (!body.stream) {
    res.setHeader("Content-Type", "application/json");
    if (d.tool) d.tools = [{ tool: d.tool, args: d.args }];
    const message = d.tools
      ? { role: "assistant", content: null, tool_calls: d.tools.map((t, i) => ({ id: `call_${Date.now()}_${i}`, type: "function", function: { name: t.tool, arguments: JSON.stringify(t.args) } })) }
      : { role: "assistant", content: d.text.startsWith("Hola") ? "OK" : d.text };
    return res.end(JSON.stringify({ ...base, object: "chat.completion", choices: [{ index: 0, message, finish_reason: d.tools ? "tool_calls" : "stop" }], usage }));
  }
  if (d.tools && !d.tool) Object.assign(d, { tool: d.tools[0].tool, args: d.tools[0].args });
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
