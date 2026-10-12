import "server-only";
import { readSheet } from "read-excel-file/node";

// Texto de un archivo para la IA (herramienta leer_documento y adjuntos del
// Asistente). Es una lectura básica: texto plano, CSV, planillas XLSX y PDF con
// texto embebido. Las imágenes y los PDF escaneados quedan para la lectura
// inteligente.

const MAX_TEXT_CHARS = 40_000;

type Extracted = { ok: true; text: string; truncated: boolean } | { ok: false; reason: string };

function done(text: string): Extracted {
  const clean = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return { ok: false, reason: "El archivo no tiene texto legible (puede ser un escaneo: la lectura inteligente llega más adelante)." };
  return { ok: true, text: clean.slice(0, MAX_TEXT_CHARS), truncated: clean.length > MAX_TEXT_CHARS };
}

/**
 * Texto de un PDF con texto embebido, página por página (unpdf / pdf.js).
 * Un PDF escaneado devuelve páginas vacías: eso queda para la lectura inteligente.
 */
export async function pdfPages(data: Uint8Array | Buffer): Promise<string[]> {
  const { extractText: pdfExtract, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await pdfExtract(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}

export async function extractText(buf: Buffer, name: string, mime?: string | null): Promise<Extracted> {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  try {
    if (["txt", "csv", "md", "json", "xml", "html", "tsv"].includes(ext) || mime?.startsWith("text/")) return done(buf.toString("utf8"));
    if (ext === "xlsx") {
      const rows = (await readSheet(buf)) as unknown[][];
      return done(rows.map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))).join(" | ")).join("\n"));
    }
    if (ext === "pdf") return done((await pdfPages(buf)).join("\n"));
    if (["jpg", "jpeg", "png"].includes(ext)) return { ok: false, reason: "Es una imagen: la lectura de imágenes llega con la lectura inteligente." };
    return { ok: false, reason: "Formato sin lectura de texto." };
  } catch (error) {
    console.error("[extract] No se pudo leer", name, error);
    return { ok: false, reason: "No se pudo leer el archivo." };
  }
}
