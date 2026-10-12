import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readStored, uploadsDir } from "@/lib/uploads";

// Archivos del Vigía (audio, foto o captura y PDF): en UPLOADS_DIR, con
// nombre aleatorio, y se sirven solo por /api/copiloto/archivo/<mensaje>,
// que verifica que el mensaje sea del usuario de la sesión.

const COPILOT_MAX_BYTES = 12 * 1024 * 1024;

type Kind = "audio" | "imagen" | "pdf";
const RULES: { mime: RegExp; ext: string; kind: Kind; magic: (b: Buffer) => boolean }[] = [
  { mime: /^image\/jpe?g$/, ext: ".jpg", kind: "imagen", magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  { mime: /^image\/png$/, ext: ".png", kind: "imagen", magic: (b) => b[0] === 0x89 && b[1] === 0x50 },
  { mime: /^image\/webp$/, ext: ".webp", kind: "imagen", magic: (b) => b.subarray(8, 12).toString() === "WEBP" },
  { mime: /^image\/(heic|heif)$/, ext: ".heic", kind: "imagen", magic: (b) => b.subarray(4, 8).toString() === "ftyp" },
  { mime: /^application\/pdf$/, ext: ".pdf", kind: "pdf", magic: (b) => b.subarray(0, 4).toString() === "%PDF" },
  { mime: /^audio\/webm/, ext: ".webm", kind: "audio", magic: (b) => b[0] === 0x1a && b[1] === 0x45 },
  { mime: /^audio\/ogg/, ext: ".ogg", kind: "audio", magic: (b) => b.subarray(0, 4).toString() === "OggS" },
  { mime: /^audio\/(mp4|m4a|x-m4a|aac)/, ext: ".m4a", kind: "audio", magic: (b) => b.subarray(4, 8).toString() === "ftyp" || (b[0] === 0xff && (b[1] & 0xf0) === 0xf0) },
  { mime: /^audio\/(mpeg|mp3)/, ext: ".mp3", kind: "audio", magic: (b) => b.subarray(0, 3).toString() === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  { mime: /^audio\/(wav|x-wav|wave)/, ext: ".wav", kind: "audio", magic: (b) => b.subarray(0, 4).toString() === "RIFF" },
];

type CopilotFile = { kind: Kind; path: string; name: string; mime: string; data: Buffer };

/** Valida tipo (por el contenido, no solo la extensión) y tamaño, y lo guarda */
export async function storeCopilotFile(userId: string, file: File): Promise<CopilotFile | { error: string }> {
  if (file.size === 0) return { error: "El archivo está vacío." };
  if (file.size > COPILOT_MAX_BYTES) return { error: "El archivo supera los 12 MB." };
  const mime = (file.type || "").toLowerCase().split(";")[0].trim();
  const data = Buffer.from(await file.arrayBuffer());
  const rule = RULES.find((r) => r.mime.test(mime) && r.magic(data));
  if (!rule) return { error: "Mandame un audio, una foto (JPG, PNG, WEBP o HEIC) o un PDF." };
  const rel = path.join("copiloto", userId, `${randomUUID()}${rule.ext}`);
  const root = uploadsDir();
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep)) return { error: "Ruta inválida." };
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data, { flag: "wx" });
  const name = path.basename(file.name || `archivo${rule.ext}`).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120) || `archivo${rule.ext}`;
  return { kind: rule.kind, path: rel, name, mime: mime === "audio/x-m4a" ? "audio/mp4" : mime, data };
}

export async function readCopilotFile(p: string) {
  return (await readStored(p)).data;
}
