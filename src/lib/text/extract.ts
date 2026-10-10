import "server-only";
import { inflateSync } from "node:zlib";
import { readSheet } from "read-excel-file/node";

// Texto de un archivo para la IA (herramienta leer_documento y adjuntos del
// Asistente). Es una lectura básica: texto plano, CSV, planillas XLSX y PDF con
// texto embebido. Las imágenes y los PDF escaneados quedan para la lectura
// inteligente (F5).

export const MAX_TEXT_CHARS = 40_000;

export type Extracted = { ok: true; text: string; truncated: boolean } | { ok: false; reason: string };

function done(text: string): Extracted {
  const clean = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return { ok: false, reason: "El archivo no tiene texto legible (puede ser un escaneo: la lectura inteligente llega en la F5)." };
  return { ok: true, text: clean.slice(0, MAX_TEXT_CHARS), truncated: clean.length > MAX_TEXT_CHARS };
}

/** Decodifica un string literal de PDF: (texto con \( \) \\ y octales) */
function pdfString(s: string) {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c: string) => {
    if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8));
    return ({ n: "\n", r: "", t: "\t", b: "", f: "" } as Record<string, string>)[c] ?? c;
  });
}

/** Texto de los operadores Tj / TJ de cada stream de contenido (con o sin FlateDecode) */
export function pdfText(buf: Buffer): string {
  const src = buf.toString("latin1");
  const out: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    const end = src.indexOf("endstream", start);
    if (end < 0) break;
    const raw = buf.subarray(start, end);
    let content: string;
    try {
      content = inflateSync(raw).toString("latin1");
    } catch {
      content = raw.toString("latin1");
    }
    if (!/\bBT\b/.test(content)) continue;
    for (const block of content.split(/\bET\b/)) {
      const parts: string[] = [];
      for (const t of block.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj|\[(?:[^\]]*)\]\s*TJ|T\*|\bTd\b|\bTD\b/g)) {
        const tok = t[0];
        if (tok.endsWith("Tj")) parts.push(pdfString(tok.slice(1, tok.lastIndexOf(")"))));
        else if (tok.endsWith("TJ")) {
          for (const s of tok.matchAll(/\((?:\\.|[^\\)])*\)/g)) parts.push(pdfString(s[0].slice(1, -1)));
        } else parts.push("\n");
      }
      if (parts.length) out.push(parts.join("").replace(/\n+/g, "\n"));
    }
    re.lastIndex = end;
  }
  return out.join("\n");
}

export async function extractText(buf: Buffer, name: string, mime?: string | null): Promise<Extracted> {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  try {
    if (["txt", "csv", "md", "json", "xml", "html", "tsv"].includes(ext) || mime?.startsWith("text/")) return done(buf.toString("utf8"));
    if (ext === "xlsx") {
      const rows = (await readSheet(buf)) as unknown[][];
      return done(rows.map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))).join(" | ")).join("\n"));
    }
    if (ext === "pdf") return done(pdfText(buf));
    if (["jpg", "jpeg", "png"].includes(ext)) return { ok: false, reason: "Es una imagen: la lectura de imágenes llega con la lectura inteligente (F5)." };
    return { ok: false, reason: "Formato sin lectura de texto." };
  } catch (error) {
    console.error("[extract] No se pudo leer", name, error);
    return { ok: false, reason: "No se pudo leer el archivo." };
  }
}
