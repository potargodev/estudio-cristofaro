// Utilidades de las pruebas de la F2 (solo desarrollo).
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

export const BASE = process.env.FARO_URL ?? "http://localhost:3000";
export const data = () => JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));

/** Mismo formato que src/lib/crypto.ts */
export function encrypt(plain) {
  const key = createHash("sha256").update(process.env.ENCRYPTION_KEY.trim()).digest();
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const d = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), d.toString("base64url")].join(":");
}

/** Manda un mensaje al Asistente y devuelve los eventos del stream (UI message stream) */
export async function chat(cookie, { id = randomUUID(), text, context = [], model, metadata = {} }) {
  const res = await fetch(`${BASE}/api/asistente`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ id, model, message: { id: randomUUID(), role: "user", parts: [{ type: "text", text }], metadata: { context, ...metadata } } }),
  });
  const raw = await res.text();
  const events = raw
    .split("\n")
    .filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
    .map((l) => JSON.parse(l.slice(6)));
  const textOut = events.filter((e) => e.type === "text-delta").map((e) => e.delta).join("");
  const tools = events.filter((e) => e.type === "tool-output-available" || e.type === "tool-input-available");
  return { status: res.status, id, raw: res.ok ? null : raw, events, text: textOut, tools };
}

export let failures = 0;
export function check(label, ok, extra = "") {
  if (!ok) failures++;
  console.log(`${ok ? "✔" : "✘"} ${label}${extra ? ` · ${extra}` : ""}`);
}
