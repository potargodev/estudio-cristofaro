import "server-only";
import { randomBytes } from "node:crypto";
import { simGet, simLog, simSet } from "./server";

// Parte C · Simulador de la Cloud API de WhatsApp dentro de Faro: lo que se
// manda queda en la bitácora (y se ve en el «Teléfono de prueba»), las
// plantillas vienen aprobadas y los archivos que «manda» el teléfono de
// prueba se guardan en el estado del simulador.

const TEMPLATES = [
  { name: "faro_codigo", category: "AUTHENTICATION", body: "Tu código de Faro es {{1}}. Vence en 10 minutos." },
  { name: "faro_aviso_vencimiento", category: "UTILITY", body: "Hola {{1}}: {{2}} vence el {{3}}. Lo ves en tu portal. Respondé BAJA para no recibir más avisos." },
  { name: "faro_respuesta_solicitud", category: "UTILITY", body: "Hola {{1}}: el estudio respondió tu solicitud «{{2}}». Entrá a tu portal para verla." },
  { name: "faro_aviso_general", category: "UTILITY", body: "Hola {{1}}: {{2}}" },
  { name: "faro_documento", category: "UTILITY", body: "Hola: te compartimos {{1}}. Lo ves o descargás acá: {{2}} (el link vence el {{3}})." },
];

type Account = { id: string; studio_id: string | null; waba_id: string | null; phone_number_id: string | null };

export async function simGraph(a: Account, path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  if (path.startsWith(`${a.waba_id}/message_templates`)) return { data: TEMPLATES.map((t, i) => ({ id: `sim-tpl-${i}`, name: t.name, language: "es_AR", category: t.category, status: "APPROVED", components: [{ type: "BODY", text: t.body }] })) };
  if (path === `${a.phone_number_id}/messages` && init?.method === "POST") {
    const payload = JSON.parse(String(init.body ?? "{}")) as { to?: string; type?: string; text?: { body?: string }; template?: { name?: string; components?: { parameters?: { text?: string }[] }[] } };
    // La plantilla con sus valores (así el código de verificación se ve en la bitácora del panel)
    const values = (payload.template?.components ?? []).flatMap((c) => c.parameters ?? []).map((p) => p.text).filter(Boolean);
    const id = `wamid.SIM${randomBytes(8).toString("hex")}`;
    await simLog("whatsapp", "saliente", `A ${payload.to}: ${payload.type === "text" ? payload.text?.body : `plantilla ${payload.template?.name}${values.length ? ` (${values.join(" · ")})` : ""}`}`.slice(0, 300), { id, to: payload.to, payload }, a.studio_id);
    return { messaging_product: "whatsapp", contacts: [{ wa_id: payload.to }], messages: [{ id }] };
  }
  const media = await simGet<{ mime: string }>("whatsapp", `media:${path}`);
  if (media) return { id: path, url: `sim-media:${path}`, mime_type: media.mime };
  throw new Error(`Simulador de WhatsApp: pedido desconocido (${path})`);
}

/** Guarda un archivo que «manda» el teléfono de prueba y devuelve su ID */
export async function storeSimMedia(data: Buffer, mime: string) {
  const id = `SIMMEDIA${randomBytes(6).toString("hex")}`;
  await simSet("whatsapp", `media:${id}`, { mime, b64: data.toString("base64") });
  return id;
}

export async function simMedia(url: string) {
  const m = await simGet<{ mime: string; b64: string }>("whatsapp", `media:${url.replace("sim-media:", "")}`);
  if (!m) throw new Error("El simulador no tiene ese archivo.");
  return { data: Buffer.from(m.b64, "base64"), mime: m.mime };
}
