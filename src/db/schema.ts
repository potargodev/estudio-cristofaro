// Esquema de la base (Postgres + Drizzle). Las migraciones se generan en /drizzle
// con `npm run db:generate`.
// Base preparada para multi-estudio: todas las tablas de datos llevan studio_id y
// cada query del backoffice filtra por el estudio del usuario.
//
// Las tablas de datos usan nombres en snake_case también del lado de TypeScript
// para coincidir con los tipos de src/lib/types.ts. Las de autenticación (users,
// sessions, accounts, verifications) siguen los nombres que espera Better Auth.

import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
// updated_at se actualiza desde la app en cada update de Drizzle
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ───────────────────────── Enums ─────────────────────────

// admin = dueño del estudio; colaborador = equipo operativo; autonomo = Faro Personal
// Roles de tenant: estudio (dueno, contador, colaborador) y personal (titular).
// cliente = miembro de una organización (su rol vive en memberships).
export const userRole = pgEnum("user_role", ["dueno", "contador", "cliente", "colaborador", "titular"]);
export const tenantKind = pgEnum("tenant_kind", ["studio", "personal", "persona"]);
export const tenantStatus = pgEnum("tenant_status", ["activo", "prueba", "suspendido"]);
export const leadStatus = pgEnum("lead_status", ["nuevo", "contactado", "presupuesto", "ganado", "perdido"]);
export const leadSource = pgEnum("lead_source", ["diagnostico", "contacto", "whatsapp", "manual", "otro", "agenda"]);
export const taxRegime = pgEnum("tax_regime", ["monotributo", "responsable_inscripto", "sociedad", "exento", "otro"]);
export const obligationStatus = pgEnum("obligation_status", ["pendiente", "en_proceso", "presentado", "pagado", "vencido"]);
export const documentSource = pgEnum("document_source", ["estudio", "cliente"]);
export const requestType = pgEnum("request_type", ["consulta", "factura", "empleado", "otro"]);
export const requestStatus = pgEnum("request_status", ["abierta", "en_curso", "resuelta"]);
export const integrationType = pgEnum("integration_type", ["tango"]);
export const integrationStatus = pgEnum("integration_status", ["activa", "pausada"]);
export const syncStatus = pgEnum("sync_status", ["en_curso", "ok", "error"]);
export const organizationStatus = pgEnum("organization_status", ["onboarding", "activa", "pausada", "baja"]);
export const riskLevel = pgEnum("risk_level", ["bajo", "medio", "alto"]);
export const orgRole = pgEnum("org_role", ["administrador", "direccion", "administracion", "rrhh", "consulta", "empleado"]);
export const membershipStatus = pgEnum("membership_status", ["activa", "suspendida", "revocada"]);
export const invitationStatus = pgEnum("invitation_status", ["pendiente", "aceptada", "revocada", "vencida"]);
export const staffAssignment = pgEnum("staff_assignment", ["responsable", "colaborador"]);
export const auditResult = pgEnum("audit_result", ["ok", "denegado", "error"]);
export const bookingStatus = pgEnum("booking_status", ["confirmada", "cancelada"]);
export const bookingOrigin = pgEnum("booking_origin", ["web", "portal", "estudio"]);

// ───────────────────────── Estudios ─────────────────────────

// Tenant de Faro: un estudio contable (kind studio) o un autónomo de Faro
// Personal (kind personal). El plan es una clave de src/lib/faro/plans.ts.
export const studios = pgTable("studios", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: tenantKind("kind").notNull().default("studio"),
  plan_key: text("plan_key").notNull().default("inicial"),
  status: tenantStatus("status").notNull().default("activo"),
  /** CUIT del autónomo (personal) o del estudio */
  cuit: text("cuit"),
  /** manual (Faro Manager) | registro (autoregistro) | seed */
  created_via: text("created_via").notNull().default("manual"),
  suspended_reason: text("suspended_reason"),
  /** Dueño del tenant (dueño del estudio o titular de la cuenta personal) */
  owner_user_id: uuid("owner_user_id"),
  /** Límites propios que pisan los del plan (los pone el Faro Manager) */
  limits: jsonb("limits").$type<Record<string, number | null>>().notNull().default({}),
  /** Rubros que atiende el estudio o rubro del autónomo (claves de /data/industries) */
  industries: text("industries").array().notNull().default(sql`'{}'::text[]`),
  /** Datos fiscales del tenant */
  legal_name: text("legal_name"),
  tax_regime: text("tax_regime"),
  fiscal_address: text("fiscal_address"),
  /** Fin del período de prueba (estado "prueba") */
  trial_ends_at: timestamp("trial_ends_at", { withTimezone: true }),
  /** Notas internas del Faro Manager */
  notes: text("notes"),
  /** Pasos del onboarding completados */
  onboarding: jsonb("onboarding").$type<Record<string, boolean>>().notNull().default({}),
  created_at: createdAt(),
});

// ───────────────────────── Usuarios (Better Auth) ─────────────────────────
// El rol y el estudio de cada usuario viven en el mismo registro (campos
// extra de Better Auth).

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: userRole("role").notNull().default("contador"),
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    // Desactivar en lugar de borrar: conserva el historial (responsable de consultas, etc.)
    active: boolean("active").notNull().default(true),
    // Contraseña temporal (scripts/reset-password.ts): hay que cambiarla al entrar
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    // Segundo factor (plugin twoFactor de Better Auth): obligatorio para el estudio
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    // Nivel plataforma (Faro Manager): faro_owner | faro_support, independiente del rol de tenant. Null para el resto.
    faroRole: text("faro_role"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("users_studio_idx").on(t.studioId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

// Secreto TOTP y códigos de respaldo (cifrados por Better Auth) de cada usuario con 2FA
export const two_factors = pgTable(
  "two_factors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verified: boolean("verified").notNull().default(true),
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("two_factors_user_idx").on(t.userId), index("two_factors_secret_idx").on(t.secret)],
);

export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ───────────────────────── Consultas (leads) ─────────────────────────

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    created_at: createdAt(),
    updated_at: updatedAt(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    // monotributista | responsable_inscripto | sociedad | empleador | emprendedor | otro
    contributor_type: text("contributor_type"),
    activity: text("activity"),
    employees: text("employees"),
    needs: text("needs")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    message: text("message"),
    source: leadSource("source").notNull().default("contacto"),
    status: leadStatus("status").notNull().default("nuevo"),
    assigned_to: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    next_action: text("next_action"),
    next_action_at: date("next_action_at"),
    notes: text("notes"),
    lost_reason: text("lost_reason"),
    organization_id: uuid("organization_id").references((): AnyPgColumn => organizations.id, { onDelete: "set null" }),
  },
  (t) => [index("leads_studio_status_idx").on(t.studio_id, t.status)],
);

// ───────────────────────── Planes de servicio ─────────────────────────
// Planes comerciales que contrata cada organización (Negocio en Orden, Empresa
// en Control, Gestión Estratégica). No confundir con `plans`, que son las
// tarjetas de precios de la web pública.

export const service_plans = pgTable(
  "service_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // negocio_en_orden | empresa_en_control | gestion_estrategica
    name: text("name").notNull(),
    description: text("description"),
    max_legal_entities: integer("max_legal_entities").notNull(),
    max_users: integer("max_users").notNull(),
    max_modules: integer("max_modules").notNull(),
    features: text("features")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    position: integer("position").notNull().default(0),
    active: boolean("active").notNull().default(true),
    /** Precio que muestra la web, ej. "desde $450.000/mes" (vacío: "Consultá el precio") */
    price_label: text("price_label"),
    created_at: createdAt(),
  },
  (t) => [unique("service_plans_studio_key").on(t.studio_id, t.key)],
);

// ───────────────────────── Organizaciones ─────────────────────────
// Empresa cliente: espacio aislado con sus razones sociales, miembros, módulos
// y responsables del estudio. Reemplaza a la vieja tabla `clients` (los ids se
// conservaron en la migración, así los links viejos siguen funcionando).

export interface LimitOverrides {
  legal_entities?: number;
  users?: number;
  modules?: number;
}

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    service_plan_id: uuid("service_plan_id").references(() => service_plans.id, { onDelete: "set null" }),
    status: organizationStatus("status").notNull().default("onboarding"),
    risk_level: riskLevel("risk_level").notNull().default("bajo"),
    notes: text("notes"),
    contact_name: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    services: text("services")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    monthly_fee: numeric("monthly_fee", { precision: 12, scale: 2 }),
    // Excepciones a los límites del plan, otorgadas por el estudio (quedan auditadas)
    limit_overrides: jsonb("limit_overrides").$type<LimitOverrides>().notNull().default({}),
    lead_id: uuid("lead_id").references((): AnyPgColumn => leads.id, { onDelete: "set null" }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("organizations_studio_idx").on(t.studio_id, t.name)],
);

// Razones sociales (CUIT) de cada organización. El CUIT es único por estudio.
export const legal_entities = pgTable(
  "legal_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    cuit: text("cuit"),
    business_name: text("business_name").notNull(),
    regime: taxRegime("regime").notNull().default("otro"),
    category: text("category"), // categoría de monotributo, tipo societario, etc.
    tax_address: text("tax_address"), // domicilio fiscal
    active: boolean("active").notNull().default(true),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    uniqueIndex("legal_entities_studio_cuit_idx")
      .on(t.studio_id, t.cuit)
      .where(sql`${t.cuit} is not null`),
    index("legal_entities_org_idx").on(t.organization_id),
  ],
);

// Equipo del estudio asignado a cada organización: un responsable principal y colaboradores
export const organization_staff = pgTable(
  "organization_staff",
  {
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignment: staffAssignment("assignment").notNull().default("colaborador"),
    created_at: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.organization_id, t.user_id] }),
    uniqueIndex("organization_staff_one_lead_idx")
      .on(t.organization_id)
      .where(sql`${t.assignment} = 'responsable'`),
  ],
);

// Miembros de cada organización con su rol. Un usuario puede pertenecer a varias.
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRole("role").notNull().default("consulta"),
    status: membershipStatus("status").notNull().default("activa"),
    invited_by: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [unique("memberships_org_user_key").on(t.organization_id, t.user_id), index("memberships_user_idx").on(t.user_id)],
);

/**
 * Nivel empleado: personas que trabajan en una organización. El legajo
 * completo llega con el módulo employees (F5); acá viven los datos básicos y,
 * si tiene cuenta, el usuario con el que entra a /portal/empleado.
 */
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    first_name: text("first_name").notNull(),
    last_name: text("last_name").notNull().default(""),
    email: text("email"),
    cuil: text("cuil"),
    position: text("position"),
    start_date: date("start_date"),
    active: boolean("active").notNull().default(true),
    user_id: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [
    index("employees_org_idx").on(t.organization_id),
    uniqueIndex("employees_org_user_idx").on(t.organization_id, t.user_id).where(sql`${t.user_id} is not null`),
    uniqueIndex("employees_org_email_idx").on(t.organization_id, t.email).where(sql`${t.email} is not null`),
  ],
);

// Invitaciones: el token viaja solo en el mail; acá se guarda su SHA-256.
// Las de roles sensibles que crea un admin de la organización quedan
// pendientes de confirmación del estudio (needs_approval sin approved_at).
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    role: orgRole("role").notNull(),
    token_hash: text("token_hash").notNull().unique(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: invitationStatus("status").notNull().default("pendiente"),
    invited_by: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    needs_approval: boolean("needs_approval").notNull().default(false),
    approved_by: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approved_at: timestamp("approved_at", { withTimezone: true }),
    accepted_by: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    accepted_at: timestamp("accepted_at", { withTimezone: true }),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [index("invitations_org_idx").on(t.organization_id, t.status), index("invitations_email_idx").on(t.email, t.status)],
);

// Módulos del catálogo (src/lib/modules/catalog.ts) habilitados por organización
export const organization_modules = pgTable(
  "organization_modules",
  {
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    module_key: text("module_key").notNull(),
    active: boolean("active").notNull().default(true),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    activated_by: uuid("activated_by").references(() => users.id, { onDelete: "set null" }),
    activated_at: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.organization_id, t.module_key] })],
);

// ───────────────────────── Auditoría ─────────────────────────
// Toda acción sensible (src/lib/audit.ts). Es solo de escritura desde la app:
// no se edita ni se borra.

export const audit_log = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id").references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    actor_id: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actor_label: text("actor_label"), // email o "sistema", para leerlo aunque se borre el usuario
    action: text("action").notNull(), // ej: invitacion.crear, documento.descargar
    entity_type: text("entity_type"),
    entity_id: text("entity_id"),
    result: auditResult("result").notNull().default("ok"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    created_at: createdAt(),
  },
  (t) => [index("audit_log_org_idx").on(t.organization_id, t.created_at), index("audit_log_studio_idx").on(t.studio_id, t.created_at)],
);

// ───────────────────────── Contenidos ─────────────────────────

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    body: text("body").notNull().default(""),
    published: boolean("published").notNull().default(false),
    published_at: timestamp("published_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [unique("posts_studio_slug_key").on(t.studio_id, t.slug)],
);

export const faqs = pgTable("faqs", {
  id: uuid("id").primaryKey().defaultRandom(),
  studio_id: uuid("studio_id")
    .notNull()
    .references(() => studios.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  position: integer("position").notNull().default(0),
  published: boolean("published").notNull().default(true),
  created_at: createdAt(),
});

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  studio_id: uuid("studio_id")
    .notNull()
    .references(() => studios.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  segment: text("segment"), // monotributistas | pymes-y-sociedades | empleadores | emprendedores
  price_label: text("price_label"), // ej: "Desde $45.000 / mes". Vacío = "Consultá"
  description: text("description"),
  features: text("features")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  highlighted: boolean("highlighted").notNull().default(false),
  position: integer("position").notNull().default(0),
  published: boolean("published").notNull().default(true),
  created_at: createdAt(),
});

// ───────────────────────── Fase 2: portal del cliente ─────────────────────────

// Vencimientos por organización (y razón social, si aplica)
export const obligations = pgTable(
  "obligations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organizations.id, { onDelete: "cascade" }),
    legal_entity_id: uuid("legal_entity_id").references((): AnyPgColumn => legal_entities.id, { onDelete: "set null" }),
    tax: text("tax").notNull(), // IVA, IIBB, Ganancias, Monotributo, F.931, etc.
    period: text("period").notNull(), // ej: 2026-09
    due_date: date("due_date").notNull(),
    status: obligationStatus("status").notNull().default("pendiente"),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    payment_url: text("payment_url"), // link de pago o VEP (opcional)
    assigned_to: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("obligations_due_idx").on(t.studio_id, t.due_date), index("obligations_org_idx").on(t.organization_id, t.due_date)],
);

// Documentos: archivos en disco (UPLOADS_DIR) con nombre aleatorio; acá el nombre original.
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organizations.id, { onDelete: "cascade" }),
    legal_entity_id: uuid("legal_entity_id").references((): AnyPgColumn => legal_entities.id, { onDelete: "set null" }),
    name: text("name").notNull(), // nombre original del archivo
    storage_path: text("storage_path").notNull(), // ruta relativa dentro de UPLOADS_DIR
    mime_type: text("mime_type"),
    size_bytes: integer("size_bytes"),
    category: text("category"), // comprobantes, constancias, ddjj, recibos, solicitud, otro
    period: text("period"), // ej: 2026-09
    source: documentSource("source").notNull().default("estudio"),
    uploaded_by: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    // Documentos subidos por el cliente: null hasta que alguien del estudio los ve
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    // Documentos que llegan por una conexión (Google Drive): fuente e ID externo
    external_source: text("external_source"),
    external_id: text("external_id"),
    created_at: createdAt(),
  },
  (t) => [index("documents_org_idx").on(t.organization_id, t.created_at)],
);

// Solicitudes del cliente (consulta, pedido de factura, alta o baja de empleado, otro)
export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organizations.id, { onDelete: "cascade" }),
    legal_entity_id: uuid("legal_entity_id").references((): AnyPgColumn => legal_entities.id, { onDelete: "set null" }),
    type: requestType("type").notNull().default("consulta"),
    subject: text("subject").notNull(),
    status: requestStatus("status").notNull().default("abierta"),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("requests_studio_status_idx").on(t.studio_id, t.status), index("requests_org_idx").on(t.organization_id)],
);

// Mensajes de cada solicitud (el primero es el del cliente) con adjunto opcional
export const request_messages = pgTable(
  "request_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    request_id: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    author_id: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    from_client: boolean("from_client").notNull(),
    body: text("body").notNull(),
    document_id: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [index("request_messages_request_idx").on(t.request_id, t.created_at)],
);

// ───────────────────────── Integraciones (Tango Gestión) ─────────────────────────

// Una integración por estudio y tipo. La clave del conector se guarda hasheada
// (SHA-256): se muestra una sola vez al generarla.
export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    type: integrationType("type").notNull(),
    status: integrationStatus("status").notNull().default("activa"),
    connector_key_hash: text("connector_key_hash").unique(),
    key_prefix: text("key_prefix"), // primeros caracteres, para reconocer la clave sin mostrarla
    key_created_at: timestamp("key_created_at", { withTimezone: true }),
    // Mapeo configurable de campos del JSON de Tango (ver src/lib/integrations/tango/mapping.ts)
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    last_seen_at: timestamp("last_seen_at", { withTimezone: true }), // último contacto del conector
    last_sync_at: timestamp("last_sync_at", { withTimezone: true }), // última sincronización completa
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [unique("integrations_studio_type_key").on(t.studio_id, t.type)],
);

// Log de sincronizaciones (y pruebas de conexión) de cada integración
export const integration_syncs = pgTable(
  "integration_syncs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    integration_id: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    sync_id: text("sync_id").notNull(), // id que manda el conector
    kind: text("kind").notNull().default("sync"), // sync | test
    status: syncStatus("status").notNull().default("en_curso"),
    companies: integer("companies").notNull().default(0),
    records: integer("records").notNull().default(0),
    message: text("message"),
    started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finished_at: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    unique("integration_syncs_sync_key").on(t.integration_id, t.sync_id),
    index("integration_syncs_started_idx").on(t.integration_id, t.started_at),
  ],
);

// Empresas de Tango (cada base de datos de Tango). Si el estudio usa una
// empresa por cliente, se puede asignar cada una a una organización.
export const tango_companies = pgTable(
  "tango_companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    company_id: text("company_id").notNull(), // ID de empresa de Tango (header Company)
    name: text("name"),
    organization_id: uuid("organization_id").references((): AnyPgColumn => organizations.id, { onDelete: "set null" }),
    legal_entity_id: uuid("legal_entity_id").references((): AnyPgColumn => legal_entities.id, { onDelete: "set null" }),
    last_sync_at: timestamp("last_sync_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [unique("tango_companies_studio_company_key").on(t.studio_id, t.company_id)],
);

// Registros traídos de Tango, siempre con el JSON crudo. organization_id y
// legal_entity_id vinculan un cliente de Tango (proceso 2117) con una razón social.
export const tango_records = pgTable(
  "tango_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    company_id: text("company_id").notNull(),
    process: integer("process").notNull(), // 2117 = Clientes
    external_id: text("external_id").notNull(),
    raw: jsonb("raw").notNull(),
    organization_id: uuid("organization_id").references((): AnyPgColumn => organizations.id, { onDelete: "set null" }),
    legal_entity_id: uuid("legal_entity_id").references((): AnyPgColumn => legal_entities.id, { onDelete: "set null" }),
    synced_at: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("tango_records_key").on(t.studio_id, t.company_id, t.process, t.external_id), index("tango_records_org_idx").on(t.organization_id)],
);

// ───────────────────────── Agenda (llamadas con Google Meet) ─────────────────────────

/** Franjas de un día: [{ start: "09:00", end: "13:00" }, …] */
export type DayRanges = { start: string; end: string }[];
/** Horario semanal: clave 1 = lunes … 7 = domingo */
export type WeeklyHours = Partial<Record<"1" | "2" | "3" | "4" | "5" | "6" | "7", DayRanges>>;

// Disponibilidad de cada persona del estudio para recibir llamadas
export const availability = pgTable("availability", {
  user_id: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  studio_id: uuid("studio_id")
    .notNull()
    .references(() => studios.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(false), // acepta reservas
  public: boolean("public").notNull().default(false), // aparece en /agendar (web)
  timezone: text("timezone").notNull().default("America/Argentina/Buenos_Aires"),
  weekly: jsonb("weekly").$type<WeeklyHours>().notNull().default({}),
  duration_minutes: integer("duration_minutes").notNull().default(30), // 15 | 30 | 45
  buffer_minutes: integer("buffer_minutes").notNull().default(10), // margen entre llamadas
  min_notice_hours: integer("min_notice_hours").notNull().default(12), // anticipación mínima
  blocked_dates: text("blocked_dates").array().notNull().default(sql`'{}'::text[]`), // YYYY-MM-DD
  manual_meeting_url: text("manual_meeting_url"), // link fijo si no hay Google conectado
  updated_at: updatedAt(),
});

// Conexión con Google Calendar (separada del login). Tokens cifrados con AES-GCM (ENCRYPTION_KEY).
export const calendar_connections = pgTable("calendar_connections", {
  user_id: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  studio_id: uuid("studio_id")
    .notNull()
    .references(() => studios.id, { onDelete: "cascade" }),
  google_email: text("google_email"),
  access_token_enc: text("access_token_enc").notNull(),
  refresh_token_enc: text("refresh_token_enc"),
  expires_at: timestamp("expires_at", { withTimezone: true }),
  scope: text("scope"),
  connected_at: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
});

// Llamadas agendadas (desde la web, el portal o el estudio)
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    host_user_id: uuid("host_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    lead_id: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    origin: bookingOrigin("origin").notNull().default("web"),
    status: bookingStatus("status").notNull().default("confirmada"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    reason: text("reason"),
    starts_at: timestamp("starts_at", { withTimezone: true }).notNull(),
    ends_at: timestamp("ends_at", { withTimezone: true }).notNull(),
    meet_url: text("meet_url"),
    google_event_id: text("google_event_id"),
    // Link para reprogramar o cancelar sin login: solo se guarda el SHA-256
    manage_token_hash: text("manage_token_hash").notNull().unique(),
    sequence: integer("sequence").notNull().default(0), // versión para el .ics
    reminder_24h_at: timestamp("reminder_24h_at", { withTimezone: true }),
    reminder_1h_at: timestamp("reminder_1h_at", { withTimezone: true }),
    cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    index("bookings_host_idx").on(t.host_user_id, t.starts_at),
    index("bookings_studio_idx").on(t.studio_id, t.starts_at),
    index("bookings_org_idx").on(t.organization_id),
    index("bookings_lead_idx").on(t.lead_id),
  ],
);

// ───────────────────────── F2 · IA, MCP y conexiones ─────────────────────────

export const aiProviderKind = pgEnum("ai_provider_kind", ["anthropic", "openai", "google", "openrouter", "azure", "openai_compatible"]);
export const toolOrigin = pgEnum("tool_origin", ["asistente", "mcp", "flujo"]);
export const toolLevel = pgEnum("tool_level", ["lectura", "escritura", "sensible"]);
export const approvalStatus = pgEnum("approval_status", ["pendiente", "ejecutada", "rechazada", "error", "cancelada"]);
export const connectionStatus = pgEnum("connection_status", ["pendiente", "activa", "pausada", "error"]);

/** Proveedores de IA del estudio. La clave va cifrada (AES-GCM con ENCRYPTION_KEY). */
export interface AiProviderSettings {
  /** Azure OpenAI: nombre del recurso y versión de la API */
  resourceName?: string;
  apiVersion?: string;
  /** Modelos que el estudio cargó para este proveedor (para los selectores) */
  models?: string[];
}

export const ai_providers = pgTable(
  "ai_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    kind: aiProviderKind("kind").notNull(),
    name: text("name").notNull(),
    api_key_enc: text("api_key_enc"),
    key_hint: text("key_hint"), // últimos 4 caracteres, para reconocerla
    base_url: text("base_url"),
    settings: jsonb("settings").$type<AiProviderSettings>().notNull().default({}),
    active: boolean("active").notNull().default(true),
    last_test_at: timestamp("last_test_at", { withTimezone: true }),
    last_test_ok: boolean("last_test_ok"),
    last_test_message: text("last_test_message"),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("ai_providers_studio_idx").on(t.studio_id)],
);

export type AiTask = "chat" | "extraccion" | "redaccion";
export interface ModelRef {
  providerId: string;
  model: string;
}

/** Configuración de IA del estudio: modelo por defecto, por tarea y límite de gasto */
export const ai_settings = pgTable("ai_settings", {
  studio_id: uuid("studio_id")
    .primaryKey()
    .references(() => studios.id, { onDelete: "cascade" }),
  default_model: jsonb("default_model").$type<ModelRef | null>(),
  task_models: jsonb("task_models").$type<Partial<Record<AiTask, ModelRef>>>().notNull().default({}),
  monthly_budget_usd: numeric("monthly_budget_usd", { precision: 10, scale: 2 }),
  updated_at: updatedAt(),
});

/** Registro de uso: tokens y costo estimado por llamada */
export const ai_usage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    provider_id: uuid("provider_id").references(() => ai_providers.id, { onDelete: "set null" }),
    provider_kind: text("provider_kind").notNull(),
    model: text("model").notNull(),
    task: text("task").notNull().default("chat"),
    user_id: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    conversation_id: uuid("conversation_id"),
    input_tokens: integer("input_tokens").notNull().default(0),
    output_tokens: integer("output_tokens").notNull().default(0),
    cost_usd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    created_at: createdAt(),
  },
  (t) => [index("ai_usage_studio_idx").on(t.studio_id, t.created_at)],
);

/** Conversaciones del Asistente (cada una es de una persona del estudio) */
export const ai_conversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Conversación nueva"),
    model: jsonb("model").$type<ModelRef | null>(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("ai_conversations_user_idx").on(t.studio_id, t.user_id, t.updated_at)],
);

/** Mensajes en formato UIMessage del AI SDK (partes: texto, herramientas, archivos) */
export const ai_messages = pgTable(
  "ai_messages",
  {
    id: text("id").primaryKey(),
    conversation_id: uuid("conversation_id")
      .notNull()
      .references(() => ai_conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    message: jsonb("message").$type<Record<string, unknown>>().notNull(),
    position: integer("position").notNull().default(0),
    created_at: createdAt(),
  },
  (t) => [index("ai_messages_conversation_idx").on(t.conversation_id, t.position)],
);

/**
 * Propuestas de acción: las herramientas sensibles (y las de escritura que el
 * Asistente pide confirmar) no se ejecutan solas. `input` es el borrador
 * completo; `context` guarda los límites del pedido original (organizaciones
 * permitidas, acceso MCP) para respetarlos al ejecutar.
 */
export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    origin: toolOrigin("origin").notNull(),
    level: toolLevel("level").notNull(),
    tool: text("tool").notNull(),
    title: text("title").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    status: approvalStatus("status").notNull().default("pendiente"),
    requested_by: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    requested_label: text("requested_label"),
    mcp_access_id: uuid("mcp_access_id"),
    conversation_id: uuid("conversation_id"),
    decided_by: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decided_at: timestamp("decided_at", { withTimezone: true }),
    reason: text("reason"),
    edited: boolean("edited").notNull().default(false),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    created_at: createdAt(),
  },
  (t) => [index("approvals_studio_status_idx").on(t.studio_id, t.status, t.created_at)],
);

/** Accesos MCP: con token Bearer (creado en /admin/mcp) o por OAuth 2.1 */
export const mcp_accesses = pgTable(
  "mcp_accesses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("token"), // token | oauth
    oauth_client_id: text("oauth_client_id"),
    /** Módulos permitidos; vacío = todos */
    modules: text("modules").array().notNull().default(sql`'{}'::text[]`),
    can_write: boolean("can_write").notNull().default(false),
    /** null = todas las organizaciones del estudio */
    organization_ids: uuid("organization_ids").array(),
    token_prefix: text("token_prefix"),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    last_used_at: timestamp("last_used_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [index("mcp_accesses_studio_idx").on(t.studio_id, t.created_at)],
);

/** Tokens (SHA-256) de los accesos MCP: Bearer, access y refresh de OAuth y códigos de autorización */
export const mcp_tokens = pgTable(
  "mcp_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    access_id: uuid("access_id")
      .notNull()
      .references(() => mcp_accesses.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // bearer | access | refresh | code
    token_hash: text("token_hash").notNull().unique(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    used_at: timestamp("used_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [index("mcp_tokens_access_idx").on(t.access_id)],
);

/** Clientes OAuth registrados dinámicamente (Claude, ChatGPT…): públicos, con PKCE */
export const oauth_clients = pgTable("oauth_clients", {
  client_id: text("client_id").primaryKey(),
  name: text("name").notNull(),
  redirect_uris: text("redirect_uris").array().notNull(),
  created_at: createdAt(),
});

/** Log de llamadas por acceso MCP */
export const mcp_calls = pgTable(
  "mcp_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    access_id: uuid("access_id")
      .notNull()
      .references(() => mcp_accesses.id, { onDelete: "cascade" }),
    method: text("method").notNull(), // tools/list | tools/call
    tool: text("tool"),
    result: text("result").notNull(), // ok | error | denegado | aprobacion
    duration_ms: integer("duration_ms").notNull().default(0),
    message: text("message"),
    created_at: createdAt(),
  },
  (t) => [index("mcp_calls_access_idx").on(t.access_id, t.created_at)],
);

/**
 * Conexiones del hub (src/modules/connectors). Una fila por cuenta: del estudio
 * (organization_id null) o propia de una organización. Las credenciales van
 * cifradas como JSON. Tango sigue usando `integrations` (su conector local).
 */
export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    connector: text("connector").notNull(), // xubio | google_drive | mcp_externo | archivos
    name: text("name").notNull(),
    organization_id: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    status: connectionStatus("status").notNull().default("pendiente"),
    credentials_enc: text("credentials_enc"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    last_sync_at: timestamp("last_sync_at", { withTimezone: true }),
    last_error: text("last_error"),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("connections_studio_idx").on(t.studio_id, t.connector)],
);

/** Mapeo de recursos externos a organizaciones (carpeta de Drive, empresa de Xubio…) */
export const connection_links = pgTable(
  "connection_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connection_id: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    external_id: text("external_id").notNull(),
    external_name: text("external_name"),
    created_at: createdAt(),
  },
  (t) => [unique("connection_links_key").on(t.connection_id, t.organization_id)],
);

/** Log de sincronizaciones y pruebas de cada conexión */
export const connection_logs = pgTable(
  "connection_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connection_id: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("sync"), // sync | test | import
    status: syncStatus("status").notNull().default("en_curso"),
    records: integer("records").notNull().default(0),
    message: text("message"),
    actor_id: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finished_at: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("connection_logs_idx").on(t.connection_id, t.started_at)],
);

/**
 * Registros traídos por las conexiones (Xubio, archivos, Drive…): fuente,
 * fecha de sincronización, ID externo, estado de validación y registro original.
 */
export const external_records = pgTable(
  "external_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    connection_id: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // xubio | holistor | bejerman | google_drive | …
    resource: text("resource").notNull(), // clientes | comprobantes_venta | comprobantes_compra | asientos | archivos
    external_id: text("external_id").notNull(),
    cuit: text("cuit"),
    name: text("name"),
    record_date: date("record_date"),
    amount: numeric("amount", { precision: 16, scale: 2 }),
    validation_status: text("validation_status").notNull().default("sin_cruzar"), // sin_cruzar | cruzado | validado | con_error
    raw: jsonb("raw").notNull(),
    organization_id: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    legal_entity_id: uuid("legal_entity_id").references(() => legal_entities.id, { onDelete: "set null" }),
    synced_at: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("external_records_key").on(t.connection_id, t.resource, t.external_id),
    index("external_records_org_idx").on(t.organization_id, t.resource),
    index("external_records_studio_idx").on(t.studio_id, t.source, t.resource),
  ],
);

// ───────────────────────── F1 · Núcleo Faro ─────────────────────────

/** Módulos habilitados fuera del plan (o deshabilitados) por el Faro Manager, con vencimiento opcional */
/** Overrides de módulos por tenant (Faro Manager): habilitar o deshabilitar, con vencimiento y motivo */
export const tenant_modules = pgTable(
  "tenant_modules",
  {
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    module_key: text("module_key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    reason: text("reason"),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.studio_id, t.module_key] })],
);

/**
 * Planes de Faro editables desde el Faro Manager. Se siembran desde
 * src/lib/faro/plans.ts (scripts/seed.ts); si la fila no existe, manda la
 * configuración del código.
 */
export const faro_plans = pgTable("faro_plans", {
  key: text("key").primaryKey(),
  kind: tenantKind("kind").notNull(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull().default(""),
  for_whom: text("for_whom").notNull().default(""),
  /** En desuso: el precio se carga en USD (price_usd) y se convierte con faro_settings.usd_ars */
  price_ars: integer("price_ars"),
  price_usd: numeric("price_usd", { precision: 10, scale: 2 }).notNull().default("0"),
  extra_org_usd: numeric("extra_org_usd", { precision: 10, scale: 2 }),
  trial_days: integer("trial_days").notNull().default(0),
  free: boolean("free").notNull().default(false),
  recommended: boolean("recommended").notNull().default(false),
  ai: text("ai").notNull().default("consultas"),
  limits: jsonb("limits").$type<Record<string, number | null>>().notNull().default({}),
  modules: text("modules").array().notNull().default(sql`'{}'::text[]`),
  support: text("support").notNull().default(""),
  position: integer("position").notNull().default(0),
  updated_by: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updated_at: updatedAt(),
});

/** Configuración de la plataforma (Faro Manager): conversión USD → ARS, etc. */
export const faro_settings = pgTable("faro_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updated_by: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updated_at: updatedAt(),
});

/** Liberación global de un módulo (de "próximamente" a "beta" o "disponible") */
export const faro_module_releases = pgTable("faro_module_releases", {
  module_key: text("module_key").primaryKey(),
  status: text("status").notNull(),
  updated_by: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updated_at: updatedAt(),
});

/** "Quiero mejorar mi plan": pedido de un tenant al Faro Manager (el cobro llega en la F7) */
export const plan_requests = pgTable(
  "plan_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    from_plan: text("from_plan").notNull(),
    to_plan: text("to_plan").notNull(),
    module_key: text("module_key"),
    message: text("message"),
    status: text("status").notNull().default("pendiente"), // pendiente | aplicado | descartado
    requested_by: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    resolved_by: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolved_at: timestamp("resolved_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [index("plan_requests_status_idx").on(t.status, t.created_at)],
);

// ───────────────────────── Ecosistemas por industria (§2.f) ─────────────────────────

/**
 * Versiones de las plantillas de rubro editadas desde el Faro Manager. La base
 * es el archivo de /data/industries; cada edición guarda una versión nueva.
 */
export const industry_template_versions = pgTable(
  "industry_template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    industry_key: text("industry_key").notNull(),
    version: integer("version").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("borrador"), // borrador | validada
    validated_by_name: text("validated_by_name"),
    validated_by_license: text("validated_by_license"),
    validated_at: timestamp("validated_at", { withTimezone: true }),
    note: text("note"),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("industry_template_versions_key_idx").on(t.industry_key, t.version)],
);

/** Rubro aplicado a una organización: qué versión y una copia de lo aplicado (para ver diferencias) */
export const organization_industries = pgTable(
  "organization_industries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    industry_key: text("industry_key").notNull(),
    version: integer("version").notNull(),
    /** Estado de la plantilla al aplicarla (borrador = sugerencia a revisar) */
    template_status: text("template_status").notNull().default("borrador"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    applied_by: uuid("applied_by").references(() => users.id, { onDelete: "set null" }),
    applied_at: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("organization_industries_org_idx").on(t.organization_id, t.industry_key)],
);

/**
 * Lo que una plantilla dejó en la organización: obligaciones del rubro,
 * checklist de alta, categorías, tareas, cuentas, indicadores, riesgos,
 * actividades y flujos sugeridos. Si el estudio lo edita queda `customized` y
 * una actualización de la plantilla nunca lo pisa.
 */
export const organization_setup_items = pgTable(
  "organization_setup_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    industry_key: text("industry_key").notNull(),
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    customized: boolean("customized").notNull().default(false),
    done: boolean("done").notNull().default(false),
    removed: boolean("removed").notNull().default(false),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("organization_setup_items_key_idx").on(t.organization_id, t.industry_key, t.kind, t.key), index("organization_setup_items_org_idx").on(t.organization_id, t.kind)],
);

/**
 * Autoregistro sin contraseña (persona o autónomo): lo que cargó en "¿Qué
 * sos?" hasta que entra con Google o con el enlace a su mail. El tenant se crea
 * recién al entrar, con el mismo email.
 */
export const signup_requests = pgTable(
  "signup_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    kind: tenantKind("kind").notNull(),
    name: text("name").notNull(),
    cuit: text("cuit"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    /** Versión de los términos que aceptó */
    terms_version: text("terms_version"),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    used_at: timestamp("used_at", { withTimezone: true }),
    studio_id: uuid("studio_id").references(() => studios.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [index("signup_requests_email_idx").on(t.email, t.created_at)],
);

/**
 * Onboarding guiado (§2.l): progreso por usuario y por espacio (tenant u
 * organización). Los pasos se marcan solos cuando la persona hace la acción
 * real; los tours vistos y si la guía está apagada también viven acá.
 */
export const onboarding_progress = pgTable(
  "onboarding_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** tenant | organization | fleet */
    space_type: text("space_type").notNull(),
    space_id: uuid("space_id").notNull(),
    profile: text("profile").notNull(),
    completed: jsonb("completed").$type<Record<string, string>>().notNull().default({}),
    tours_seen: jsonb("tours_seen").$type<Record<string, string>>().notNull().default({}),
    /** La persona apagó la guía en este espacio (se reactiva con el botón "Guía") */
    disabled: boolean("disabled").notNull().default(false),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("onboarding_progress_key").on(t.user_id, t.space_type, t.space_id)],
);

/** Acceso asistido del equipo de Faro a un tenant: explícito, temporal y auditado */
export const assisted_access = pgTable(
  "assisted_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    faro_user_id: uuid("faro_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    ended_at: timestamp("ended_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [index("assisted_access_user_idx").on(t.faro_user_id, t.expires_at)],
);

// ───────────────────────── Grupos de gastos (núcleo, docs/faro-producto.md §2.e) ─────────────────────────
// Todos los montos en centavos enteros (bigint, modo number: hasta 9 billones de pesos).

export const groupType = pgEnum("group_type", ["socios", "equipo", "oficina", "proyecto", "viaje", "personal"]);
export const groupRole = pgEnum("group_role", ["admin", "miembro"]);
export const splitMethodEnum = pgEnum("split_method", ["iguales", "porcentaje", "partes", "montos", "items"]);
export const settlementMethod = pgEnum("settlement_method", ["efectivo", "transferencia", "mercado_pago"]);
export const settlementStatus = pgEnum("settlement_status", ["informado", "confirmado", "rechazado"]);
export const reimbursementStatus = pgEnum("reimbursement_status", ["pendiente", "aprobada", "rechazada", "reintegrada"]);

const cents = (name: string) => bigint(name, { mode: "number" });

/** Grupo de gastos. Pertenece al tenant de quien lo creó; el contexto contable es opcional. */
export const expense_groups = pgTable(
  "expense_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: groupType("type").notNull().default("personal"),
    base_currency: text("base_currency").notNull().default("ARS"),
    /** Contexto contable: una organización (sus gastos) o el propio tenant (autónomo) */
    organization_id: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    context_tenant: boolean("context_tenant").notNull().default(false),
    color: text("color").notNull().default("#c8a465"),
    image_path: text("image_path"),
    simplify_debts: boolean("simplify_debts").notNull().default(true),
    /** Recordatorios de saldos pendientes: off | semanal | quincenal | mensual */
    reminder_frequency: text("reminder_frequency").notNull().default("semanal"),
    last_reminder_at: timestamp("last_reminder_at", { withTimezone: true }),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    archived_at: timestamp("archived_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("expense_groups_studio_idx").on(t.studio_id)],
);

/** Integrantes: usuarios de Faro o invitados sin cuenta (entran por link mágico solo a su grupo) */
export const group_members = pgTable(
  "group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    group_id: uuid("group_id")
      .notNull()
      .references(() => expense_groups.id, { onDelete: "cascade" }),
    user_id: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    role: groupRole("role").notNull().default("miembro"),
    payment_alias: text("payment_alias"),
    payment_cvu: text("payment_cvu"),
    /** SHA-256 del link mágico del invitado (solo invitados) */
    guest_token_hash: text("guest_token_hash").unique(),
    reminders_opt_out: boolean("reminders_opt_out").notNull().default(false),
    active: boolean("active").notNull().default(true),
    invited_by: uuid("invited_by"),
    created_at: createdAt(),
  },
  (t) => [
    uniqueIndex("group_members_user_idx").on(t.group_id, t.user_id).where(sql`${t.user_id} is not null`),
    index("group_members_user_lookup_idx").on(t.user_id),
  ],
);

export interface ExpenseItem {
  description: string;
  amount: number;
  members: string[];
}

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    group_id: uuid("group_id")
      .notNull()
      .references(() => expense_groups.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amount: cents("amount").notNull(),
    currency: text("currency").notNull().default("ARS"),
    /** Cotización usada para pasar a la moneda base (valor y fuente: oficial, mep o manual) */
    fx_rate: numeric("fx_rate", { precision: 18, scale: 6 }),
    fx_source: text("fx_source"),
    fx_date: date("fx_date"),
    date: date("date").notNull(),
    category: text("category").notNull().default("otros"),
    split_method: splitMethodEnum("split_method").notNull().default("iguales"),
    /** Detalle del método (porcentajes, partes, montos o ítems) tal como se cargó */
    split_spec: jsonb("split_spec").$type<Record<string, unknown>>().notNull().default({}),
    receipt_path: text("receipt_path"),
    receipt_name: text("receipt_name"),
    receipt_mime: text("receipt_mime"),
    notes: text("notes"),
    is_company: boolean("is_company").notNull().default(false),
    is_deductible: boolean("is_deductible").notNull().default(false),
    /** Recurrencia: null | semanal | mensual | anual; el job crea la próxima en next_date */
    recurrence: text("recurrence"),
    recurrence_next: date("recurrence_next"),
    recurrence_parent_id: uuid("recurrence_parent_id"),
    created_by: uuid("created_by").references(() => group_members.id, { onDelete: "set null" }),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("expenses_group_idx").on(t.group_id, t.date), index("expenses_recurrence_idx").on(t.recurrence_next)],
);

/** Quién pagó (uno o varios) y cuánto, en centavos */
export const expense_payers = pgTable(
  "expense_payers",
  {
    expense_id: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    member_id: uuid("member_id")
      .notNull()
      .references(() => group_members.id, { onDelete: "cascade" }),
    amount: cents("amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.expense_id, t.member_id] })],
);

/** Cuánto le toca a cada persona (resultado del reparto), en centavos */
export const expense_shares = pgTable(
  "expense_shares",
  {
    expense_id: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    member_id: uuid("member_id")
      .notNull()
      .references(() => group_members.id, { onDelete: "cascade" }),
    amount: cents("amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.expense_id, t.member_id] })],
);

/** Pagos entre integrantes para saldar deudas */
export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    group_id: uuid("group_id")
      .notNull()
      .references(() => expense_groups.id, { onDelete: "cascade" }),
    from_member: uuid("from_member")
      .notNull()
      .references(() => group_members.id, { onDelete: "cascade" }),
    to_member: uuid("to_member")
      .notNull()
      .references(() => group_members.id, { onDelete: "cascade" }),
    amount: cents("amount").notNull(),
    currency: text("currency").notNull().default("ARS"),
    method: settlementMethod("method").notNull().default("transferencia"),
    status: settlementStatus("status").notNull().default("informado"),
    confirmed_by_from: boolean("confirmed_by_from").notNull().default(false),
    confirmed_by_to: boolean("confirmed_by_to").notNull().default(false),
    payment_link: text("payment_link"),
    receipt_path: text("receipt_path"),
    receipt_name: text("receipt_name"),
    note: text("note"),
    created_by: uuid("created_by").references(() => group_members.id, { onDelete: "set null" }),
    confirmed_at: timestamp("confirmed_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [index("settlements_group_idx").on(t.group_id, t.created_at)],
);

/** Aportes y retiros de socios (grupos de tipo socios) */
export const partner_movements = pgTable(
  "partner_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    group_id: uuid("group_id")
      .notNull()
      .references(() => expense_groups.id, { onDelete: "cascade" }),
    member_id: uuid("member_id")
      .notNull()
      .references(() => group_members.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // aporte | retiro
    amount: cents("amount").notNull(),
    currency: text("currency").notNull().default("ARS"),
    date: date("date").notNull(),
    note: text("note"),
    created_by: uuid("created_by").references(() => group_members.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [index("partner_movements_group_idx").on(t.group_id, t.date)],
);

/** Comentarios por gasto (o del grupo, sin gasto) */
export const expense_comments = pgTable(
  "expense_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    group_id: uuid("group_id")
      .notNull()
      .references(() => expense_groups.id, { onDelete: "cascade" }),
    expense_id: uuid("expense_id").references(() => expenses.id, { onDelete: "cascade" }),
    member_id: uuid("member_id").references(() => group_members.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    created_at: createdAt(),
  },
  (t) => [index("expense_comments_idx").on(t.group_id, t.expense_id, t.created_at)],
);

/** Actividad cronológica del grupo */
export const group_activity = pgTable(
  "group_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    group_id: uuid("group_id")
      .notNull()
      .references(() => expense_groups.id, { onDelete: "cascade" }),
    member_id: uuid("member_id").references(() => group_members.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // gasto | gasto_editado | gasto_borrado | pago | pago_confirmado | aporte | retiro | integrante | comentario | grupo
    text: text("text").notNull(),
    expense_id: uuid("expense_id"),
    settlement_id: uuid("settlement_id"),
    created_at: createdAt(),
  },
  (t) => [index("group_activity_idx").on(t.group_id, t.created_at)],
);

/** Rendición de gastos de un empleado de una organización */
export const reimbursements = pgTable(
  "reimbursements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amount: cents("amount").notNull(),
    currency: text("currency").notNull().default("ARS"),
    date: date("date").notNull(),
    category: text("category").notNull().default("otros"),
    receipt_path: text("receipt_path"),
    receipt_name: text("receipt_name"),
    receipt_mime: text("receipt_mime"),
    status: reimbursementStatus("status").notNull().default("pendiente"),
    decided_by: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decided_at: timestamp("decided_at", { withTimezone: true }),
    reason: text("reason"),
    reimbursed_at: timestamp("reimbursed_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [index("reimbursements_org_idx").on(t.organization_id, t.status, t.created_at)],
);

/**
 * Gastos contables de una organización o de un autónomo: los gastos
 * compartidos marcados "de la empresa" o "deducible" y las rendiciones
 * aprobadas, con su comprobante. Los ve el estudio que gestiona la organización.
 */
export const accounting_expenses = pgTable(
  "accounting_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // gasto_compartido | rendicion
    source_id: uuid("source_id").notNull(),
    description: text("description").notNull(),
    amount: cents("amount").notNull(),
    currency: text("currency").notNull().default("ARS"),
    date: date("date").notNull(),
    category: text("category").notNull().default("otros"),
    deductible: boolean("deductible").notNull().default(false),
    receipt_path: text("receipt_path"),
    receipt_name: text("receipt_name"),
    receipt_mime: text("receipt_mime"),
    created_at: createdAt(),
  },
  (t) => [unique("accounting_expenses_source_key").on(t.source, t.source_id), index("accounting_expenses_org_idx").on(t.organization_id, t.date)],
);

// ───────────────────────── Centro de ayuda ─────────────────────────

/** "¿Te sirvió?" de cada artículo de /ayuda (sí/no y un comentario opcional) */
export const help_feedback = pgTable(
  "help_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** categoria/slug del artículo (docs/ayuda) */
    article_id: text("article_id").notNull(),
    helpful: boolean("helpful").notNull(),
    comment: text("comment"),
    user_id: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    studio_id: uuid("studio_id").references(() => studios.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [index("help_feedback_article_idx").on(t.article_id, t.created_at)],
);
