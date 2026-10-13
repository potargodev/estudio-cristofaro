import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { connections, invoice_settings, legal_entities, organizations, stock_stores, tango_links, users, whatsapp_contacts, whatsapp_messages } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isUuid } from "@/lib/ids";
import { readCredentials, sealCredentials } from "@/modules/connectors/store";
import { arcaSim } from "./arca";
import { otherSide, simClientId, type OtherSideAction } from "./conectores";
import { SERVICES, type Mode, type Service } from "./core";
import { modeOf, ModeError, simEvents, simList } from "./server";
import type { Pref } from "./mercadopago";

// Parte C · Panel de simuladores de un espacio (/simuladores). Todo se calcula
// con el espacio de la sesión: los controles solo tocan lo simulado de ese
// espacio y solo si el servicio está en Simulador. Cada acción queda en la
// auditoría («simulador.<servicio>»).

const db = () => getDb();
type Actor = { id: string; email: string; name?: string; role?: string };

export async function spaceModes(studioId: string) {
  const out = {} as Record<Service, Mode>;
  for (const k of Object.keys(SERVICES) as Service[]) out[k] = await modeOf(studioId, null, k);
  return out;
}

/** Exige el servicio en Simulador para el espacio (o la organización) */
async function requireSim(studioId: string, service: Service, organizationId: string | null = null) {
  if ((await modeOf(studioId, organizationId, service)) !== "simulador") throw new ModeError(`${SERVICES[service].label} no está en modo Simulador en este espacio.`);
}

/** CUIT del espacio: las de sus razones sociales y las que facturan */
async function spaceCuits(studioId: string) {
  const [a, b] = await Promise.all([
    db().select({ c: legal_entities.cuit }).from(legal_entities).where(and(eq(legal_entities.studio_id, studioId), isNotNull(legal_entities.cuit))),
    db().select({ c: invoice_settings.cuit }).from(invoice_settings).where(eq(invoice_settings.studio_id, studioId)),
  ]);
  return [...new Set([...a, ...b].map((x) => (x.c ?? "").replace(/\D/g, "")).filter((c) => c.length === 11))];
}

async function own<T extends { studio_id: string }>(row: T | undefined, studioId: string) {
  if (!row || row.studio_id !== studioId) throw new ModeError("Eso no es de este espacio.");
  return row;
}

/** Todo lo que muestra el panel */
export async function panelData(studioId: string) {
  const [modes, cuits, orgs, stores, conns, link, events] = await Promise.all([
    spaceModes(studioId),
    spaceCuits(studioId),
    db().select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.studio_id, studioId)).orderBy(organizations.name).limit(200),
    db().select({ id: stock_stores.id, name: stock_stores.name, platform: stock_stores.platform, organization: stock_stores.organization_id }).from(stock_stores).where(eq(stock_stores.studio_id, studioId)),
    db().select({ id: connections.id, connector: connections.connector, name: connections.name, status: connections.status, credentials: connections.credentials_enc }).from(connections).where(and(eq(connections.studio_id, studioId), inArray(connections.connector, ["xubio", "contabilium"]))),
    db().select({ url: tango_links.api_url }).from(tango_links).where(eq(tango_links.studio_id, studioId)),
    simEvents(null, studioId, 40),
  ]);
  const outage = cuits.length ? await arcaSim.outage(cuits[0]) : false;
  const prefs = await simList<Pref>("mercadopago", studioId, "pref:");
  const simAccount = simClientId(studioId);
  return {
    modes,
    cuits,
    orgs,
    stores,
    outage,
    prefs: prefs.map((p) => ({ ...p.data, updated: p.updated })),
    // Las conexiones de Xubio y Contabilium que usan la cuenta simulada
    simulated: conns.filter((c) => readCredentials<{ client_id: string }>({ credentials_enc: c.credentials }).client_id === simAccount).map((c) => ({ id: c.id, connector: c.connector, name: c.name, status: c.status })),
    simAccount,
    tango: link[0]?.url ?? null,
    events,
  };
}

// ───────────── ARCA ─────────────

export async function arcaOutage(studioId: string, actor: Actor, on: boolean) {
  await requireSim(studioId, "arca");
  const cuits = await spaceCuits(studioId);
  if (!cuits.length) throw new ModeError("Este espacio todavía no tiene CUIT cargadas.");
  await arcaSim.setOutage(cuits, on, studioId);
  await audit({ studioId, actor, action: "simulador.arca", entityType: "simulador", metadata: { caido: on } });
}

export async function arcaDrop(studioId: string, actor: Actor) {
  await requireSim(studioId, "arca");
  const cuits = await spaceCuits(studioId);
  if (!cuits.length) throw new ModeError("Este espacio todavía no tiene CUIT cargadas.");
  await arcaSim.dropNext(cuits, studioId);
  await audit({ studioId, actor, action: "simulador.arca", entityType: "simulador", metadata: { corte: true } });
}

// ───────────── Tiendas ─────────────

export async function storeSale(studioId: string, actor: Actor, i: { storeId: string; qty: number; price: number; status: "paid" | "refunded" | "cancelled"; orderId?: string | null; buyer?: { name: string; doc_number: string } | null }) {
  if (!isUuid(i.storeId)) throw new ModeError("Elegí una tienda.");
  const [st] = await db().select().from(stock_stores).where(eq(stock_stores.id, i.storeId));
  const store = await own(st, studioId);
  await requireSim(studioId, "tiendas", store.organization_id);
  const { simOrder, shopState } = await import("./tiendas");
  const shop = await shopState(`/${store.platform}/${encodeURIComponent(store.id)}`);
  const order = await simOrder(store.platform, store.id, { listingId: shop.listings[0]?.id ?? "", qty: Math.max(1, Math.min(99, Math.round(i.qty))), price: Math.max(0, i.price), status: i.status, orderId: i.orderId || undefined, buyer: i.buyer ?? null });
  // Llega a Faro como el aviso de la tienda
  const { webhook } = await import("@/modules/stock/server");
  const r = await webhook(store.webhook_token, { order });
  await audit({ studioId, organizationId: store.organization_id, actor, action: "simulador.tiendas", entityType: "tienda", entityId: store.id, metadata: { pedido: order.id, estado: i.status } });
  return { order, result: r };
}

// ───────────── Xubio, Contabilium y Tango ─────────────

/** Conecta la cuenta simulada (Client ID «simulador-<espacio>») y la prueba */
export async function connectSimulated(studioId: string, actor: Actor, connector: "xubio" | "contabilium" | "tango") {
  await requireSim(studioId, connector);
  if (connector === "tango") {
    const { saveLink } = await import("@/modules/tango-sync/server");
    await saveLink({ ...actor, studioId } as Parameters<typeof saveLink>[0], { apiUrl: "sim://tango", token: "simulador", companyId: "1", writeEnabled: true });
    return;
  }
  const label = connector === "xubio" ? "Xubio" : "Contabilium";
  const values = { name: `${label} simulado`, credentials_enc: sealCredentials({ client_id: simClientId(studioId), client_secret: "simulador" }) };
  const [prev] = await db().select({ id: connections.id }).from(connections).where(and(eq(connections.studio_id, studioId), eq(connections.connector, connector), eq(connections.name, values.name)));
  const id = prev?.id ?? (await db().insert(connections).values({ ...values, studio_id: studioId, connector, created_by: actor.id }).returning({ id: connections.id }))[0].id;
  await audit({ studioId, actor, action: "conexion.crear", entityType: "conexion", entityId: id, metadata: { conector: connector, simulador: true } });
  const conn = (await db().select().from(connections).where(eq(connections.id, id)))[0];
  if (connector === "xubio") {
    const { testXubio } = await import("@/modules/connectors/xubio/sync");
    await testXubio(conn, actor.id);
  } else {
    const { testContabilium } = await import("@/modules/connectors/contabilium/sync");
    await testContabilium(conn, actor.id);
  }
}

/** «El otro lado»: alguien carga algo directo en el sistema simulado */
export async function otherSideAction(studioId: string, actor: Actor, a: Omit<OtherSideAction, "account">) {
  await requireSim(studioId, a.service);
  await otherSide({ ...a, account: a.service === "tango" ? studioId : simClientId(studioId) } as OtherSideAction, studioId);
  await audit({ studioId, actor, action: `simulador.${a.service}`, entityType: "simulador", metadata: { accion: a.kind } });
}

// ───────────── Banco ─────────────

export async function bankStatement(studioId: string, actor: Actor, organizationId: string) {
  await requireSim(studioId, "banco", organizationId);
  const [o] = isUuid(organizationId) ? await db().select({ id: organizations.id, studio_id: organizations.studio_id, name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)) : [];
  const org = await own(o, studioId);
  const { simStatement } = await import("./banco");
  const csv = await simStatement(studioId, org.id);
  await audit({ studioId, organizationId: org.id, actor, action: "simulador.banco", entityType: "simulador", metadata: { extracto: true } });
  return { csv, name: `extracto-simulado-${org.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}.csv` };
}

// ───────────── Teléfono de prueba ─────────────

/** Números verificados del espacio y la conversación del elegido */
export async function phoneData(studioId: string, phone: string | null) {
  const contacts = await db()
    .select({ phone: whatsapp_contacts.phone, name: users.name, organization: organizations.name })
    .from(whatsapp_contacts)
    .innerJoin(users, eq(users.id, whatsapp_contacts.user_id))
    .innerJoin(organizations, eq(organizations.id, whatsapp_contacts.organization_id))
    .where(and(eq(whatsapp_contacts.studio_id, studioId), isNotNull(whatsapp_contacts.verified_at)))
    .limit(50);
  const current = contacts.find((c) => c.phone === phone) ?? contacts[0] ?? null;
  const messages = current
    ? await db()
        .select({ id: whatsapp_messages.id, direction: whatsapp_messages.direction, kind: whatsapp_messages.kind, body: whatsapp_messages.body, template: whatsapp_messages.template, status: whatsapp_messages.status, created: whatsapp_messages.created_at })
        .from(whatsapp_messages)
        .where(and(eq(whatsapp_messages.studio_id, studioId), eq(whatsapp_messages.phone, current.phone)))
        .orderBy(desc(whatsapp_messages.created_at))
        .limit(60)
    : [];
  return { contacts, current, messages: messages.reverse() };
}

export async function phoneSend(studioId: string, actor: Actor, phone: string, msg: { type: "texto" | "audio" | "imagen" | "documento"; text?: string; data?: Buffer; mime?: string; filename?: string }) {
  await requireSim(studioId, "whatsapp");
  const { contacts } = await phoneData(studioId, phone);
  if (!contacts.some((c) => c.phone === phone)) throw new ModeError("Elegí uno de los números verificados del espacio.");
  const { simulateInbound } = await import("@/modules/whatsapp/server");
  await simulateInbound(studioId, phone, msg);
  await audit({ studioId, actor, action: "simulador.whatsapp", entityType: "simulador", metadata: { tipo: msg.type } });
}
