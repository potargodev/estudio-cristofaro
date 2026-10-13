import "server-only";
import { upsertMirror } from "@/modules/adapters/mirror";
import { digitsCuit, endLog, readCredentials, startLog, type Connection, type ExternalRow } from "../store";
import { isSimClient, simClientId } from "@/modules/simuladores/conectores";
import { contabilium, ContabiliumError, type CbComprobante, type ContabiliumCredentials } from "./client";

// Sincronización de Contabilium → espejo del núcleo (A0). Clientes,
// comprobantes de venta y compras, con su registro original. Una cuenta de
// Contabilium es de una organización: todo lo que trae es de ella.

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function credsOf(conn: Connection): ContabiliumCredentials | null {
  const c = readCredentials<{ client_id: string; client_secret: string }>(conn);
  // La cuenta simulada (Parte C) es la del propio espacio: nunca la de otro
  if (c.client_id && isSimClient(c.client_id) && c.client_id !== simClientId(conn.studio_id)) return null;
  return c.client_id && c.client_secret ? { client_id: c.client_id, client_secret: c.client_secret } : null;
}

const docName = (v: CbComprobante) => `${v.Tipo} ${String(v.PuntoVenta).padStart(5, "0")}-${String(v.Numero).padStart(8, "0")} · ${v.RazonSocial}`;

/** Lo que trae de Contabilium, en el formato del espejo */
export async function contabiliumRows(conn: Connection, creds: ContabiliumCredentials, days: number): Promise<ExternalRow[]> {
  const hasta = iso(new Date());
  const desde = iso(new Date(Date.now() - days * 86400000));
  const [clientes, ventas, compras] = await Promise.all([contabilium.clientes(creds), contabilium.ventas(creds, desde, hasta), contabilium.compras(creds, desde, hasta)]);
  const org = conn.organization_id ? { organizationId: conn.organization_id } : {};
  return [
    ...clientes.map((c) => ({ resource: "clientes", externalId: String(c.Id), cuit: digitsCuit(c.NroDoc), name: c.RazonSocial, raw: c, ...org, ...(conn.organization_id ? { validation: "sin_cruzar" as const } : {}) })),
    ...ventas.map((v) => ({ resource: "comprobantes_venta", externalId: String(v.Id), cuit: digitsCuit(v.NroDoc), name: docName(v), date: v.FechaEmision, amount: v.ImporteTotal, raw: v, ...org })),
    ...compras.map((v) => ({ resource: "comprobantes_compra", externalId: String(v.Id), cuit: digitsCuit(v.NroDoc), name: docName(v), date: v.FechaEmision, amount: v.ImporteTotal, raw: v, ...org })),
  ];
}

export async function testContabilium(conn: Connection, actorId: string) {
  const log = await startLog(conn.id, "test", actorId);
  const creds = credsOf(conn);
  if (!creds) {
    await endLog(log, conn.id, false, "Faltan el Client ID o el Client Secret.");
    return { ok: false, message: "Faltan el Client ID o el Client Secret." };
  }
  try {
    const clientes = await contabilium.clientes(creds);
    const message = `Conexión correcta: Contabilium devolvió ${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}.`;
    await endLog(log, conn.id, true, message);
    return { ok: true, message };
  } catch (error) {
    const message = error instanceof ContabiliumError ? error.message : "No se pudo conectar con Contabilium.";
    await endLog(log, conn.id, false, message);
    return { ok: false, message };
  }
}

export async function syncContabilium(conn: Connection, actorId: string | null, days = 90) {
  const log = await startLog(conn.id, "sync", actorId);
  const creds = credsOf(conn);
  if (!creds) {
    await endLog(log, conn.id, false, "Faltan el Client ID o el Client Secret.");
    return { ok: false, message: "Faltan el Client ID o el Client Secret.", records: 0, conflicts: 0 };
  }
  try {
    const rows = await contabiliumRows(conn, creds, days);
    const r = await upsertMirror(conn, "contabilium", rows);
    const message = `Sincronizado: ${r.saved} ${r.saved === 1 ? "registro" : "registros"} de Contabilium (últimos ${days} días)${r.conflicts ? `; ${r.conflicts} ${r.conflicts === 1 ? "conflicto" : "conflictos"} para revisar` : ""}.`;
    await endLog(log, conn.id, true, message, r.saved);
    return { ok: true, message, records: r.saved, conflicts: r.conflicts };
  } catch (error) {
    const message = error instanceof ContabiliumError ? error.message : "Error al sincronizar Contabilium.";
    if (!(error instanceof ContabiliumError)) console.error("[contabilium] sync", error);
    await endLog(log, conn.id, false, message);
    return { ok: false, message, records: 0, conflicts: 0 };
  }
}
