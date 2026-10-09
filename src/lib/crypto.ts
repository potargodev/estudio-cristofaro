import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Cifrado simétrico AES-256-GCM para secretos guardados en la base (tokens de
// Google Calendar). La clave sale de ENCRYPTION_KEY (generarla con
// `openssl rand -base64 32`). Formato: v1:<iv>:<tag>:<datos>, todo en base64url.

function key() {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw || raw.length < 32) throw new Error("Falta ENCRYPTION_KEY (al menos 32 caracteres; generala con: openssl rand -base64 32)");
  return createHash("sha256").update(raw).digest();
}

export const encryptionEnabled = () => (process.env.ENCRYPTION_KEY?.trim().length ?? 0) >= 32;

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function decrypt(value: string): string {
  const [v, iv, tag, data] = value.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Valor cifrado inválido");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
