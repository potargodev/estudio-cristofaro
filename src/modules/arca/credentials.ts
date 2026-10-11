import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { arca_credentials, faro_settings } from "@/db/schema";
import { decrypt, encrypt, encryptionEnabled } from "@/lib/crypto";
import type { ArcaEnv } from "./config";
import { ArcaError } from "./soap";
import { certInfo, keyMatchesCert, type ArcaCredential } from "./wsaa";

// Credenciales de la CUIT que opera Faro (las carga el Faro Manager). Se
// guardan cifradas con ENCRYPTION_KEY y nunca salen del servidor.

const ENV_KEY = "arca.environment";

export async function activeEnv(): Promise<ArcaEnv> {
  const [r] = await getDb().select({ v: faro_settings.value }).from(faro_settings).where(eq(faro_settings.key, ENV_KEY));
  return r?.v === "produccion" ? "produccion" : "homologacion";
}

export async function setActiveEnv(env: ArcaEnv, userId: string) {
  await getDb()
    .insert(faro_settings)
    .values({ key: ENV_KEY, value: env, updated_by: userId })
    .onConflictDoUpdate({ target: faro_settings.key, set: { value: env, updated_by: userId } });
}

/** Resumen sin secretos (Faro Manager) */
export async function credentialSummary() {
  const rows = await getDb()
    .select({ environment: arca_credentials.environment, cuit: arca_credentials.cuit, subject: arca_credentials.cert_subject, notAfter: arca_credentials.cert_not_after, lastTestAt: arca_credentials.last_test_at, lastTestOk: arca_credentials.last_test_ok, lastTestDetail: arca_credentials.last_test_detail, updatedAt: arca_credentials.updated_at })
    .from(arca_credentials);
  return rows;
}

export async function saveCredential(env: ArcaEnv, cuit: string, certPem: string, keyPem: string, userId: string) {
  if (!encryptionEnabled()) throw new ArcaError("Falta ENCRYPTION_KEY en el servidor: sin eso no se guardan certificados.");
  if (!/^\d{11}$/.test(cuit)) throw new ArcaError("La CUIT tiene que tener 11 números.");
  let info: ReturnType<typeof certInfo>;
  try {
    info = certInfo(certPem);
  } catch {
    throw new ArcaError("El certificado no es un PEM válido (tiene que empezar con -----BEGIN CERTIFICATE-----).");
  }
  if (!keyMatchesCert(certPem, keyPem)) throw new ArcaError("La clave privada no corresponde a este certificado.");
  if (info.notAfter < new Date()) throw new ArcaError(`El certificado venció el ${info.notAfter.toISOString().slice(0, 10)}.`);
  const values = { environment: env, cuit, cert_enc: encrypt(certPem), key_enc: encrypt(keyPem), cert_subject: info.subject, cert_not_after: info.notAfter, updated_by: userId, last_test_at: null, last_test_ok: null, last_test_detail: null };
  await getDb().insert(arca_credentials).values(values).onConflictDoUpdate({ target: arca_credentials.environment, set: values });
  return info;
}

export async function deleteCredential(env: ArcaEnv) {
  await getDb().delete(arca_credentials).where(eq(arca_credentials.environment, env));
}

/** Credencial del ambiente activo (o del pedido) lista para el WSAA */
export async function loadCredential(env?: ArcaEnv): Promise<ArcaCredential> {
  const e = env ?? (await activeEnv());
  const [r] = await getDb().select().from(arca_credentials).where(eq(arca_credentials.environment, e));
  if (!r) throw new ArcaError(`ARCA todavía no está configurado en ${e === "produccion" ? "producción" : "homologación"}: falta cargar el certificado de Faro en el Faro Manager.`, "sin_credencial");
  return { env: e, cuit: r.cuit, certPem: decrypt(r.cert_enc), keyPem: decrypt(r.key_enc) };
}

export async function recordTest(env: ArcaEnv, ok: boolean, detail: string) {
  await getDb().update(arca_credentials).set({ last_test_at: new Date(), last_test_ok: ok, last_test_detail: detail.slice(0, 500) }).where(eq(arca_credentials.environment, env));
}
