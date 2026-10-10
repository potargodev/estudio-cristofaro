"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { integrations, legal_entities, tango_companies, tango_records } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { studioOrganization } from "@/lib/organizations";
import { insertOrganization } from "@/lib/organizations-write";
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

const BASE = "/admin/conexiones/tango";
const CLIENTS = "/admin/conexiones/tango/clientes";

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

/** Razón social del estudio con su organización, o null */
async function legalEntityOfStudio(id: string | null, studioId: string) {
  if (!id || !isUuid(id)) return null;
  const [le] = await getDb()
    .select({ id: legal_entities.id, organizationId: legal_entities.organization_id })
    .from(legal_entities)
    .where(and(eq(legal_entities.id, id), eq(legal_entities.studio_id, studioId)));
  return le ?? null;
}

/** Empresa de Tango ↔ organización de la plataforma (estudios que usan una empresa de Tango por cliente) */
export async function mapCompanyToOrganization(fd: FormData) {
  const admin = await requireAdmin();
  const companyRowId = s(fd, "id");
  if (!companyRowId || !isUuid(companyRowId)) redirect(BASE);
  const orgId = s(fd, "organization_id");
  const org = orgId ? await studioOrganization(orgId, admin.studioId) : null;
  if (orgId && !org) redirect(`${BASE}?error=cliente`);
  await getDb()
    .update(tango_companies)
    .set({ organization_id: org?.id ?? null, legal_entity_id: null })
    .where(and(eq(tango_companies.id, companyRowId), eq(tango_companies.studio_id, admin.studioId)));
  await audit({
    studioId: admin.studioId,
    organizationId: org?.id ?? null,
    actor: admin,
    action: "tango.vincular",
    entityType: "tango_empresa",
    entityId: companyRowId,
    metadata: { desvincular: !org },
  });
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

/** Cliente de Tango ↔ razón social (y su organización) */
export async function linkTangoClient(fd: FormData) {
  const admin = await requireAdmin();
  const record = await tangoClientRecord(s(fd, "record_id"), admin.studioId);
  const le = await legalEntityOfStudio(s(fd, "legal_entity_id"), admin.studioId);
  if (!record || !le) redirect(`${CLIENTS}?error=vincular`);
  await getDb()
    .update(tango_records)
    .set({ organization_id: le.organizationId, legal_entity_id: le.id })
    .where(eq(tango_records.id, record.id));
  await audit({
    studioId: admin.studioId,
    organizationId: le.organizationId,
    actor: admin,
    action: "tango.vincular",
    entityType: "tango_cliente",
    entityId: record.id,
    metadata: { empresa: record.company_id, id_externo: record.external_id },
  });
  revalidatePath(CLIENTS);
  revalidatePath(`/admin/organizaciones/${le.organizationId}`);
  redirect(`${CLIENTS}?vinculado=1#${record.id}`);
}

export async function unlinkTangoClient(fd: FormData) {
  const admin = await requireAdmin();
  const record = await tangoClientRecord(s(fd, "record_id"), admin.studioId);
  if (!record) redirect(CLIENTS);
  await getDb().update(tango_records).set({ organization_id: null, legal_entity_id: null }).where(eq(tango_records.id, record.id));
  await audit({
    studioId: admin.studioId,
    organizationId: record.organization_id,
    actor: admin,
    action: "tango.vincular",
    entityType: "tango_cliente",
    entityId: record.id,
    metadata: { desvincular: true },
  });
  revalidatePath(CLIENTS);
  if (record.organization_id) revalidatePath(`/admin/organizaciones/${record.organization_id}`);
  redirect(`${CLIENTS}#${record.id}`);
}

/** Crea una organización nueva (con su razón social) con los datos de Tango y la deja vinculada */
export async function importTangoClient(fd: FormData) {
  const admin = await requireAdmin();
  const record = await tangoClientRecord(s(fd, "record_id"), admin.studioId);
  if (!record) redirect(CLIENTS);
  const integration = await getTango(admin.studioId);
  const data = describeClient(record.raw, getMapping(integration?.settings));
  const db = getDb();
  const name = data.name ?? `Cliente de Tango ${record.external_id}`;
  let created: { organizationId: string; legalEntityId: string } | null = null;
  try {
    created = await insertOrganization(db, {
      studioId: admin.studioId,
      name,
      legalEntity: { business_name: name, cuit: data.cuit, regime: "otro", tax_address: data.address },
      contact: { email: data.email?.toLowerCase() ?? null, phone: data.phone },
      notes: `Importado de Tango (empresa ${record.company_id}, id ${record.external_id}).`,
    });
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
    redirect(`${CLIENTS}?error=${code === "23505" ? "cuit" : "importar"}#${record.id}`);
  }
  await db
    .update(tango_records)
    .set({ organization_id: created.organizationId, legal_entity_id: created.legalEntityId })
    .where(eq(tango_records.id, record.id));
  await audit({
    studioId: admin.studioId,
    organizationId: created.organizationId,
    actor: admin,
    action: "tango.importar",
    entityType: "tango_cliente",
    entityId: record.id,
    metadata: { empresa: record.company_id, id_externo: record.external_id, cuit: data.cuit },
  });
  revalidatePath(CLIENTS);
  revalidatePath("/admin/organizaciones");
  redirect(`${CLIENTS}?importado=1#${record.id}`);
}
