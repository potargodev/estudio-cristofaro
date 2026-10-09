import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ALLOWED_LABEL } from "./uploads-shared";

// Archivos de clientes en disco. El directorio NO se sirve en forma pública:
// solo se descarga por /api/archivos/[id], que verifica permisos.
// En Easypanel UPLOADS_DIR es un volumen montado en /data/uploads.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED: Record<string, { mime: string; magic: (b: Buffer) => boolean }> = {
  ".pdf": {
    mime: "application/pdf",
    magic: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
  },
  ".jpg": {
    mime: "image/jpeg",
    magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  ".jpeg": {
    mime: "image/jpeg",
    magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  ".png": {
    mime: "image/png",
    magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  ".xlsx": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // XLSX es un ZIP
    magic: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
};

export function uploadsDir() {
  return path.resolve(process.env.UPLOADS_DIR?.trim() || "/data/uploads");
}

/** Ruta absoluta de un archivo guardado, verificando que no salga de UPLOADS_DIR. */
function resolveStored(storagePath: string) {
  const root = uploadsDir();
  const full = path.resolve(root, storagePath);
  if (!full.startsWith(root + path.sep)) throw new Error("Ruta de archivo inválida");
  return full;
}

export type UploadCheck = { ok: true } | { ok: false; error: string };

/** Valida un archivo de un formulario: tipo permitido (extensión y contenido) y tamaño. */
export async function checkUpload(file: File): Promise<UploadCheck> {
  if (file.size === 0) return { ok: false, error: "El archivo está vacío." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "El archivo supera los 10 MB." };
  const ext = path.extname(file.name).toLowerCase();
  const rule = ALLOWED[ext];
  if (!rule)
    return {
      ok: false,
      error: `Formato no permitido. Subí un ${ALLOWED_LABEL}.`,
    };
  const head = Buffer.from(await file.slice(0, 8).arrayBuffer());
  if (!rule.magic(head))
    return {
      ok: false,
      error: "El contenido del archivo no coincide con su extensión.",
    };
  return { ok: true };
}

/** El input file vacío llega como un File sin nombre ni tamaño. */
export function fileFromForm(fd: FormData, key: string): File | null {
  const v = fd.get(key);
  return v instanceof File && v.size > 0 && v.name ? v : null;
}

export interface StoredFile {
  name: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Guarda el archivo con un nombre aleatorio en <UPLOADS_DIR>/<estudio>/<organización>/.
 * El nombre original se guarda solo en la base. Llamar antes a checkUpload().
 */
export async function storeUpload(file: File, studioId: string, organizationId: string): Promise<StoredFile> {
  const ext = path.extname(file.name).toLowerCase();
  const rule = ALLOWED[ext];
  if (!rule) throw new Error("Formato no permitido");
  const storagePath = path.join(studioId, organizationId, `${randomUUID()}${ext}`);
  const full = resolveStored(storagePath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
  // Nombre original sin rutas ni caracteres de control
  const name =
    path
      .basename(file.name)
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .slice(0, 200) || `archivo${ext}`;
  return { name, storagePath, mimeType: rule.mime, sizeBytes: file.size };
}

export async function readStored(storagePath: string) {
  const full = resolveStored(storagePath);
  const [data, info] = await Promise.all([readFile(full), stat(full)]);
  return { data, size: info.size };
}

export async function deleteStored(storagePath: string) {
  await rm(resolveStored(storagePath), { force: true });
}

export { ACCEPT_ATTR, ALLOWED_LABEL, formatBytes } from "./uploads-shared";
