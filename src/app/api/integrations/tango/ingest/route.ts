import { connectorMessage, connectorSource } from "@/lib/integrations/tango/connector-source";
import {
  KEY_HEADER,
  MAX_BODY_BYTES,
  MAX_CLOCK_SKEW_MS,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/integrations/tango/constants";
import { safeEqualHex, signBody } from "@/lib/integrations/tango/keys";
import { endSync, findIntegrationByKey, recordPing, saveBatches, startSync } from "@/lib/integrations/tango/store";

export const dynamic = "force-dynamic";

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Recibe los datos del conector local de Tango.
 * Headers: X-Connector-Key (clave del conector), X-Timestamp (ms desde 1970) y
 * X-Signature = HMAC-SHA256(clave, "<timestamp>.<cuerpo>") en hex.
 * Rechaza timestamps con más de 5 minutos de diferencia y firmas inválidas.
 */
export async function POST(request: Request) {
  const key = request.headers.get(KEY_HEADER)?.trim();
  const timestamp = request.headers.get(TIMESTAMP_HEADER)?.trim();
  const signature = request.headers.get(SIGNATURE_HEADER)?.trim().toLowerCase();
  if (!key || !timestamp || !signature) return fail(401, "Faltan los headers de autenticación del conector.");

  const ts = Number(timestamp);
  if (!/^\d{10,16}$/.test(timestamp) || !Number.isFinite(ts)) return fail(401, "Timestamp inválido.");
  if (Math.abs(Date.now() - ts) > MAX_CLOCK_SKEW_MS) {
    return fail(401, "El timestamp tiene más de 5 minutos de diferencia. Revisá la hora de la PC del conector.");
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return fail(413, "El lote es demasiado grande.");
  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) return fail(413, "El lote es demasiado grande.");

  const integration = await findIntegrationByKey(key);
  if (!integration) return fail(401, "La clave del conector no es válida. Generá una nueva en /admin/integraciones.");
  if (!/^[0-9a-f]{64}$/.test(signature) || !safeEqualHex(signBody(key, timestamp, body), signature)) {
    return fail(401, "La firma no es válida.");
  }
  if (integration.status !== "activa") return fail(403, "La integración con Tango está pausada en la plataforma.");

  let parsed;
  try {
    parsed = connectorMessage.safeParse(JSON.parse(body));
  } catch {
    return fail(400, "El cuerpo no es JSON válido.");
  }
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(400, `Mensaje con formato inválido${issue?.path.length ? ` (campo ${issue.path.join(".")})` : ""}.`);
  }
  const message = parsed.data;

  try {
    switch (message.kind) {
      case "ping":
        await recordPing(integration, message.companies);
        return Response.json({ ok: true, message: "Conexión con la plataforma correcta." });
      case "sync_start":
        await startSync(integration, message.syncId, message.companies);
        return Response.json({ ok: true });
      case "records": {
        const saved = await saveBatches(integration, message.syncId, await connectorSource.toBatches(message));
        return Response.json({ ok: true, saved });
      }
      case "sync_end": {
        const row = await endSync(integration, message.syncId, message.ok, message.message);
        return Response.json({ ok: true, records: row?.records ?? 0 });
      }
    }
  } catch (error) {
    console.error("[tango] Error al procesar el ingest", error);
    return fail(500, "Error interno al guardar los datos. Se puede reintentar.");
  }
}
