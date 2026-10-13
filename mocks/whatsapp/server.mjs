// Simulador de WhatsApp Business Cloud API (Graph API de Meta) para pruebas.
// Nunca en producción.
//
//   node mocks/whatsapp/server.mjs     → http://localhost:4080
//
// En Faro: WHATSAPP_API_URL=http://localhost:4080 (en producción,
// https://graph.facebook.com/v21.0). Cualquier token que empiece con "EAA"
// es válido. Implementa:
// - POST /:phoneNumberId/messages → envía plantillas (solo aprobadas) y textos
//   (solo dentro de las 24 h desde el último mensaje del contacto).
// - GET /:wabaId/message_templates → plantillas de la cuenta.
// - GET /:mediaId → URL del archivo; GET /__media/:id → el archivo.
// - POST /__inbound { webhook, app_secret, phone_number_id, from, text? |
//   image_base64? + mime? } → simula que un cliente escribe: guarda el
//   archivo y manda el webhook firmado (X-Hub-Signature-256) a la app.
// - POST /__status { webhook, app_secret, phone_number_id, id, status } → acuse
//   de entrega o lectura.
// GET /__sent · POST /__reset

import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4080);
const TEMPLATES = [
  { name: "faro_codigo", language: "es_AR", category: "AUTHENTICATION", status: "APPROVED", body: "Tu código de Faro es {{1}}. Vence en 10 minutos." },
  { name: "faro_aviso_vencimiento", language: "es_AR", category: "UTILITY", status: "APPROVED", body: "Hola {{1}}: {{2}} vence el {{3}}. Lo ves en tu portal." },
  { name: "faro_respuesta_solicitud", language: "es_AR", category: "UTILITY", status: "APPROVED", body: "Hola {{1}}: el estudio respondió tu solicitud «{{2}}». Entrá a tu portal para verla." },
  { name: "faro_aviso_general", language: "es_AR", category: "UTILITY", status: "APPROVED", body: "Hola {{1}}: {{2}}" },
  { name: "faro_documento", language: "es_AR", category: "UTILITY", status: "APPROVED", body: "Hola: te compartimos {{1}}. Lo ves o descargás acá: {{2}} (el link vence el {{3}})." },
  { name: "faro_promo", language: "es_AR", category: "MARKETING", status: "PENDING", body: "Novedades del estudio: {{1}}" },
];
let sent = [];
const media = new Map();
const lastInbound = new Map(); // teléfono -> fecha
const stats = { sent: 0, rejected: 0, webhooks: 0 };

const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const read = (req) => new Promise((ok) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => ok(Buffer.concat(c))); });
const authed = (req) => /^Bearer EAA/.test(req.headers.authorization ?? "");
const err = (res, code, message, c = 100) => json(res, code, { error: { message, type: "OAuthException", code: c, fbtrace_id: randomBytes(6).toString("hex") } });

async function webhook(url, secret, payload) {
  const body = JSON.stringify(payload);
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig }, body });
  stats.webhooks++;
  return { status: r.status, body: await r.text() };
}
const entry = (pnid, value) => ({ object: "whatsapp_business_account", entry: [{ id: "WABA-MOCK", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "5491100000000", phone_number_id: pnid }, ...value } }] }] });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const parts = url.pathname.replace(/^\/v\d+\.\d+/, "").split("/").filter(Boolean);
  try {
    if (url.pathname === "/__sent") return json(res, 200, { sent, stats });
    if (url.pathname === "/__reset" && req.method === "POST") { sent = []; media.clear(); lastInbound.clear(); return json(res, 200, { ok: true }); }
    if (url.pathname === "/__inbound" && req.method === "POST") {
      const b = JSON.parse((await read(req)).toString());
      const id = `wamid.IN${randomBytes(8).toString("hex")}`;
      lastInbound.set(b.from, Date.now());
      const msg = { from: b.from, id, timestamp: String(Math.floor(Date.now() / 1000)) };
      if (b.image_base64) {
        const mid = `MEDIA${randomBytes(5).toString("hex")}`;
        const mime = b.mime ?? "image/jpeg";
        media.set(mid, { data: Buffer.from(b.image_base64, "base64"), mime });
        Object.assign(msg, mime === "application/pdf" ? { type: "document", document: { id: mid, mime_type: mime, filename: b.filename ?? "comprobante.pdf", caption: b.text } } : { type: "image", image: { id: mid, mime_type: mime, caption: b.text } });
      } else Object.assign(msg, { type: "text", text: { body: b.text ?? "" } });
      const payload = entry(b.phone_number_id, { contacts: [{ profile: { name: b.name ?? "Cliente" }, wa_id: b.from }], messages: [msg] });
      const r = await webhook(b.webhook, b.app_secret, payload);
      return json(res, 200, { id, webhook: r });
    }
    if (url.pathname === "/__status" && req.method === "POST") {
      const b = JSON.parse((await read(req)).toString());
      const r = await webhook(b.webhook, b.app_secret, entry(b.phone_number_id, { statuses: [{ id: b.id, status: b.status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: b.to ?? "" }] }));
      return json(res, 200, { webhook: r });
    }
    if (parts[0] === "__media" && parts[1]) {
      if (!authed(req)) return err(res, 401, "Invalid OAuth access token", 190);
      const m = media.get(parts[1]);
      if (!m) return err(res, 404, "Unknown media");
      res.writeHead(200, { "Content-Type": m.mime });
      return res.end(m.data);
    }
    if (!authed(req)) return err(res, 401, "Invalid OAuth access token", 190);
    if (parts[1] === "message_templates" && req.method === "GET") {
      return json(res, 200, { data: TEMPLATES.map((t, i) => ({ id: `TPL${i + 1}`, name: t.name, language: t.language, category: t.category, status: t.status, components: [{ type: "BODY", text: t.body }] })) });
    }
    if (parts[1] === "messages" && req.method === "POST") {
      const b = JSON.parse((await read(req)).toString());
      const to = String(b.to ?? "");
      if (!/^\d{10,15}$/.test(to)) { stats.rejected++; return err(res, 400, "Invalid parameter: to", 100); }
      if (b.type === "template") {
        const t = TEMPLATES.find((x) => x.name === b.template?.name && x.language === b.template?.language?.code);
        if (!t) { stats.rejected++; return err(res, 404, `Template name does not exist in the translation (${b.template?.name})`, 132001); }
        if (t.status !== "APPROVED") { stats.rejected++; return err(res, 400, "Template is not approved", 132015); }
      } else if (b.type === "text") {
        const at = lastInbound.get(to);
        if (!at || Date.now() - at > 24 * 3600 * 1000) { stats.rejected++; return err(res, 400, "Re-engagement message: more than 24 hours since the customer last replied", 131047); }
      }
      const id = `wamid.OUT${randomBytes(8).toString("hex")}`;
      sent.push({ id, phone_number_id: parts[0], ...b, at: new Date().toISOString() });
      stats.sent++;
      return json(res, 200, { messaging_product: "whatsapp", contacts: [{ input: to, wa_id: to }], messages: [{ id }] });
    }
    if (parts.length === 1 && req.method === "GET" && media.has(parts[0])) {
      const m = media.get(parts[0]);
      return json(res, 200, { url: `http://localhost:${PORT}/__media/${parts[0]}`, mime_type: m.mime, id: parts[0], file_size: m.data.length });
    }
    return err(res, 404, "Unknown path");
  } catch (e) {
    return err(res, 500, e.message);
  }
}).listen(PORT, () => console.log(`Simulador de WhatsApp en http://localhost:${PORT}`));
