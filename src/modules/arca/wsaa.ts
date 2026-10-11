import "server-only";
import { and, eq, gt } from "drizzle-orm";
import forge from "node-forge";
import { XMLParser } from "fast-xml-parser";
import { getDb } from "@/db";
import { arca_tickets } from "@/db/schema";
import { arcaUrls, type ArcaEnv, type ArcaService } from "./config";
import { ArcaError, soapCall } from "./soap";

// WSAA: ticket de acceso (TA) firmado con el certificado de la CUIT operadora.
// El TRA se firma como CMS (PKCS#7 SignedData) con la clave privada; el TA
// dura ~12 h y se reusa hasta 5 minutos antes de vencer (ARCA rechaza pedir
// otro mientras haya uno vigente).

export interface ArcaCredential {
  env: ArcaEnv;
  cuit: string;
  certPem: string;
  keyPem: string;
}

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "-00:00").replace("Z", "-00:00");

/** Ticket de requerimiento de acceso (TRA) */
export function buildTra(service: string, now = new Date()) {
  const gen = new Date(now.getTime() - 10 * 60_000);
  const exp = new Date(now.getTime() + 10 * 60_000);
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId><generationTime>${iso(gen)}</generationTime><expirationTime>${iso(exp)}</expirationTime></header><service>${service}</service></loginTicketRequest>`;
}

/** Firma CMS del TRA (base64, sin cabeceras) */
export function signTra(tra: string, certPem: string, keyPem: string) {
  let cert: forge.pki.Certificate;
  let key: forge.pki.PrivateKey;
  try {
    cert = forge.pki.certificateFromPem(certPem);
    key = forge.pki.privateKeyFromPem(keyPem);
  } catch {
    throw new ArcaError("El certificado o la clave privada no son válidos (tienen que estar en formato PEM).", "certificado");
  }
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

/** Datos del certificado (para mostrar y validar en el Faro Manager) */
export function certInfo(certPem: string) {
  const c = forge.pki.certificateFromPem(certPem);
  const cn = c.subject.getField("CN")?.value as string | undefined;
  const serial = (c.subject.getField({ name: "serialName" }) ?? c.subject.attributes.find((a) => a.type === "2.5.4.5"))?.value as string | undefined;
  return { subject: cn ?? "", serialNumber: serial ?? "", notBefore: c.validity.notBefore, notAfter: c.validity.notAfter };
}

/** ¿La clave privada corresponde al certificado? */
export function keyMatchesCert(certPem: string, keyPem: string) {
  try {
    const cert = forge.pki.certificateFromPem(certPem);
    const key = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
    const pub = cert.publicKey as forge.pki.rsa.PublicKey;
    return pub.n.equals(key.n) && pub.e.equals(key.e);
  } catch {
    return false;
  }
}

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

/** Token y sign para un servicio (del caché si sigue vigente) */
export async function getTicket(cred: ArcaCredential, service: ArcaService): Promise<{ token: string; sign: string }> {
  const db = getDb();
  const soon = new Date(Date.now() + 5 * 60_000);
  const [cached] = await db
    .select()
    .from(arca_tickets)
    .where(and(eq(arca_tickets.environment, cred.env), eq(arca_tickets.service, service), eq(arca_tickets.cuit, cred.cuit), gt(arca_tickets.expires_at, soon)));
  if (cached) return { token: cached.token, sign: cached.sign };

  const cms = signTra(buildTra(service), cred.certPem, cred.keyPem);
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;
  const { body, raw } = await soapCall(arcaUrls(cred.env).wsaa, "", envelope);
  const ret = (body.loginCmsResponse as { loginCmsReturn?: string } | undefined)?.loginCmsReturn;
  if (!ret) throw new ArcaError("El WSAA no devolvió el ticket de acceso.", "wsaa", raw);
  const ta = parser.parse(ret) as { loginTicketResponse?: { header?: { expirationTime?: string }; credentials?: { token?: string; sign?: string } } };
  const token = ta.loginTicketResponse?.credentials?.token;
  const sign = ta.loginTicketResponse?.credentials?.sign;
  const exp = ta.loginTicketResponse?.header?.expirationTime;
  if (!token || !sign || !exp) throw new ArcaError("Ticket de acceso incompleto.", "wsaa", raw);
  await db
    .insert(arca_tickets)
    .values({ environment: cred.env, service, cuit: cred.cuit, token, sign, expires_at: new Date(exp) })
    .onConflictDoUpdate({ target: [arca_tickets.environment, arca_tickets.service, arca_tickets.cuit], set: { token, sign, expires_at: new Date(exp), created_at: new Date() } });
  return { token, sign };
}
