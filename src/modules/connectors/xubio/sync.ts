import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connections, legal_entities } from "@/db/schema";
import { digitsCuit, endLog, readCredentials, startLog, upsertExternal, type Connection, type ExternalRow } from "../store";
import { xubio, XubioError, type XubioCredentials } from "./client";

// Sincronización de Xubio → registros externos.
// - Cuenta del estudio (sin organización): los clientes de Xubio se cruzan por
//   CUIT con las razones sociales; los comprobantes de venta heredan la
//   organización de su cliente y los de compra la de su proveedor.
// - Cuenta de una organización: todo lo que trae es de esa organización; la
//   CUIT de "Mi empresa" se valida contra sus razones sociales.

const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : null);

export function credsOf(conn: Connection): XubioCredentials | null {
  const c = readCredentials<{ client_id: string; client_secret: string }>(conn);
  return c.client_id && c.client_secret ? { client_id: c.client_id, client_secret: c.client_secret } : null;
}

export async function testXubio(conn: Connection, actorId: string) {
  const log = await startLog(conn.id, "test", actorId);
  const creds = credsOf(conn);
  if (!creds) {
    await endLog(log, conn.id, false, "Faltan el Client ID o el Secret ID.");
    return { ok: false, message: "Faltan el Client ID o el Secret ID." };
  }
  try {
    const me = await xubio.miEmpresa(creds);
    const message = `Conexión correcta con ${me?.nombreEmpresa ?? "la empresa de Xubio"}${me?.cuit ? ` (CUIT ${me.cuit})` : ""}.`;
    await getDb()
      .update(connections)
      .set({ settings: { ...conn.settings, empresa: me?.nombreEmpresa ?? null, empresa_cuit: digitsCuit(me?.cuit) } })
      .where(eq(connections.id, conn.id));
    await endLog(log, conn.id, true, message);
    return { ok: true, message };
  } catch (error) {
    const message = error instanceof XubioError ? error.message : "No se pudo conectar con Xubio.";
    await endLog(log, conn.id, false, message);
    return { ok: false, message };
  }
}

export async function syncXubio(conn: Connection, actorId: string, days = 90) {
  const log = await startLog(conn.id, "sync", actorId);
  const creds = credsOf(conn);
  if (!creds) {
    await endLog(log, conn.id, false, "Faltan el Client ID o el Secret ID.");
    return { ok: false, message: "Faltan el Client ID o el Secret ID.", records: 0 };
  }
  try {
    const hasta = new Date();
    const desde = new Date(Date.now() - days * 86400000);
    const [me, clientes, proveedores, ventas, compras, asientos] = await Promise.all([
      xubio.miEmpresa(creds).catch(() => null),
      xubio.clientes(creds),
      xubio.proveedores(creds),
      xubio.ventas(creds, iso(desde), iso(hasta)),
      xubio.compras(creds, iso(desde), iso(hasta)),
      xubio.asientos(creds),
    ]);
    const orgId = conn.organization_id;
    // Cuenta de una organización: la CUIT de Mi empresa tiene que ser una de sus razones sociales
    let ownEntity: string | null = null;
    let validation: ExternalRow["validation"] | undefined;
    if (orgId) {
      const cuit = digitsCuit(me?.cuit);
      const [le] = cuit
        ? await getDb()
            .select({ id: legal_entities.id })
            .from(legal_entities)
            .where(and(eq(legal_entities.organization_id, orgId), eq(legal_entities.cuit, cuit)))
        : [];
      ownEntity = le?.id ?? null;
      validation = le ? "validado" : "con_error";
    }
    const own = (r: ExternalRow): ExternalRow => (orgId ? { ...r, organizationId: orgId, legalEntityId: ownEntity, validation } : r);
    const clientCuit = new Map(clientes.map((c) => [String(c.cliente_id ?? ""), digitsCuit(c.cuit ?? c.CUIT)]));
    const provCuit = new Map(proveedores.map((p) => [String(p.proveedorid ?? ""), digitsCuit(p.cuit ?? p.CUIT)]));
    const rows: ExternalRow[] = [
      // En una cuenta de organización los clientes son SUS clientes: no se cruzan con el estudio
      ...clientes.map((c) => ({
        resource: "clientes",
        externalId: String(c.cliente_id ?? c.cuit ?? c.nombre),
        cuit: digitsCuit(c.cuit ?? c.CUIT),
        name: c.razonSocial || c.nombre || null,
        raw: c,
        ...(orgId ? { organizationId: orgId, validation: "sin_cruzar" as const } : {}),
      })),
      ...ventas.map((v) =>
        own({
          resource: "comprobantes_venta",
          externalId: String(v.transaccionid),
          cuit: clientCuit.get(String(v.cliente?.ID ?? v.cliente?.id ?? "")) ?? null,
          name: [v.numeroDocumento, v.cliente?.nombre].filter(Boolean).join(" · ") || null,
          date: v.fecha ?? null,
          amount: num(v.importetotal),
          raw: v,
        }),
      ),
      ...compras.map((v) =>
        own({
          resource: "comprobantes_compra",
          externalId: String(v.transaccionid),
          cuit: provCuit.get(String(v.proveedor?.ID ?? v.proveedor?.id ?? "")) ?? null,
          name: [v.numeroDocumento, v.proveedor?.nombre].filter(Boolean).join(" · ") || null,
          date: v.fecha ?? null,
          amount: num(v.importetotal),
          raw: v,
        }),
      ),
      ...asientos.map((a) =>
        own({
          resource: "asientos",
          externalId: String(a.transaccionid),
          name: a.descripcion || a.numeroDocumento || null,
          date: a.fecha ?? null,
          amount: num(a.importetotal) ?? (a.asientoContableManualItem ?? []).filter((i) => i.debeHaber === 1).reduce((s, i) => s + (Number(i.importe) || 0), 0),
          raw: a,
        }),
      ),
    ].filter((r) => r.externalId && r.externalId !== "undefined");
    const saved = await upsertExternal(conn, "xubio", rows);
    const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
    const message = `Sincronizado: ${n(clientes.length, "cliente", "clientes")}, ${n(ventas.length, "comprobante de venta", "comprobantes de venta")}, ${n(compras.length, "de compra", "de compra")} y ${n(asientos.length, "asiento", "asientos")} (últimos ${days} días).${orgId && validation === "con_error" ? " Atención: la CUIT de la empresa en Xubio no coincide con ninguna razón social de la organización." : ""}`;
    await endLog(log, conn.id, true, message, saved);
    return { ok: true, message, records: saved };
  } catch (error) {
    const message = error instanceof XubioError ? error.message : "Error al sincronizar Xubio.";
    if (!(error instanceof XubioError)) console.error("[xubio] sync", error);
    await endLog(log, conn.id, false, message);
    return { ok: false, message, records: 0 };
  }
}
