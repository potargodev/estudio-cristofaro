import "server-only";
import { XMLParser } from "fast-xml-parser";

// Llamadas SOAP a ARCA: sobre XML, timeout y errores legibles. La respuesta
// se devuelve parseada y también en crudo (se guarda como registro original).

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });

export class ArcaError extends Error {
  constructor(
    message: string,
    public code?: string,
    public raw?: string,
  ) {
    super(message);
  }
}

export const xmlEscape = (s: string | number) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Convierte un objeto plano en XML (para los cuerpos de WSFE) */
export function toXml(obj: unknown, ns = "ar"): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object") return xmlEscape(obj as string);
  return Object.entries(obj as Record<string, unknown>)
    .map(([k, v]) => (Array.isArray(v) ? v.map((x) => `<${ns}:${k}>${toXml(x, ns)}</${ns}:${k}>`).join("") : v === undefined ? "" : `<${ns}:${k}>${toXml(v, ns)}</${ns}:${k}>`))
    .join("");
}

export async function soapCall(url: string, action: string, envelope: string, timeoutMs = 25_000) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: action },
      body: envelope,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new ArcaError(`ARCA no respondió (${(e as Error).name === "TimeoutError" ? "tiempo de espera agotado" : (e as Error).message}). Probá de nuevo en unos minutos.`, "red");
  }
  const raw = await res.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(raw) as Record<string, unknown>;
  } catch {
    throw new ArcaError(`Respuesta inválida de ARCA (HTTP ${res.status}).`, "xml", raw);
  }
  const body = ((parsed.Envelope as Record<string, unknown> | undefined)?.Body ?? {}) as Record<string, unknown>;
  const fault = body.Fault as { faultcode?: string; faultstring?: string } | undefined;
  if (fault) throw new ArcaError(String(fault.faultstring ?? "Error de ARCA"), String(fault.faultcode ?? "fault"), raw);
  if (!res.ok) throw new ArcaError(`ARCA respondió HTTP ${res.status}.`, String(res.status), raw);
  return { body, raw };
}

/** Siempre un array (fast-xml-parser devuelve objeto si hay un solo elemento) */
export const arr = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
