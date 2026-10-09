"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { clients, integrations, tango_companies, tango_records } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { TANGO_PROCESS } from "@/lib/integrations/tango/constants";
import { generateConnectorKey } from "@/lib/integrations/tango/keys";
import { DEFAULT_MAPPING, describeClient, getMapping, type TangoMapping } from "@/lib/integrations/tango/mapping";

// Integración con Tango: solo administradores, siempre dentro de su estudio.

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

const BASE = "/admin/integraciones";
const CLIENTS = "/admin/integraciones/tango/clientes";

async function getTango(studioId: string) {
  const [row] = await getDb()
    .select()
    .from(integrations)
    .where(and(eq(integrations.studio_id, studioId), eq(integrations.type, "tango")));
  return row ?? null;
}

export interface KeyState {
  ok: boolean;
  key?: string;
  message?: string;
}

/** Activa Tango (si hace falta) y genera una clave nueva. La clave anterior deja de funcionar. */
export async function generateTangoKey(_prev: KeyState, _fd: FormData): Promise<KeyState> {
  const admin = await requireAdmin();
  const { key, hash, prefix } = generateConnectorKey();
  const db = getDb();
  const current = await getTango(admin.studioId);
  if (current) {
    await db
      .update(integrations)
      .set({ connector_key_hash: hash, key_prefix: prefix, key_created_at: new Date() })
      .where(eq(integrations.id, current.id));
  } else {
    await db.insert(integrations).values({
      studio_id: admin.studioId,
      type: "tango",
      status: "activa",
      connector_key_hash: hash,
      key_prefix: prefix,
      key_created_at: new Date(),
    });
  }
  revalidatePath(BASE);
  return { ok: true, key };
}

export async function setTangoStatus(fd: FormData) {
  const admin = await requireAdmin();
  const current = await getTango(admin.studioId);
  if (current) {
    await getDb()
      .update(integrations)
      .set({ status: s(fd, "status") === "pausada" ? "pausada" : "activa" })
      .where(eq(integrations.id, current.id));
  }
  revalidatePath(BASE);
  redirect(`${BASE}?guardado=1`);
}

export async function saveTangoMapping(fd: FormData) {
  const admin = await requireAdmin();
  const current = await getTango(admin.studioId);
  if (!current) redirect(BASE);
  const mapping = {} as TangoMapping;
  for (const field of Object.keys(DEFAULT_MAPPING) as (keyof TangoMapping)[]) {
    const list = (s(fd, field) ?? "")
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter((x) => /^[\w.\-]{1,60}$/.test(x))
      .slice(0, 30);
    mapping[field] = list.length ? list : DEFAULT_MAPPING[field];
  }
  await getDb()
    .update(integrations)
    .set({ settings: { ...current.settings, mapping } })
    .where(eq(integrations.id, current.id));
  revalidatePath(BASE);
  revalidatePath(CLIENTS);
  redirect(`${BASE}?guardado=1#mapeo`);
}

async function clientOfStudio(clientId: string | null, studioId: string) {
  if (!clientId || !isUuid(clientId)) return null;
  const [c] = await getDb()
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.studio_id, studioId)));
  return c ?? null;
}

/** Empresa de Tango ↔ cliente de la plataforma (estudios que usan una empresa por cliente) */
export async function mapCompanyToClient(fd: FormData) {
  const admin = await requireAdmin();
  const companyRowId = s(fd, "id");
  if (!companyRowId || !isUuid(companyRowId)) redirect(BASE);
  const clientId = s(fd, "client_id");
  const client = clientId ? await clientOfStudio(clientId, admin.studioId) : null;
  if (clientId && !client) redirect(`${BASE}?error=cliente`);
  await getDb()
    .update(tango_companies)
    .set({ client_id: client?.id ?? null })
    .where(and(eq(tango_companies.id, companyRowId), eq(tango_companies.studio_id, admin.studioId)));
  revalidatePath(BASE);
  redirect(`${BASE}?guardado=1#empresas`);
}

async function tangoClientRecord(recordId: string | null, studioId: string) {
  if (!recordId || !isUuid(recordId)) return null;
  const [r] = await getDb()
    .select()
    .from(tango_records)
    .where(and(eq(tango_records.id, recordId), eq(tango_records.studio_id, studioId), eq(tango_records.process, TANGO_PROCESS.clientes)));
  return r ?? null;
}

export async function linkTangoClient(fd: FormData) {
  const admin = await requireAdmin();
  const record = await tangoClientRecord(s(fd, "record_id"), admin.studioId);
  const client = await clientOfStudio(s(fd, "client_id"), admin.studioId);
  if (!record || !client) redirect(`${CLIENTS}?error=vincular`);
  await getDb().update(tango_records).set({ client_id: client.id }).where(eq(tango_records.id, record.id));
  revalidatePath(CLIENTS);
  revalidatePath(`/admin/clientes/${client.id}`);
  redirect(`${CLIENTS}?vinculado=1#${record.id}`);
}

export async function unlinkTangoClient(fd: FormData) {
  const admin = await requireAdmin();
  const record = await tangoClientRecord(s(fd, "record_id"), admin.studioId);
  if (!record) redirect(CLIENTS);
  await getDb().update(tango_records).set({ client_id: null }).where(eq(tango_records.id, record.id));
  revalidatePath(CLIENTS);
  if (record.client_id) revalidatePath(`/admin/clientes/${record.client_id}`);
  redirect(`${CLIENTS}#${record.id}`);
}

/** Crea un cliente nuevo con los datos de Tango y lo deja vinculado */
export async function importTangoClient(fd: FormData) {
  const admin = await requireAdmin();
  const record = await tangoClientRecord(s(fd, "record_id"), admin.studioId);
  if (!record) redirect(CLIENTS);
  const integration = await getTango(admin.studioId);
  const data = describeClient(record.raw, getMapping(integration?.settings));
  const db = getDb();
  let clientId: string | null = null;
  try {
    const [created] = await db
      .insert(clients)
      .values({
        studio_id: admin.studioId,
        business_name: data.name ?? `Cliente de Tango ${record.external_id}`,
        cuit: data.cuit,
        email: data.email,
        phone: data.phone,
        address: data.address,
        notes: `Importado de Tango (empresa ${record.company_id}, id ${record.external_id}).`,
      })
      .returning({ id: clients.id });
    clientId = created.id;
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
    redirect(`${CLIENTS}?error=${code === "23505" ? "cuit" : "importar"}#${record.id}`);
  }
  await db.update(tango_records).set({ client_id: clientId }).where(eq(tango_records.id, record.id));
  revalidatePath(CLIENTS);
  revalidatePath("/admin/clientes");
  redirect(`${CLIENTS}?importado=1#${record.id}`);
}
