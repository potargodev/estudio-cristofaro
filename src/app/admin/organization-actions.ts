"use server";

import { isIndustryKey } from "@/modules/industries/catalog";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { leads, legal_entities, organization_modules, organization_staff, organizations, service_plans, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { organizationLimitError } from "@/lib/faro/entitlements";
import { requireOperator } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { getModule, isModuleKey } from "@/lib/modules/catalog";
import { checkLimit, getOrgLimits, studioOrganization } from "@/lib/organizations";
import { insertOrganization } from "@/lib/organizations-write";
import type { OrganizationStatus, RiskLevel, TaxRegime } from "@/lib/types";

// Alta y edición de organizaciones, razones sociales y equipo del estudio.
// Todas validan la sesión de staff y que todo lo que se toca sea de su estudio.

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function lines(fd: FormData, key: string): string[] {
  return (s(fd, key) ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function pgCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

const REGIMES: TaxRegime[] = ["monotributo", "responsable_inscripto", "sociedad", "exento", "otro"];
const STATUSES: OrganizationStatus[] = ["onboarding", "activa", "pausada", "baja"];
const RISKS: RiskLevel[] = ["bajo", "medio", "alto"];

const ficha = (id: string, tab = "general", extra = "") => `/admin/organizaciones/${id}?tab=${tab}${extra ? `&${extra}` : ""}`;

function revalidateOrg(id: string) {
  revalidatePath("/admin/organizaciones");
  revalidatePath(`/admin/organizaciones/${id}`);
  revalidatePath("/portal", "layout");
}

const cleanCuit = (v: string | null) => v?.replace(/[^0-9]/g, "") || null;

function legalEntityPayload(fd: FormData, fallbackName: string) {
  const regime = s(fd, "regime") as TaxRegime | null;
  return {
    business_name: s(fd, "business_name") ?? fallbackName,
    cuit: cleanCuit(s(fd, "cuit")),
    regime: regime && REGIMES.includes(regime) ? regime : ("otro" as const),
    category: s(fd, "category"),
    tax_address: s(fd, "tax_address"),
  };
}

/** Usuario activo del estudio con rol de staff, o null */
async function studioStaff(userId: string | null, studioId: string) {
  if (!userId || !isUuid(userId)) return null;
  const [u] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.studioId, studioId), inArray(users.role, ["dueno", "contador", "colaborador"]), eq(users.active, true)));
  return u?.id ?? null;
}

async function studioPlan(planId: string | null, studioId: string) {
  if (!planId || !isUuid(planId)) return null;
  const [p] = await getDb()
    .select({ id: service_plans.id, name: service_plans.name })
    .from(service_plans)
    .where(and(eq(service_plans.id, planId), eq(service_plans.studio_id, studioId)));
  return p ?? null;
}

export async function createOrganization(fd: FormData) {
  const staff = await requireOperator();
  const name = s(fd, "name");
  if (!name) redirect("/admin/organizaciones/nueva?error=nombre");
  const limit = await organizationLimitError(staff.studioId);
  if (limit) redirect(`/admin/organizaciones/nueva?error=limite&msg=${encodeURIComponent(limit)}`);
  const plan = await studioPlan(s(fd, "service_plan_id"), staff.studioId);
  let created: { organizationId: string } | null = null;
  let code: string | undefined;
  try {
    created = await insertOrganization(getDb(), {
      studioId: staff.studioId,
      name,
      legalEntity: legalEntityPayload(fd, name),
      contact: { contact_name: s(fd, "contact_name"), email: s(fd, "email")?.toLowerCase() ?? null, phone: s(fd, "phone") },
      notes: s(fd, "notes"),
      servicePlanId: plan?.id ?? null,
      responsableId: await studioStaff(s(fd, "responsable_id"), staff.studioId),
    });
  } catch (error) {
    code = pgCode(error);
    if (code !== "23505") console.error("[admin] createOrganization", error);
  }
  if (!created) redirect(`/admin/organizaciones/nueva?error=${code === "23505" ? "cuit" : "guardar"}`);
  await audit({
    studioId: staff.studioId,
    organizationId: created.organizationId,
    actor: staff,
    action: "organizacion.crear",
    entityType: "organizacion",
    entityId: created.organizationId,
    metadata: { nombre: name, plan: plan?.name ?? null },
  });
  revalidateOrg(created.organizationId);
  // Con rubro elegido: vista previa de la plantilla antes de confirmar
  const rubro = s(fd, "industry");
  if (rubro && isIndustryKey(rubro)) redirect(`/admin/organizaciones/${created.organizationId}/rubro/${rubro}?nueva=1`);
  redirect(ficha(created.organizationId, "general", "nueva=1"));
}

export async function updateOrganization(fd: FormData) {
  const staff = await requireOperator();
  const org = await studioOrganization(s(fd, "id"), staff.studioId);
  if (!org) redirect("/admin/organizaciones");
  const status = s(fd, "status") as OrganizationStatus | null;
  const risk = s(fd, "risk_level") as RiskLevel | null;
  const fee = s(fd, "monthly_fee");
  const feeNumber = fee ? Number(fee.replace(/\./g, "").replace(",", ".")) || null : null;
  const changes = {
    name: s(fd, "name") ?? org.name,
    status: status && STATUSES.includes(status) ? status : org.status,
    risk_level: risk && RISKS.includes(risk) ? risk : org.risk_level,
    contact_name: s(fd, "contact_name"),
    email: s(fd, "email")?.toLowerCase() ?? null,
    phone: s(fd, "phone"),
    services: lines(fd, "services"),
    monthly_fee: feeNumber != null ? feeNumber.toFixed(2) : null,
    notes: s(fd, "notes"),
  };
  await getDb()
    .update(organizations)
    .set(changes)
    .where(and(eq(organizations.id, org.id), eq(organizations.studio_id, staff.studioId)));
  const changed = (Object.keys(changes) as (keyof typeof changes)[]).filter((k) => String(changes[k]) !== String(org[k]));
  if (changed.length) {
    await audit({
      studioId: staff.studioId,
      organizationId: org.id,
      actor: staff,
      action: "organizacion.editar",
      entityType: "organizacion",
      entityId: org.id,
      metadata: { campos: changed, ...(changed.includes("status") ? { estado: changes.status } : {}) },
    });
  }
  revalidateOrg(org.id);
  redirect(ficha(org.id, "general", "guardado=1"));
}

// ───────────── razones sociales ─────────────

export async function saveLegalEntity(fd: FormData) {
  const staff = await requireOperator();
  const org = await studioOrganization(s(fd, "organization_id"), staff.studioId);
  if (!org) redirect("/admin/organizaciones");
  const id = s(fd, "id");
  const db = getDb();
  const payload = { ...legalEntityPayload(fd, org.name), active: fd.get("active") !== null || !id };
  try {
    if (id && isUuid(id)) {
      await db
        .update(legal_entities)
        .set(payload)
        .where(and(eq(legal_entities.id, id), eq(legal_entities.organization_id, org.id), eq(legal_entities.studio_id, staff.studioId)));
      await audit({
        studioId: staff.studioId,
        organizationId: org.id,
        actor: staff,
        action: "razon_social.editar",
        entityType: "razon_social",
        entityId: id,
        metadata: { razon_social: payload.business_name, cuit: payload.cuit },
      });
    } else {
      // Límite de razones sociales del plan (salvo excepción otorgada por el estudio)
      const limitError = checkLimit(await getOrgLimits(org.id), "legal_entities");
      if (limitError) {
        await audit({
          studioId: staff.studioId,
          organizationId: org.id,
          actor: staff,
          action: "razon_social.crear",
          result: "denegado",
          metadata: { motivo: "límite del plan" },
        });
        redirect(ficha(org.id, "general", `error=${encodeURIComponent(limitError)}`));
      }
      const [le] = await db
        .insert(legal_entities)
        .values({ ...payload, studio_id: staff.studioId, organization_id: org.id })
        .returning({ id: legal_entities.id });
      await audit({
        studioId: staff.studioId,
        organizationId: org.id,
        actor: staff,
        action: "razon_social.crear",
        entityType: "razon_social",
        entityId: le.id,
        metadata: { razon_social: payload.business_name, cuit: payload.cuit },
      });
    }
  } catch (error) {
    if (pgCode(error) === "23505")
      redirect(ficha(org.id, "general", `error=${encodeURIComponent("Ya hay una razón social con ese CUIT en el estudio.")}`));
    throw error;
  }
  revalidateOrg(org.id);
  redirect(ficha(org.id, "general", "guardado=1"));
}

export async function deleteLegalEntity(fd: FormData) {
  const staff = await requireOperator();
  const org = await studioOrganization(s(fd, "organization_id"), staff.studioId);
  if (!org) redirect("/admin/organizaciones");
  const id = s(fd, "id");
  const db = getDb();
  const all = await db.select({ id: legal_entities.id }).from(legal_entities).where(eq(legal_entities.organization_id, org.id));
  // Siempre queda al menos una razón social
  if (all.length <= 1)
    redirect(ficha(org.id, "general", `error=${encodeURIComponent("La organización tiene que tener al menos una razón social.")}`));
  if (id && isUuid(id)) {
    const [le] = await db
      .delete(legal_entities)
      .where(and(eq(legal_entities.id, id), eq(legal_entities.organization_id, org.id), eq(legal_entities.studio_id, staff.studioId)))
      .returning({ name: legal_entities.business_name, cuit: legal_entities.cuit });
    if (le) {
      await audit({
        studioId: staff.studioId,
        organizationId: org.id,
        actor: staff,
        action: "razon_social.eliminar",
        entityType: "razon_social",
        entityId: id,
        metadata: { razon_social: le.name, cuit: le.cuit },
      });
    }
  }
  revalidateOrg(org.id);
  redirect(ficha(org.id, "general", "guardado=1"));
}

// ───────────── equipo del estudio ─────────────

export async function assignStaff(fd: FormData) {
  const staff = await requireOperator();
  const org = await studioOrganization(s(fd, "organization_id"), staff.studioId);
  if (!org) redirect("/admin/organizaciones");
  const userId = await studioStaff(s(fd, "user_id"), staff.studioId);
  if (!userId) redirect(ficha(org.id, "equipo", "error=usuario"));
  const assignment = s(fd, "assignment") === "responsable" ? "responsable" : "colaborador";
  const db = getDb();
  await db.transaction(async (tx) => {
    // Un solo responsable principal: el anterior pasa a colaborador
    if (assignment === "responsable") {
      await tx
        .update(organization_staff)
        .set({ assignment: "colaborador" })
        .where(and(eq(organization_staff.organization_id, org.id), eq(organization_staff.assignment, "responsable")));
    }
    await tx
      .insert(organization_staff)
      .values({ organization_id: org.id, user_id: userId, assignment })
      .onConflictDoUpdate({ target: [organization_staff.organization_id, organization_staff.user_id], set: { assignment } });
  });
  await audit({
    studioId: staff.studioId,
    organizationId: org.id,
    actor: staff,
    action: "equipo.asignar",
    entityType: "usuario",
    entityId: userId,
    metadata: { asignacion: assignment },
  });
  revalidateOrg(org.id);
  redirect(ficha(org.id, "equipo", "guardado=1"));
}

export async function removeStaff(fd: FormData) {
  const staff = await requireOperator();
  const org = await studioOrganization(s(fd, "organization_id"), staff.studioId);
  if (!org) redirect("/admin/organizaciones");
  const userId = s(fd, "user_id");
  if (userId && isUuid(userId)) {
    const rows = await getDb()
      .delete(organization_staff)
      .where(and(eq(organization_staff.organization_id, org.id), eq(organization_staff.user_id, userId)))
      .returning({ user: organization_staff.user_id });
    if (rows.length) {
      await audit({
        studioId: staff.studioId,
        organizationId: org.id,
        actor: staff,
        action: "equipo.quitar",
        entityType: "usuario",
        entityId: userId,
      });
    }
  }
  revalidateOrg(org.id);
  redirect(ficha(org.id, "equipo"));
}

// ───────────── consultas → organización ─────────────

const REGIME_BY_TYPE: Record<string, TaxRegime> = {
  monotributista: "monotributo",
  responsable_inscripto: "responsable_inscripto",
  sociedad: "sociedad",
};

/** "Convertir consulta en cliente": crea la organización y su razón social con los datos de la consulta */
export async function convertLeadToOrganization(fd: FormData) {
  const staff = await requireOperator();
  const leadId = s(fd, "id");
  if (!leadId || !isUuid(leadId)) return;
  const db = getDb();
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.studio_id, staff.studioId)));
  if (!lead) redirect("/admin/consultas");
  if (lead.organization_id) redirect(ficha(lead.organization_id));
  const limit = await organizationLimitError(staff.studioId);
  if (limit) redirect(`/admin/consultas/${lead.id}?error=${encodeURIComponent(limit)}`);

  let orgId: string | null = null;
  try {
    const name = lead.company || lead.name;
    const created = await insertOrganization(db, {
      studioId: staff.studioId,
      name,
      legalEntity: { business_name: name, cuit: null, regime: REGIME_BY_TYPE[lead.contributor_type ?? ""] ?? "otro" },
      contact: { contact_name: lead.name, email: lead.email?.toLowerCase() ?? null, phone: lead.phone },
      notes: [lead.activity && `Actividad: ${lead.activity}`, lead.notes].filter(Boolean).join("\n\n") || null,
      services: lead.needs ?? [],
      leadId: lead.id,
      responsableId: await studioStaff(lead.assigned_to, staff.studioId),
    });
    orgId = created.organizationId;
    await db
      .update(leads)
      .set({ status: "ganado", organization_id: orgId })
      .where(and(eq(leads.id, lead.id), eq(leads.studio_id, staff.studioId)));
  } catch (error) {
    console.error("[admin] convertLeadToOrganization", error);
  }
  if (!orgId) redirect(`/admin/consultas/${leadId}?error=convertir`);
  await audit({
    studioId: staff.studioId,
    organizationId: orgId,
    actor: staff,
    action: "organizacion.crear",
    entityType: "organizacion",
    entityId: orgId,
    metadata: { origen: "consulta", consulta: lead.id },
  });
  revalidatePath("/admin/consultas");
  revalidateOrg(orgId);
  redirect(ficha(orgId, "general", "nueva=1"));
}

// ───────────── plan, módulos y excepciones ─────────────

export async function setOrganizationPlan(fd: FormData) {
  const staff = await requireOperator();
  const org = await studioOrganization(s(fd, "organization_id"), staff.studioId);
  if (!org) redirect("/admin/organizaciones");
  const planId = s(fd, "service_plan_id");
  const plan = planId ? await studioPlan(planId, staff.studioId) : null;
  if (planId && !plan) redirect(ficha(org.id, "plan", "error=plan"));
  if ((plan?.id ?? null) !== org.service_plan_id) {
    const [before] = org.service_plan_id
      ? await getDb().select({ name: service_plans.name }).from(service_plans).where(eq(service_plans.id, org.service_plan_id))
      : [];
    await getDb()
      .update(organizations)
      .set({ service_plan_id: plan?.id ?? null })
      .where(and(eq(organizations.id, org.id), eq(organizations.studio_id, staff.studioId)));
    await audit({
      studioId: staff.studioId,
      organizationId: org.id,
      actor: staff,
      action: "organizacion.plan",
      entityType: "organizacion",
      entityId: org.id,
      metadata: { de: before?.name ?? "sin plan", a: plan?.name ?? "sin plan" },
    });
  }
  revalidateOrg(org.id);
  redirect(ficha(org.id, "plan", "guardado=1"));
}

/** Activa o desactiva un módulo del catálogo (al activar, respeta el límite del plan) */
export async function setOrganizationModule(fd: FormData) {
  const staff = await requireOperator();
  const org = await studioOrganization(s(fd, "organization_id"), staff.studioId);
  if (!org) redirect("/admin/organizaciones");
  const key = s(fd, "module_key");
  if (!isModuleKey(key)) redirect(ficha(org.id, "plan", "error=modulo"));
  const activate = s(fd, "active") === "1";
  const db = getDb();
  const [current] = await db
    .select({ active: organization_modules.active })
    .from(organization_modules)
    .where(and(eq(organization_modules.organization_id, org.id), eq(organization_modules.module_key, key)));
  if (activate && !current?.active) {
    const limitError = checkLimit(await getOrgLimits(org.id), "modules");
    if (limitError) {
      await audit({
        studioId: staff.studioId,
        organizationId: org.id,
        actor: staff,
        action: "modulo.activar",
        result: "denegado",
        metadata: { modulo: key, motivo: "límite del plan" },
      });
      redirect(ficha(org.id, "plan", `error=${encodeURIComponent(limitError)}`));
    }
  }
  if (activate !== Boolean(current?.active)) {
    await db
      .insert(organization_modules)
      .values({ organization_id: org.id, module_key: key, active: activate, activated_by: staff.id })
      .onConflictDoUpdate({
        target: [organization_modules.organization_id, organization_modules.module_key],
        set: activate ? { active: true, activated_by: staff.id, activated_at: new Date() } : { active: false },
      });
    await audit({
      studioId: staff.studioId,
      organizationId: org.id,
      actor: staff,
      action: activate ? "modulo.activar" : "modulo.desactivar",
      entityType: "modulo",
      entityId: key,
      metadata: { modulo: getModule(key)?.name ?? key },
    });
  }
  revalidateOrg(org.id);
  redirect(ficha(org.id, "plan", "guardado=1"));
}

/** Excepción explícita a los límites del plan: requiere motivo y queda auditada */
export async function setLimitOverrides(fd: FormData) {
  const staff = await requireOperator();
  const org = await studioOrganization(s(fd, "organization_id"), staff.studioId);
  if (!org) redirect("/admin/organizaciones");
  const reason = s(fd, "reason");
  if (!reason) redirect(ficha(org.id, "plan", `error=${encodeURIComponent("Escribí el motivo de la excepción: queda en la auditoría.")}`));
  const num = (k: string) => Math.min(50, Math.max(0, Math.trunc(Number(s(fd, k) ?? 0)) || 0));
  const overrides = { legal_entities: num("legal_entities"), users: num("users"), modules: num("modules") };
  await getDb()
    .update(organizations)
    .set({ limit_overrides: overrides })
    .where(and(eq(organizations.id, org.id), eq(organizations.studio_id, staff.studioId)));
  await audit({
    studioId: staff.studioId,
    organizationId: org.id,
    actor: staff,
    action: "organizacion.excepcion",
    entityType: "organizacion",
    entityId: org.id,
    metadata: {
      motivo: reason,
      antes: org.limit_overrides,
      extra_razones_sociales: overrides.legal_entities,
      extra_usuarios: overrides.users,
      extra_modulos: overrides.modules,
    },
  });
  revalidateOrg(org.id);
  redirect(ficha(org.id, "plan", "guardado=1"));
}
