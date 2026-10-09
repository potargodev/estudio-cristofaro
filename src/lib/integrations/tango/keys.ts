import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Clave nueva del conector: se muestra una sola vez y en la base queda solo el hash. */
export function generateConnectorKey() {
  const key = `ectango_${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashConnectorKey(key), prefix: key.slice(0, 14) };
}

export function hashConnectorKey(key: string) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/**
 * Firma del cuerpo: HMAC-SHA256 con la clave del conector sobre
 * "<timestamp>.<cuerpo>". El servidor recibe la clave en el header, verifica su
 * hash contra la base y con esa misma clave verifica la firma.
 */
export function signBody(key: string, timestamp: string, body: string) {
  return createHmac("sha256", key).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

export function safeEqualHex(a: string, b: string) {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}
