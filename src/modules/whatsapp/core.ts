import { createHmac, timingSafeEqual } from "node:crypto";

// WhatsApp Business Cloud API: reglas puras (teléfonos, firmas, webhooks y plantillas)

/**
 * Teléfono argentino → formato de WhatsApp (solo dígitos, 549 + área + número).
 * Acepta "+54 9 11 2233-4455", "011 15 2233-4455", "1122334455"…
 */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1); // número local con 0 de larga distancia
  else if (d.startsWith("54")) d = d.slice(2).replace(/^9/, "");
  else if (d.length > 11) return /^\d{11,15}$/.test(d) ? d : null; // otro país, ya con código
  if (d.startsWith("54") && d.length > 11) d = d.slice(2).replace(/^9/, "");
  // "15" después del código de área (2 a 4 dígitos)
  for (const area of [2, 3, 4]) {
    if (d.length === 12 && d.slice(area, area + 2) === "15") {
      d = d.slice(0, area) + d.slice(area + 2);
      break;
    }
  }
  return d.length === 10 ? `549${d}` : null;
}

/** Muestra un teléfono sin exponerlo entero (+54 9 11 ••••-4455) */
export const maskPhone = (p: string) => `+${p.slice(0, 2)} ${p.slice(2, 3)} ${p.slice(3, 5)} ••••-${p.slice(-4)}`;

/** Firma de Meta: X-Hub-Signature-256 = sha256=HMAC(app_secret, cuerpo crudo) */
export function verifySignature(appSecret: string, raw: string, header: string | null) {
  if (!header?.startsWith("sha256=")) return false;
  const want = createHmac("sha256", appSecret).update(raw).digest("hex");
  const got = header.slice(7);
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export interface InboundMessage {
  id: string;
  from: string;
  phoneNumberId: string;
  name: string | null;
  type: "texto" | "imagen" | "documento" | "audio" | "otro";
  text: string | null;
  mediaId: string | null;
  mime: string | null;
  filename: string | null;
  raw: unknown;
}
interface StatusUpdate {
  id: string;
  status: "enviado" | "entregado" | "leido" | "fallido";
  error: string | null;
}

const STATUS: Record<string, StatusUpdate["status"]> = { sent: "enviado", delivered: "entregado", read: "leido", failed: "fallido" };

/** Desarma el webhook de Meta en mensajes entrantes y acuses */
export function parseWebhook(body: unknown) {
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];
  const entries = (body as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] })?.entry ?? [];
  for (const e of entries)
    for (const c of e.changes ?? []) {
      const v = (c.value ?? {}) as {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: Record<string, unknown>[];
        statuses?: { id?: string; status?: string; errors?: { title?: string; message?: string }[] }[];
      };
      const pnid = String(v.metadata?.phone_number_id ?? "");
      for (const m of v.messages ?? []) {
        const type = String(m.type ?? "");
        const media = (type === "image" ? m.image : type === "document" ? m.document : type === "audio" ? m.audio : null) as { id?: string; mime_type?: string; filename?: string; caption?: string } | null;
        const from = String(m.from ?? "");
        messages.push({
          id: String(m.id ?? ""),
          from,
          phoneNumberId: pnid,
          name: v.contacts?.find((x) => x.wa_id === from)?.profile?.name ?? null,
          type: type === "text" ? "texto" : type === "image" ? "imagen" : type === "document" ? "documento" : type === "audio" ? "audio" : "otro",
          text: type === "text" ? String((m.text as { body?: string })?.body ?? "") : (media?.caption ?? null),
          mediaId: media?.id ?? null,
          mime: media?.mime_type ?? null,
          filename: media?.filename ?? null,
          raw: m,
        });
      }
      for (const s of v.statuses ?? []) if (s.id && s.status && STATUS[s.status]) statuses.push({ id: s.id, status: STATUS[s.status], error: s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? null });
    }
  return { messages: messages.filter((m) => m.id && m.from), statuses };
}

/** Cantidad de parámetros {{n}} de una plantilla */
export const paramCount = (body: string) => new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;

/** Texto final de una plantilla con sus parámetros (para el registro) */
export const renderTemplate = (body: string, params: string[]) => body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");

/** Orden de los estados de un mensaje saliente (un acuse viejo no pisa uno nuevo) */
const RANK = { enviado: 1, entregado: 2, leido: 3, fallido: 4 } as const;
export const advances = (from: string, to: StatusUpdate["status"]) => (RANK[to] ?? 0) > (RANK[from as keyof typeof RANK] ?? 0);
