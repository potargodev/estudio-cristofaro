import { createHmac } from "node:crypto";
import { fetchWithRetry } from "./http.mjs";

// Envío a la plataforma: POST /api/integrations/tango/ingest con
// X-Connector-Key, X-Timestamp y X-Signature = HMAC-SHA256(clave, "<timestamp>.<cuerpo>").

export class PlatformAuthError extends Error {}

export const CONNECTOR_VERSION = "1.0.0";

export class Platform {
  constructor(config) {
    this.config = config;
  }

  async send(message) {
    const body = JSON.stringify(message);
    const url = `${this.config.platformUrl}/api/integrations/tango/ingest`;
    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        // El timestamp y la firma se recalculan en cada intento (dentro de fetchWithRetry no se puede),
        // así que los reintentos de red usan la misma firma: alcanza porque la ventana es de 5 minutos.
        headers: this.signedHeaders(body),
        body,
      },
      { label: "Plataforma" },
    );
    let data = {};
    try {
      data = await res.json();
    } catch {
      // respuesta sin JSON
    }
    if (res.status === 401 || res.status === 403) throw new PlatformAuthError(`La plataforma rechazó el envío: ${data.error ?? res.status}`);
    if (!res.ok) throw new Error(`La plataforma respondió ${res.status}: ${data.error ?? "sin detalle"}`);
    return data;
  }

  signedHeaders(body) {
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", this.config.connectorKey).update(`${timestamp}.${body}`, "utf8").digest("hex");
    return {
      "Content-Type": "application/json",
      "X-Connector-Key": this.config.connectorKey,
      "X-Timestamp": timestamp,
      "X-Signature": signature,
      "User-Agent": `conector-tango-cristofaro/${CONNECTOR_VERSION}`,
    };
  }
}
