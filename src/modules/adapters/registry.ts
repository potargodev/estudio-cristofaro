import "server-only";
import { and, count, eq, gte, inArray, isNull, max, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  adapter_conflicts,
  connections,
  external_records,
  integrations,
  invoices,
  mp_accounts,
  org_adapters,
  stock_conflicts,
  stock_store_orders,
  stock_stores,
  tango_conflicts,
  tango_documents,
  tango_links,
} from "@/db/schema";
import { contabilium } from "@/modules/connectors/contabilium/client";
import { contabiliumRows, credsOf as cbCreds, syncContabilium } from "@/modules/connectors/contabilium/sync";
import { syncDrive } from "@/modules/connectors/google-drive/drive";
import type { Connection } from "@/modules/connectors/store";
import { readCredentials } from "@/modules/connectors/store";
import { xubio } from "@/modules/connectors/xubio/client";
import { syncXubio } from "@/modules/connectors/xubio/sync";
import { publishStore, syncListings } from "@/modules/stock/server";
import { pollTango, pushPending } from "@/modules/tango-sync/server";
import { adapterDef } from "./catalog";
import type { AdapterState, AdapterStatus } from "./types";

// Implementación de cada adaptador sobre la interfaz única (types.ts). Cada
// uno delega en su módulo de siempre (Tango, Xubio, archivos, Drive, Mercado
// Pago, tiendas) o en el nuevo (Contabilium): las pantallas solo ven el
// núcleo, el estado y las operaciones.

export interface Ctx {
  studioId: string;
  organizationId: string;
}
export interface OpResult {
  ok: boolean;
  message: string;
  records?: number;
}
/** Totales del lado externo por recurso del espejo (para el control de «Pasate a Faro») */
type RemoteTotals = Record<string, { count: number; amount: number }>;

interface Impl {
  state(ctx: Ctx): Promise<Omit<AdapterState, "status"> & { status: AdapterStatus }>;
  sync?(ctx: Ctx, actorId: string | null, days: number): Promise<OpResult>;
  publish?(ctx: Ctx): Promise<OpResult>;
  remoteTotals?(ctx: Ctx): Promise<RemoteTotals | null>;
  /** Escribe de vuelta un cambio de un registro del espejo (solo si el adaptador lo declara) */
  write?(conn: Connection, resource: string, externalId: string, changes: Record<string, unknown>): Promise<void>;
  /** Lo propio del adaptador al desconectar (pausar la conexión, la tienda…). Los datos quedan. */
  disconnect?(ctx: Ctx): Promise<void>;
}

const db = () => getDb();
const latest = (dates: (Date | null)[]) => dates.filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

async function openConflicts(ctx: Ctx, adapter: string) {
  const [r] = await db()
    .select({ n: count() })
    .from(adapter_conflicts)
    .where(and(eq(adapter_conflicts.studio_id, ctx.studioId), eq(adapter_conflicts.organization_id, ctx.organizationId), eq(adapter_conflicts.adapter, adapter), eq(adapter_conflicts.status, "abierto")));
  return r.n;
}

// ───────────── Conexiones del hub (Xubio, Contabilium, archivos, Drive) ─────────────

/** Conexiones que alcanzan a la organización: las propias y las del estudio que cruzan por CUIT */
async function connsFor(ctx: Ctx, connector: string) {
  return db()
    .select()
    .from(connections)
    .where(and(eq(connections.studio_id, ctx.studioId), eq(connections.connector, connector), or(eq(connections.organization_id, ctx.organizationId), isNull(connections.organization_id))));
}

function connectionImpl(connector: string, opts: { sync?: (c: Connection, actorId: string | null, days: number) => Promise<{ ok: boolean; message: string; records: number }>; totals?: (c: Connection, ctx: Ctx) => Promise<RemoteTotals | null>; write?: Impl["write"]; publish?: Impl["publish"] }): Impl {
  return {
    async state(ctx) {
      const conns = await connsFor(ctx, connector);
      const ids = conns.map((c) => c.id);
      const [recs] = ids.length
        ? await db()
            .select({ n: count() })
            .from(external_records)
            .where(and(inArray(external_records.connection_id, ids), eq(external_records.organization_id, ctx.organizationId)))
        : [{ n: 0 }];
      // Una cuenta del estudio solo cuenta para la organización si trajo algo suyo
      const relevant = conns.filter((c) => c.organization_id === ctx.organizationId || recs.n > 0);
      const status: AdapterStatus = !relevant.length ? "sin_configurar" : relevant.some((c) => c.status === "error") ? "error" : relevant.every((c) => c.status === "pausada") ? "pausado" : "conectado";
      return {
        status,
        records: recs.n,
        lastSync: latest(relevant.map((c) => c.last_sync_at)),
        conflicts: await openConflicts(ctx, connector),
        detail: relevant.find((c) => c.last_error)?.last_error ?? null,
        refs: relevant.map((c) => ({ id: c.id, name: c.name })),
      };
    },
    sync: opts.sync
      ? async (ctx, actorId, days) => {
          const conns = (await connsFor(ctx, connector)).filter((c) => c.status !== "pausada");
          if (!conns.length) return { ok: false, message: "No hay una cuenta conectada para esta organización." };
          let records = 0;
          const msgs: string[] = [];
          let ok = true;
          for (const c of conns) {
            const r = await opts.sync!(c, actorId, days);
            ok &&= r.ok;
            records += r.records;
            msgs.push(r.message);
          }
          return { ok, message: msgs.join(" "), records };
        }
      : undefined,
    async remoteTotals(ctx) {
      if (!opts.totals) return null;
      const [own] = (await connsFor(ctx, connector)).filter((c) => c.organization_id === ctx.organizationId);
      return own ? opts.totals(own, ctx) : null;
    },
    write: opts.write,
    publish: opts.publish,
    async disconnect(ctx) {
      // La cuenta propia de la organización se pausa; los registros traídos quedan en el núcleo
      await db()
        .update(connections)
        .set({ status: "pausada" })
        .where(and(eq(connections.studio_id, ctx.studioId), eq(connections.connector, connector), eq(connections.organization_id, ctx.organizationId)));
    },
  };
}

/** Totales por recurso a partir de filas del espejo */
function totalsOf(rows: { resource: string; amount?: number | null }[]): RemoteTotals {
  const out: RemoteTotals = {};
  for (const r of rows) {
    const t = (out[r.resource] ??= { count: 0, amount: 0 });
    t.count++;
    t.amount += Number(r.amount ?? 0);
  }
  for (const t of Object.values(out)) t.amount = Math.round(t.amount * 100) / 100;
  return out;
}

const HISTORY_DAYS = 3650;

const IMPLS: Record<string, Impl> = {
  xubio: connectionImpl("xubio", {
    sync: (c, actorId, days) => syncXubio(c, actorId ?? "", days),
    async totals(c) {
      const creds = readCredentials<{ client_id: string; client_secret: string }>(c);
      if (!creds.client_id || !creds.client_secret) return null;
      const k = { client_id: creds.client_id, client_secret: creds.client_secret };
      const hasta = new Date().toISOString().slice(0, 10);
      const desde = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString().slice(0, 10);
      const [clientes, ventas, compras, asientos] = await Promise.all([xubio.clientes(k), xubio.ventas(k, desde, hasta), xubio.compras(k, desde, hasta), xubio.asientos(k)]);
      return totalsOf([
        ...clientes.map(() => ({ resource: "clientes" })),
        ...ventas.map((v) => ({ resource: "comprobantes_venta", amount: Number(v.importetotal ?? 0) })),
        ...compras.map((v) => ({ resource: "comprobantes_compra", amount: Number(v.importetotal ?? 0) })),
        ...asientos.map(() => ({ resource: "asientos" })),
      ]);
    },
  }),
  contabilium: connectionImpl("contabilium", {
    sync: (c, actorId, days) => syncContabilium(c, actorId, days),
    async totals(c) {
      const creds = cbCreds(c);
      return creds ? totalsOf(await contabiliumRows(c, creds, HISTORY_DAYS)) : null;
    },
    async write(conn, resource, externalId, changes) {
      const creds = cbCreds(conn);
      if (!creds) throw new Error("La conexión no tiene credenciales.");
      if (resource !== "clientes") throw new Error("Contabilium solo permite modificar clientes.");
      await contabilium.modificarCliente(creds, externalId, changes);
    },
    /** Lo facturado en Faro vuelve a Contabilium cuando él es la fuente de verdad de la facturación (idempotente por tipo, punto de venta y número) */
    async publish(ctx) {
      const [conn] = (await connsFor(ctx, "contabilium")).filter((c) => c.organization_id === ctx.organizationId && c.status !== "pausada");
      const creds = conn ? cbCreds(conn) : null;
      if (!conn || !creds) return { ok: false, message: "No hay una cuenta de Contabilium de esta organización." };
      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const list = await db()
        .select()
        .from(invoices)
        .where(and(eq(invoices.studio_id, ctx.studioId), eq(invoices.organization_id, ctx.organizationId), eq(invoices.status, "autorizada"), gte(invoices.issue_date, since)));
      for (const inv of list)
        await contabilium.crearComprobante(creds, { Tipo: `F${inv.cbte_type}`, PuntoVenta: inv.point_of_sale, Numero: inv.number, FechaEmision: inv.issue_date, RazonSocial: inv.customer_name, NroDoc: inv.customer_doc_number, ImporteNeto: Number(inv.net), Iva: Number(inv.iva), ImporteTotal: Number(inv.total), Cae: inv.cae, OrigenFaro: inv.id });
      return { ok: true, message: `${list.length} ${list.length === 1 ? "comprobante publicado" : "comprobantes publicados"} en Contabilium (los que ya estaban no se duplican).`, records: list.length };
    },
  }),
  archivos: connectionImpl("archivos", {}),
  google_drive: connectionImpl("google_drive", {
    sync: async (c, actorId) => {
      const r = await syncDrive(c, actorId ?? "");
      return { ok: r.ok, message: r.message, records: 0 };
    },
  }),

  // ───────────── Tango (enlace del estudio a la API y conector local) ─────────────
  tango: {
    async state(ctx) {
      const [[link], [local], [docs], [conf]] = await Promise.all([
        db().select().from(tango_links).where(eq(tango_links.studio_id, ctx.studioId)),
        db().select().from(integrations).where(and(eq(integrations.studio_id, ctx.studioId), eq(integrations.type, "tango"))),
        db().select({ n: count(), last: max(tango_documents.synced_at) }).from(tango_documents).where(and(eq(tango_documents.studio_id, ctx.studioId), eq(tango_documents.organization_id, ctx.organizationId))),
        db()
          .select({ n: count() })
          .from(tango_conflicts)
          .innerJoin(tango_documents, eq(tango_documents.id, tango_conflicts.document_id))
          .where(and(eq(tango_conflicts.studio_id, ctx.studioId), eq(tango_documents.organization_id, ctx.organizationId), eq(tango_conflicts.status, "abierto"))),
      ]);
      const status: AdapterStatus = !link && !local ? "sin_configurar" : link?.status === "error" ? "error" : link?.status === "pausado" || local?.status === "pausada" ? "pausado" : "conectado";
      return {
        status,
        records: docs.n,
        lastSync: latest([docs.last ?? null, link?.last_poll_at ?? null, local?.last_sync_at ?? null]),
        conflicts: conf.n,
        detail: link?.last_error ?? null,
        refs: [...(link ? [{ id: link.id, name: "API de Tango" }] : []), ...(local ? [{ id: local.id, name: "Conector local" }] : [])],
      };
    },
    async sync(ctx) {
      const n = await pollTango(ctx.studioId);
      return { ok: true, message: `Tango consultado: ${n} ${n === 1 ? "comprobante nuevo o cambiado" : "comprobantes nuevos o cambiados"}.`, records: n };
    },
    async publish(ctx) {
      await pushPending(ctx.studioId);
      return { ok: true, message: "Comprobantes pendientes enviados a Tango." };
    },
  },

  // ───────────── Mercado Pago (cuenta del estudio) ─────────────
  mercadopago: {
    async state(ctx) {
      const [acc] = await db().select().from(mp_accounts).where(eq(mp_accounts.studio_id, ctx.studioId));
      return {
        status: !acc ? "sin_configurar" : acc.status === "error" ? "error" : "conectado",
        records: 0,
        lastSync: acc?.tested_at ?? null,
        conflicts: 0,
        detail: acc?.last_error ?? null,
        refs: acc ? [{ id: acc.id, name: acc.nickname ?? "Cuenta de Mercado Pago" }] : [],
      };
    },
  },
};

// ───────────── Tiendas (una implementación por plataforma) ─────────────

function storeImpl(platform: string): Impl {
  const stores = (ctx: Ctx) =>
    db()
      .select()
      .from(stock_stores)
      .where(and(eq(stock_stores.studio_id, ctx.studioId), eq(stock_stores.organization_id, ctx.organizationId), eq(stock_stores.platform, platform)));
  return {
    async state(ctx) {
      const list = await stores(ctx);
      const ids = list.map((s) => s.id);
      const [[orders], [conf]] = ids.length
        ? await Promise.all([
            db().select({ n: count() }).from(stock_store_orders).where(inArray(stock_store_orders.store_id, ids)),
            db()
              .select({ n: count() })
              .from(stock_conflicts)
              .where(and(inArray(stock_conflicts.store_id, ids), eq(stock_conflicts.status, "abierto"))),
          ])
        : [[{ n: 0 }], [{ n: 0 }]];
      return {
        status: !list.length ? "sin_configurar" : list.some((s) => s.last_error) ? "error" : list.every((s) => s.paused) ? "pausado" : "conectado",
        records: orders.n,
        lastSync: latest(list.map((s) => s.last_poll_at)),
        conflicts: conf.n,
        detail: list.find((s) => s.last_error)?.last_error ?? null,
        refs: list.map((s) => ({ id: s.id, name: s.name })),
      };
    },
    async sync(ctx) {
      const list = (await stores(ctx)).filter((s) => !s.paused);
      for (const s of list) await syncListings({ ...ctx, canManage: true }, s.id);
      return { ok: true, message: `${list.length} ${list.length === 1 ? "tienda sincronizada" : "tiendas sincronizadas"}.` };
    },
    async publish(ctx) {
      const list = (await stores(ctx)).filter((s) => !s.paused && s.sync_enabled);
      for (const s of list) await publishStore(s.id);
      return { ok: true, message: list.length ? `Existencia publicada en ${list.length} ${list.length === 1 ? "tienda" : "tiendas"}.` : "Ninguna tienda tiene la publicación activada." };
    },
    async disconnect(ctx) {
      await db()
        .update(stock_stores)
        .set({ paused: true, sync_enabled: false })
        .where(and(eq(stock_stores.studio_id, ctx.studioId), eq(stock_stores.organization_id, ctx.organizationId), eq(stock_stores.platform, platform)));
    },
  };
}

export function implOf(key: string): Impl | null {
  if (IMPLS[key]) return IMPLS[key];
  if (key.startsWith("tienda_") && adapterDef(key)) return storeImpl(key.slice("tienda_".length));
  return null;
}

/** Estado del adaptador, con la pausa o la desconexión que la organización haya elegido */
export async function stateOf(ctx: Ctx, key: string): Promise<AdapterState> {
  const impl = implOf(key);
  if (!impl) return { status: "sin_configurar", records: 0, lastSync: null, conflicts: 0, refs: [] };
  const [s, [row]] = await Promise.all([
    impl.state(ctx),
    db()
      .select()
      .from(org_adapters)
      .where(and(eq(org_adapters.organization_id, ctx.organizationId), eq(org_adapters.adapter, key))),
  ]);
  if (row?.status === "desconectado") return { ...s, status: "desconectado" };
  if (row?.status === "pausado" && s.status !== "sin_configurar") return { ...s, status: "pausado" };
  return { ...s, lastSync: latest([s.lastSync, row?.last_sync_at ?? null]) };
}

/** Totales del núcleo por recurso para un adaptador y una organización (lo que quedó guardado con su origen) */
export async function coreTotals(ctx: Ctx, key: string): Promise<RemoteTotals> {
  const rows = await db()
    .select({ resource: external_records.resource, n: count(), amount: sql<string>`coalesce(sum(${external_records.amount}), 0)` })
    .from(external_records)
    .innerJoin(connections, eq(connections.id, external_records.connection_id))
    .where(and(eq(external_records.studio_id, ctx.studioId), eq(external_records.organization_id, ctx.organizationId), eq(connections.connector, key)))
    .groupBy(external_records.resource);
  return Object.fromEntries(rows.map((r) => [r.resource, { count: r.n, amount: Math.round(Number(r.amount) * 100) / 100 }]));
}
