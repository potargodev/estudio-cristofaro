import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { industry_template_versions, organization_industries, organization_setup_items, organizations, studio_template_validations } from "@/db/schema";
import { audit } from "@/lib/audit";
import { FILE_TEMPLATES, ITEM_KINDS, isIndustryKey, templateItems, type ItemKind, type TemplateItem } from "./catalog";
import { industryTemplateSchema, templateIssue, type IndustryTemplate } from "./schema";

// Plantillas de rubro: versión vigente (archivo del repo o la última editada
// en el Faro Manager, la mayor), historial, validación profesional, aplicación
// a una organización con vista previa y actualizaciones por diferencias, sin
// pisar nunca lo que el estudio cambió.

export class IndustryError extends Error {}

export interface Actor {
  id: string;
  email: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Versión vigente de cada plantilla */
export async function listTemplates(): Promise<IndustryTemplate[]> {
  const rows = await getDb().select().from(industry_template_versions).orderBy(desc(industry_template_versions.version));
  return FILE_TEMPLATES.map((f) => {
    const latest = rows.find((r) => r.industry_key === f.clave);
    if (!latest || latest.version < f.version) return f;
    const p = industryTemplateSchema.safeParse(latest.content);
    return p.success ? p.data : f;
  });
}

export async function getTemplate(key: string): Promise<IndustryTemplate | null> {
  if (!isIndustryKey(key)) return null;
  return (await listTemplates()).find((t) => t.clave === key) ?? null;
}

/** Historial de versiones (la del archivo y las del Faro Manager) */
export async function templateHistory(key: string) {
  const file = FILE_TEMPLATES.find((t) => t.clave === key);
  const rows = await getDb().select().from(industry_template_versions).where(eq(industry_template_versions.industry_key, key)).orderBy(desc(industry_template_versions.version));
  const out = rows.map((r) => ({ version: r.version, status: r.status, validatedBy: r.validated_by_name ? `${r.validated_by_name} (${r.validated_by_license})` : null, validatedAt: r.validated_at as Date | null, note: r.note, createdAt: r.created_at as Date | null, source: "faro_manager" as "faro_manager" | "repo" }));
  if (file && !rows.some((r) => r.version === file.version)) out.push({ version: file.version, status: file.estado, validatedBy: file.validado_por ? `${file.validado_por.nombre} (${file.validado_por.matricula})` : null, validatedAt: null, note: "Versión del repositorio", createdAt: null, source: "repo" });
  return out.sort((a, b) => b.version - a.version);
}

/** Guarda una versión nueva editada en el Faro Manager (vuelve a borrador hasta que la validen) */
export async function saveTemplateVersion(actor: Actor, key: string, raw: string, note?: string) {
  const current = await getTemplate(key);
  if (!current) throw new IndustryError("Esa plantilla no existe.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new IndustryError("El contenido no es un JSON válido.");
  }
  const version = current.version + 1;
  const candidate = { ...(parsed as object), clave: key, version, estado: "borrador", validado_por: null, validado_el: null, actualizado_el: today() };
  const r = industryTemplateSchema.safeParse(candidate);
  if (!r.success) throw new IndustryError(templateIssue(r.error));
  await getDb().insert(industry_template_versions).values({ industry_key: key, version, content: r.data as never, status: "borrador", note: note?.trim().slice(0, 300) || null, created_by: actor.id });
  await audit({ studioId: null, actor, action: "plantilla.version", entityType: "plantilla_rubro", entityId: null, metadata: { rubro: key, version } });
  return version;
}

/** Marca la versión vigente como validada por un profesional (nombre y matrícula) */
export async function validateTemplate(actor: Actor, key: string, name: string, license: string) {
  const current = await getTemplate(key);
  if (!current) throw new IndustryError("Esa plantilla no existe.");
  if (name.trim().length < 3 || license.trim().length < 2) throw new IndustryError("Completá el nombre y la matrícula de quien valida.");
  const validated = { ...current, estado: "validada" as const, validado_por: { nombre: name.trim().slice(0, 120), matricula: license.trim().slice(0, 60) }, validado_el: today() };
  const db = getDb();
  const values = { status: "validada", content: validated as never, validated_by_name: validated.validado_por.nombre, validated_by_license: validated.validado_por.matricula, validated_at: new Date() };
  const [row] = await db.select({ id: industry_template_versions.id }).from(industry_template_versions).where(and(eq(industry_template_versions.industry_key, key), eq(industry_template_versions.version, current.version)));
  if (row) await db.update(industry_template_versions).set(values).where(eq(industry_template_versions.id, row.id));
  else await db.insert(industry_template_versions).values({ industry_key: key, version: current.version, note: "Validación de la versión del repositorio", created_by: actor.id, ...values });
  await audit({ studioId: null, actor, action: "plantilla.validar", entityType: "plantilla_rubro", metadata: { rubro: key, version: current.version, validador: validated.validado_por } });
}

// ── Aplicación a una organización ─────────────────────────────────────────

async function orgOf(studioId: string, organizationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new IndustryError("Esa organización no existe.");
  const [o] = await getDb()
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(and(eq(organizations.id, organizationId), eq(organizations.studio_id, studioId)));
  if (!o) throw new IndustryError("Esa organización no existe.");
  return o;
}

export interface Preview {
  template: IndustryTemplate;
  organization: { id: string; name: string };
  items: (TemplateItem & { exists: boolean })[];
  alreadyApplied: { version: number } | null;
}

/** Vista previa: lo que se va a crear (lo que ya existe no se toca) */
export async function previewApply(studioId: string, organizationId: string, key: string): Promise<Preview> {
  const org = await orgOf(studioId, organizationId);
  const t = await getTemplate(key);
  if (!t) throw new IndustryError("Ese rubro no existe.");
  const db = getDb();
  const [existing, [applied]] = await Promise.all([
    db
      .select({ kind: organization_setup_items.kind, key: organization_setup_items.key })
      .from(organization_setup_items)
      .where(and(eq(organization_setup_items.organization_id, org.id), eq(organization_setup_items.industry_key, key))),
    db.select({ version: organization_industries.version }).from(organization_industries).where(and(eq(organization_industries.organization_id, org.id), eq(organization_industries.industry_key, key))),
  ]);
  const has = new Set(existing.map((e) => `${e.kind}:${e.key}`));
  return { template: t, organization: org, items: templateItems(t).map((i) => ({ ...i, exists: has.has(`${i.kind}:${i.key}`) })), alreadyApplied: applied ?? null };
}

/** Aplica la plantilla: crea lo que falta y guarda qué versión se aplicó */
export async function applyTemplate(studioId: string, actor: Actor, organizationId: string, key: string) {
  const p = await previewApply(studioId, organizationId, key);
  const fresh = p.items.filter((i) => !i.exists);
  const db = getDb();
  await db.transaction(async (tx) => {
    if (fresh.length)
      await tx
        .insert(organization_setup_items)
        .values(fresh.map((i) => ({ studio_id: studioId, organization_id: p.organization.id, industry_key: key, kind: i.kind, key: i.key, data: i.data })))
        .onConflictDoNothing();
    await tx
      .insert(organization_industries)
      .values({ studio_id: studioId, organization_id: p.organization.id, industry_key: key, version: p.template.version, template_status: p.template.estado, snapshot: p.template as never, applied_by: actor.id })
      .onConflictDoUpdate({
        target: [organization_industries.organization_id, organization_industries.industry_key],
        set: { version: p.template.version, template_status: p.template.estado, snapshot: p.template as never, applied_by: actor.id, applied_at: new Date() },
      });
  });
  await audit({ studioId, organizationId: p.organization.id, actor, action: "rubro.aplicar", entityType: "rubro", entityId: null, metadata: { rubro: key, version: p.template.version, estado: p.template.estado, items: fresh.length } });
  return { created: fresh.length, version: p.template.version };
}

export type DiffEntry = { kind: ItemKind; key: string; label: string; detail?: string; change: "nuevo" | "cambiado" | "quitado"; customized: boolean };

/** Diferencias entre la versión aplicada y la vigente, por organización */
export async function diffForOrganization(studioId: string, organizationId: string, key: string) {
  const org = await orgOf(studioId, organizationId);
  const db = getDb();
  const [applied] = await db.select().from(organization_industries).where(and(eq(organization_industries.organization_id, org.id), eq(organization_industries.industry_key, key)));
  const current = await getTemplate(key);
  if (!applied || !current) return null;
  const before = industryTemplateSchema.safeParse(applied.snapshot);
  const old = before.success ? templateItems(before.data) : [];
  const now = templateItems(current);
  const items = await db
    .select()
    .from(organization_setup_items)
    .where(and(eq(organization_setup_items.organization_id, org.id), eq(organization_setup_items.industry_key, key)));
  const mine = (i: { kind: string; key: string }) => items.find((x) => x.kind === i.kind && x.key === i.key);
  const id = (i: { kind: string; key: string }) => `${i.kind}:${i.key}`;
  const oldMap = new Map(old.map((i) => [id(i), i]));
  const nowMap = new Map(now.map((i) => [id(i), i]));
  const entries: DiffEntry[] = [];
  for (const i of now) {
    const o = oldMap.get(id(i));
    if (!o && !mine(i)) entries.push({ kind: i.kind, key: i.key, label: i.label, detail: i.detail, change: "nuevo", customized: false });
    else if (o && JSON.stringify(o.data) !== JSON.stringify(i.data)) entries.push({ kind: i.kind, key: i.key, label: i.label, detail: i.detail, change: "cambiado", customized: Boolean(mine(i)?.customized) });
  }
  for (const o of old) if (!nowMap.has(id(o))) entries.push({ kind: o.kind, key: o.key, label: o.label, detail: o.detail, change: "quitado", customized: Boolean(mine(o)?.customized) });
  return { organization: org, applied: { version: applied.version, status: applied.template_status }, current: { version: current.version, status: current.estado }, entries };
}

/**
 * Incorpora lo que el estudio eligió de una versión nueva. Lo que el estudio
 * cambió (customized) nunca se pisa; lo quitado de la plantilla solo se quita
 * si se elige y no tiene cambios propios.
 */
export async function incorporateUpdate(studioId: string, actor: Actor, organizationId: string, key: string, selected: string[]) {
  const diff = await diffForOrganization(studioId, organizationId, key);
  if (!diff) throw new IndustryError("Esa organización no tiene aplicado ese rubro.");
  const current = (await getTemplate(key))!;
  const nowItems = new Map(templateItems(current).map((i) => [`${i.kind}:${i.key}`, i]));
  const pick = new Set(selected);
  const db = getDb();
  let applied = 0;
  let kept = 0;
  await db.transaction(async (tx) => {
    for (const e of diff.entries) {
      const ref = `${e.kind}:${e.key}`;
      if (!pick.has(ref)) continue;
      if (e.customized) {
        kept++;
        continue;
      }
      const where = and(eq(organization_setup_items.organization_id, diff.organization.id), eq(organization_setup_items.industry_key, key), eq(organization_setup_items.kind, e.kind), eq(organization_setup_items.key, e.key));
      if (e.change === "nuevo") {
        const i = nowItems.get(ref)!;
        await tx.insert(organization_setup_items).values({ studio_id: studioId, organization_id: diff.organization.id, industry_key: key, kind: i.kind, key: i.key, data: i.data }).onConflictDoNothing();
      } else if (e.change === "cambiado") await tx.update(organization_setup_items).set({ data: nowItems.get(ref)!.data }).where(where);
      else await tx.update(organization_setup_items).set({ removed: true }).where(where);
      applied++;
    }
    await tx
      .update(organization_industries)
      .set({ version: current.version, template_status: current.estado, snapshot: current as never, applied_by: actor.id, applied_at: new Date() })
      .where(and(eq(organization_industries.organization_id, diff.organization.id), eq(organization_industries.industry_key, key)));
  });
  await audit({ studioId, organizationId: diff.organization.id, actor, action: "rubro.actualizar", entityType: "rubro", metadata: { rubro: key, de: diff.applied.version, a: current.version, incorporados: applied, con_cambios_propios: kept } });
  return { applied, kept };
}

/** Rubros aplicados y lo que dejaron, para la ficha de la organización */
export async function organizationSetup(studioId: string, organizationId: string) {
  const org = await orgOf(studioId, organizationId);
  const db = getDb();
  const [applied, items, templates] = await Promise.all([
    db.select().from(organization_industries).where(eq(organization_industries.organization_id, org.id)).orderBy(asc(organization_industries.applied_at)),
    db
      .select()
      .from(organization_setup_items)
      .where(and(eq(organization_setup_items.organization_id, org.id), eq(organization_setup_items.removed, false)))
      .orderBy(asc(organization_setup_items.created_at)),
    listTemplates(),
  ]);
  return {
    organization: org,
    industries: applied.map((a) => {
      const t = templates.find((x) => x.clave === a.industry_key);
      return { key: a.industry_key, name: t?.nombre ?? a.industry_key, version: a.version, status: a.template_status, appliedAt: a.applied_at, latest: t?.version ?? a.version, latestStatus: t?.estado ?? a.template_status };
    }),
    items,
  };
}

/** Edita un ítem: lo marca como propio (customized) para que ninguna actualización lo pise */
export async function updateSetupItem(studioId: string, actor: Actor, organizationId: string, itemId: string, patch: { done?: boolean; label?: string; remove?: boolean }) {
  const org = await orgOf(studioId, organizationId);
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) throw new IndustryError("Ese ítem no existe.");
  const db = getDb();
  const [it] = await db.select().from(organization_setup_items).where(and(eq(organization_setup_items.id, itemId), eq(organization_setup_items.organization_id, org.id), eq(organization_setup_items.studio_id, studioId)));
  if (!it) throw new IndustryError("Ese ítem no existe.");
  const set: Partial<typeof organization_setup_items.$inferSelect> = {};
  if (patch.done !== undefined) set.done = patch.done;
  if (patch.label !== undefined && patch.label.trim()) {
    set.data = { ...it.data, etiqueta: patch.label.trim().slice(0, 200) };
    set.customized = true;
  }
  if (patch.remove) {
    set.removed = true;
    set.customized = true;
  }
  await db.update(organization_setup_items).set(set).where(eq(organization_setup_items.id, it.id));
  await audit({ studioId, organizationId: org.id, actor, action: "rubro.item_editar", entityType: "rubro_item", entityId: it.id, metadata: { tipo: it.kind, clave: it.key, cambios: Object.keys(set) } });
}

export const kindLabel = (k: string) => ITEM_KINDS[k as ItemKind] ?? k;

// ── Validación por estudio ("Plantilla en revisión por el estudio") ──

export const STUDIO_REVIEW_LABEL = "Plantilla en revisión por el estudio";

export type StudioTemplateStatus = { state: "validada_faro" | "validada_estudio" | "en_revision"; label: string; by?: string; at?: Date };

/** Estado de cada plantilla para un estudio: validada por Faro, por el propio estudio (versión vigente) o en revisión */
export async function studioTemplateStatuses(studioId: string): Promise<Record<string, StudioTemplateStatus>> {
  const [templates, rows] = await Promise.all([listTemplates(), getDb().select().from(studio_template_validations).where(eq(studio_template_validations.studio_id, studioId))]);
  return Object.fromEntries(
    templates.map((t) => {
      if (t.estado === "validada") return [t.clave, { state: "validada_faro", label: `Validada por ${t.validado_por?.nombre ?? "un profesional"}` }];
      const v = rows.find((r) => r.industry_key === t.clave && r.version === t.version);
      return [t.clave, v ? { state: "validada_estudio", label: `Validada por el estudio (${v.validated_by_name})`, by: v.validated_by_name, at: v.validated_at } : { state: "en_revision", label: STUDIO_REVIEW_LABEL }];
    }),
  );
}

/** El estudio marca como validada la versión vigente de una plantilla (queda en la auditoría) */
export async function validateForStudio(studioId: string, actor: Actor & { name: string }, key: string, note?: string) {
  const t = await getTemplate(key);
  if (!t) throw new IndustryError("Ese rubro no existe.");
  await getDb()
    .insert(studio_template_validations)
    .values({ studio_id: studioId, industry_key: key, version: t.version, validated_by: actor.id, validated_by_name: actor.name, note: note?.trim().slice(0, 500) || null })
    .onConflictDoNothing();
  await audit({ studioId, actor, action: "rubro.validar_estudio", entityType: "rubro", metadata: { rubro: key, version: t.version, nota: note || null } });
}

export async function revokeStudioValidation(studioId: string, actor: Actor, key: string) {
  const t = await getTemplate(key);
  if (!t) throw new IndustryError("Ese rubro no existe.");
  await getDb()
    .delete(studio_template_validations)
    .where(and(eq(studio_template_validations.studio_id, studioId), eq(studio_template_validations.industry_key, key), eq(studio_template_validations.version, t.version)));
  await audit({ studioId, actor, action: "rubro.validar_estudio_quitar", entityType: "rubro", metadata: { rubro: key, version: t.version } });
}
