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
export const leadSource = pgEnum("lead_source", ["diagnostico", "contacto", "whatsapp", "manual", "otro", "agenda", "red", "flota"]);
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
    // F5: legajo
    dni: text("dni"),
    birth_date: date("birth_date"),
    phone: text("phone"),
    address: text("address"),
    area: text("area"), // grupo para comunicados (Administración, Ventas…)
    contract_type: text("contract_type"),
    agreement: text("agreement"), // convenio colectivo
    end_date: date("end_date"),
    end_reason: text("end_reason"),
    notes: text("notes"),
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
    /** manual | calendario_personal | importacion | tango */
    source: text("source"),
    reminded_at: timestamp("reminded_at", { withTimezone: true }),
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
    /** F5: novedad de personal tipificada (alta, baja, licencia, horas extra) con sus datos */
    data: jsonb("data").$type<Record<string, unknown>>(),
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
    /** Enlace para sumarse al grupo (se comparte por WhatsApp o copiando): hash del token; null = apagado */
    invite_token_hash: text("invite_token_hash"),
    invite_created_at: timestamp("invite_created_at", { withTimezone: true }),
    archived_at: timestamp("archived_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("expense_groups_studio_idx").on(t.studio_id), uniqueIndex("expense_groups_invite_idx").on(t.invite_token_hash)],
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

// ───────────────────────── Red de estudios (docs/faro-producto.md §2.i) ─────────────────────────

export const licenseStatus = pgEnum("license_status", ["sin_cargar", "pendiente", "verificada", "rechazada"]);
export const reviewStatus = pgEnum("review_status", ["pendiente", "publicada", "rechazada"]);

/**
 * Ficha del estudio en la Red: opt-in (published) y solo visible con la
 * matrícula verificada por Faro y el módulo red_estudios en el plan.
 */
export const directory_profiles = pgTable("directory_profiles", {
  studio_id: uuid("studio_id")
    .primaryKey()
    .references(() => studios.id, { onDelete: "cascade" }),
  published: boolean("published").notNull().default(false),
  accepting_clients: boolean("accepting_clients").notNull().default(true),
  headline: text("headline"),
  description: text("description"),
  province: text("province"),
  city: text("city"),
  /** presencial | remoto | ambas */
  modality: text("modality").notNull().default("ambas"),
  services: text("services").array().notNull().default(sql`'{}'::text[]`),
  industries: text("industries").array().notNull().default(sql`'{}'::text[]`),
  languages: text("languages").array().notNull().default(sql`'{español}'::text[]`),
  /** unipersonal | 2-5 | 6-15 | 16+ */
  team_size: text("team_size"),
  fee_range: text("fee_range"),
  contact_email: text("contact_email"),
  license_body: text("license_body"),
  license_number: text("license_number"),
  license_holder: text("license_holder"),
  license_status: licenseStatus("license_status").notNull().default("sin_cargar"),
  license_note: text("license_note"),
  license_reviewed_by: uuid("license_reviewed_by").references(() => users.id, { onDelete: "set null" }),
  license_reviewed_at: timestamp("license_reviewed_at", { withTimezone: true }),
  published_at: timestamp("published_at", { withTimezone: true }),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

/** Reseñas: solo de clientes reales (≥ 30 días en Faro), una por organización, moderadas, con respuesta pública */
export const directory_reviews = pgTable(
  "directory_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    author_user_id: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Cómo se muestra el autor (nombre de pila o "Cliente verificado") */
    author_label: text("author_label").notNull(),
    rating: integer("rating").notNull(),
    body: text("body").notNull(),
    status: reviewStatus("status").notNull().default("pendiente"),
    moderation_note: text("moderation_note"),
    moderated_by: uuid("moderated_by").references(() => users.id, { onDelete: "set null" }),
    moderated_at: timestamp("moderated_at", { withTimezone: true }),
    response: text("response"),
    responded_by: uuid("responded_by").references(() => users.id, { onDelete: "set null" }),
    responded_at: timestamp("responded_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [unique("directory_reviews_org_key").on(t.studio_id, t.organization_id), index("directory_reviews_studio_idx").on(t.studio_id, t.status)],
);

// ───────────────────────── Flotas (docs/faro-producto.md §2.j) ─────────────────────────
// Grupo informal de 3 a 20 personas que pide junto una propuesta a estudios
// de la Red. No es una sociedad: cada integrante firma su propio Acuerdo de
// servicio con el estudio y paga solo su abono. Nadie ve las finanzas de nadie.

export const fleetMemberStatus = pgEnum("fleet_member_status", ["invitado", "activo", "salio", "rechazo"]);
export const fleetMemberRole = pgEnum("fleet_member_role", ["capitan", "tripulante"]);
export const agreementStatus = pgEnum("agreement_status", ["activo", "baja_solicitada", "finalizado"]);

export const fleets = pgTable("fleets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  /** activa | cerrada */
  status: text("status").notNull().default("activa"),
  /** Pedido de propuesta grupal: borrador | publicado | cerrado */
  request_status: text("request_status").notNull().default("borrador"),
  request_zone: text("request_zone"),
  request_services: text("request_services").array().notNull().default(sql`'{}'::text[]`),
  request_message: text("request_message"),
  request_published_at: timestamp("request_published_at", { withTimezone: true }),
  created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const fleet_members = pgTable(
  "fleet_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fleet_id: uuid("fleet_id")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    user_id: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    /** monotributista | responsable_inscripto | relacion_dependencia | sin_actividad */
    profile: text("profile"),
    role: fleetMemberRole("role").notNull().default("tripulante"),
    status: fleetMemberStatus("status").notNull().default("invitado"),
    /** Aceptó el aviso de informalidad al unirse */
    informal_ack_at: timestamp("informal_ack_at", { withTimezone: true }),
    invited_by: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    joined_at: timestamp("joined_at", { withTimezone: true }),
    left_at: timestamp("left_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [unique("fleet_members_email_key").on(t.fleet_id, t.email), index("fleet_members_user_idx").on(t.user_id)],
);

/** Propuesta grupal de un estudio de la Red: precio mensual por integrante según su perfil */
export const fleet_proposals = pgTable(
  "fleet_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fleet_id: uuid("fleet_id")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    /** Pesos por mes, por perfil (null = no lo atiende) */
    prices: jsonb("prices").$type<Record<string, number | null>>().notNull(),
    includes: text("includes").notNull(),
    min_members: integer("min_members").notNull().default(3),
    /** Preaviso de baja (máximo 30 días, sin penalidades) */
    notice_days: integer("notice_days").notNull().default(30),
    /** enviada | retirada */
    status: text("status").notNull().default("enviada"),
    /** Desde cuándo quedó por debajo del mínimo (aviso de 30 días) */
    below_min_since: timestamp("below_min_since", { withTimezone: true }),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [unique("fleet_proposals_key").on(t.fleet_id, t.studio_id)],
);

/** Votación no vinculante: cuál propuesta considerar */
export const fleet_votes = pgTable(
  "fleet_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fleet_id: uuid("fleet_id")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    member_id: uuid("member_id")
      .notNull()
      .references(() => fleet_members.id, { onDelete: "cascade" }),
    proposal_id: uuid("proposal_id")
      .notNull()
      .references(() => fleet_proposals.id, { onDelete: "cascade" }),
    created_at: createdAt(),
  },
  (t) => [unique("fleet_votes_member_key").on(t.fleet_id, t.member_id)],
);

/** Conversación interna y línea de tiempo de la Flota */
export const fleet_events = pgTable(
  "fleet_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fleet_id: uuid("fleet_id")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    /** mensaje | evento */
    kind: text("kind").notNull().default("evento"),
    actor_id: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actor_label: text("actor_label"),
    body: text("body").notNull(),
    created_at: createdAt(),
  },
  (t) => [index("fleet_events_fleet_idx").on(t.fleet_id, t.created_at)],
);

/**
 * Acuerdo de servicio individual entre un integrante y el estudio, con las
 * condiciones de la propuesta (copiadas al firmar). Cada uno paga solo su abono.
 */
export const service_agreements = pgTable(
  "service_agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fleet_id: uuid("fleet_id").references(() => fleets.id, { onDelete: "set null" }),
    proposal_id: uuid("proposal_id").references(() => fleet_proposals.id, { onDelete: "set null" }),
    /** Organización creada en el estudio al aceptar (con consentimiento) */
    organization_id: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    member_name: text("member_name").notNull(),
    member_email: text("member_email").notNull(),
    profile: text("profile").notNull(),
    monthly_price: integer("monthly_price").notNull(),
    terms: jsonb("terms").$type<{ includes: string; minMembers: number; noticeDays: number; studioName: string; fleetName: string; version: string }>().notNull(),
    status: agreementStatus("status").notNull().default("activo"),
    signed_name: text("signed_name").notNull(),
    signed_at: timestamp("signed_at", { withTimezone: true }).notNull(),
    signed_ip: text("signed_ip"),
    /** Vigencia del precio grupal si la Flota quedó por debajo del mínimo */
    group_price_until: date("group_price_until"),
    end_requested_at: timestamp("end_requested_at", { withTimezone: true }),
    ends_on: date("ends_on"),
    // F7: débito automático individual (suscripción de Mercado Pago en la cuenta del estudio)
    mp_preapproval_id: text("mp_preapproval_id"),
    debit_status: text("debit_status"), // pendiente | autorizado | cancelado
    debit_url: text("debit_url"),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("service_agreements_user_idx").on(t.user_id), index("service_agreements_studio_idx").on(t.studio_id)],
);

/** Pagos de cada acuerdo (por período), que registra el estudio */
export const agreement_payments = pgTable(
  "agreement_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agreement_id: uuid("agreement_id")
      .notNull()
      .references(() => service_agreements.id, { onDelete: "cascade" }),
    /** AAAA-MM */
    period: text("period").notNull(),
    amount: integer("amount").notNull(),
    method: text("method"),
    registered_by: uuid("registered_by").references(() => users.id, { onDelete: "set null" }),
    paid_at: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("agreement_payments_period_key").on(t.agreement_id, t.period)],
);

/**
 * Validación de una plantilla de rubro por cada estudio: mientras no la marque
 * como validada (para la versión vigente), se muestra "Plantilla en revisión
 * por el estudio". Es independiente de la validación global de Faro.
 */
export const studio_template_validations = pgTable(
  "studio_template_validations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    industry_key: text("industry_key").notNull(),
    version: integer("version").notNull(),
    validated_by: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
    validated_by_name: text("validated_by_name").notNull(),
    note: text("note"),
    validated_at: timestamp("validated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("studio_template_validations_key").on(t.studio_id, t.industry_key, t.version)],
);

// ───────────────────────── Textos legales ─────────────────────────

/** Aceptación de cada versión de un texto legal (docs/legal), por usuario */
export const legal_acceptances = pgTable(
  "legal_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** terminos | privacidad | flotas | red-de-estudios */
    document: text("document").notNull(),
    version: text("version").notNull(),
    ip: text("ip"),
    accepted_at: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("legal_acceptances_key").on(t.user_id, t.document, t.version)],
);

/** Preferencias de cada usuario (barra lateral, Vigía…): por usuario y en la base */
export const user_preferences = pgTable("user_preferences", {
  user_id: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<UserPrefs>().notNull().default({}),
  updated_at: updatedAt(),
});

export interface UserPrefs {
  /** Guía (recorridos automáticos y widget de primeros pasos). Sin valor: prendida solo para cuentas nuevas */
  guide?: boolean;
  /** expanded | collapsed (en escritorio, colapsado = barra horizontal de íconos) */
  sidebar?: "expanded" | "collapsed";
  /** Vigía: registrar solo los movimientos personales (siempre con Deshacer) */
  copilotAuto?: boolean;
  /** Primeros pasos: el widget del Inicio está oculto */
  hideFirstSteps?: boolean;
  /** Bitácora: resumen semanal del domingo (sin valor: sí) */
  weeklySummary?: boolean;
  /** Último espacio usado (personal, estudio, organización o Faro Manager): la app entra ahí */
  space?: "studio" | "personal" | "portal" | "faro";
}

// ───────────────────────── Bitácora (docs/faro-producto.md §2.g) ─────────────────────────
// Finanzas personales: siempre privadas. Todo se filtra por user_id de la sesión.

export const movementKind = pgEnum("movement_kind", ["gasto", "ingreso"]);
export const paymentMethod = pgEnum("payment_method", ["efectivo", "debito", "credito", "transferencia", "mercado_pago"]);

/** Categorías de cada persona (se siembran las predeterminadas la primera vez; editables) */
export const bitacora_categories = pgTable(
  "bitacora_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Clave estable de las predeterminadas (supermercado, comida…); null en las propias */
    key: text("key"),
    name: text("name").notNull(),
    kind: movementKind("kind").notNull().default("gasto"),
    position: integer("position").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    created_at: createdAt(),
  },
  (t) => [index("bitacora_categories_user_idx").on(t.user_id), uniqueIndex("bitacora_categories_key").on(t.user_id, t.key).where(sql`${t.key} is not null`)],
);

export const bitacora_entries = pgTable(
  "bitacora_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: movementKind("kind").notNull().default("gasto"),
    /** En centavos */
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("ARS"),
    date: date("date").notNull(),
    category_id: uuid("category_id").references(() => bitacora_categories.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    payment_method: paymentMethod("payment_method"),
    note: text("note"),
    /** manual | copiloto */
    source: text("source").notNull().default("manual"),
    /** Mensaje del Vigía que lo originó (texto, audio o imagen, con transcripción y modelo) */
    copilot_message_id: uuid("copilot_message_id"),
    /** Borrado suave: Deshacer y la papelera */
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
    /** De la actividad profesional (autónomo) y deducible: se puede pasar a Faro Personal */
    professional: boolean("professional").notNull().default(false),
    deductible: boolean("deductible").notNull().default(false),
    accounting_expense_id: uuid("accounting_expense_id"),
    /** Cajas (principios §10 y §17): movido a la caja de negocio (queda borrado acá, sin perderse) o espejo de un movimiento de otra caja */
    moved_to_box_entry_id: uuid("moved_to_box_entry_id"),
    box_entry_id: uuid("box_entry_id"),
    /** La persona dijo que no a la sugerencia «parece del negocio» */
    business_hint_dismissed: boolean("business_hint_dismissed").notNull().default(false),
    /** Sueldo del dueño o aporte: el movimiento explícito entre cajas */
    transfer_id: uuid("transfer_id"),
    /** Importaciones y conexiones: lote, ID externo, registro original, validación y sincronización */
    import_id: uuid("import_id"),
    external_id: text("external_id"),
    raw: jsonb("raw").$type<unknown>(),
    validation: text("validation"),
    synced_at: timestamp("synced_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("bitacora_entries_user_date_idx").on(t.user_id, t.date)],
);

// ───────────────────────── Vigía (docs/faro-producto.md §2.m) ─────────────────────────

export const copilotRole = pgEnum("copilot_role", ["usuario", "copiloto"]);
/** ok | procesando | pendiente (cola: esperando cuota) | error */
export const copilotStatus = pgEnum("copilot_status", ["ok", "procesando", "pendiente", "error"]);

/** Historial del chat por usuario. Cada mensaje del usuario guarda su original (y su archivo, en UPLOADS_DIR) */
export const copilot_messages = pgTable(
  "copilot_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: copilotRole("role").notNull(),
    /** texto | audio | imagen | pdf */
    kind: text("kind").notNull().default("texto"),
    text: text("text"),
    /** Transcripción del audio (o lo que se leyó de la imagen) */
    transcript: text("transcript"),
    attachment_path: text("attachment_path"),
    attachment_name: text("attachment_name"),
    attachment_mime: text("attachment_mime"),
    /** En respuestas: a qué mensaje del usuario responde */
    reply_to: uuid("reply_to"),
    status: copilotStatus("status").notNull().default("ok"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    model: text("model"),
    tokens_in: integer("tokens_in").notNull().default(0),
    tokens_out: integer("tokens_out").notNull().default(0),
    cost_usd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    /** El usuario no alcanzó a ver la respuesta (llegó desde la cola) */
    unseen: boolean("unseen").notNull().default(false),
    created_at: createdAt(),
    processed_at: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("copilot_messages_user_idx").on(t.user_id, t.created_at), index("copilot_messages_status_idx").on(t.status, t.created_at)],
);

export const proposalStatus = pgEnum("proposal_status", ["propuesta", "confirmada", "deshecha", "descartada"]);

/** Cada interpretación del Vigía: una tarjeta con Confirmar, Editar y Deshacer */
export const copilot_proposals = pgTable(
  "copilot_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Respuesta del Vigía que la muestra */
    message_id: uuid("message_id")
      .notNull()
      .references(() => copilot_messages.id, { onDelete: "cascade" }),
    /** Mensaje original del usuario (el origen del registro) */
    source_message_id: uuid("source_message_id").references(() => copilot_messages.id, { onDelete: "set null" }),
    /** crear_movimiento | crear_gasto_en_grupo | crear_grupo | recordar */
    tool: text("tool").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    /** Resumen legible y datos resueltos (grupo, integrantes, reparto) */
    preview: jsonb("preview").$type<Record<string, unknown>>().notNull().default({}),
    status: proposalStatus("status").notNull().default("propuesta"),
    /** Se registró solo (preferencia "registrar solo") */
    auto: boolean("auto").notNull().default(false),
    /** Lo creado: movimiento, gasto, grupo o recordatorio */
    result_type: text("result_type"),
    result_id: uuid("result_id"),
    error: text("error"),
    created_at: createdAt(),
    decided_at: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("copilot_proposals_user_idx").on(t.user_id, t.created_at)],
);

export const copilot_reminders = pgTable(
  "copilot_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    due_at: timestamp("due_at", { withTimezone: true }).notNull(),
    sent_at: timestamp("sent_at", { withTimezone: true }),
    done_at: timestamp("done_at", { withTimezone: true }),
    source_message_id: uuid("source_message_id").references(() => copilot_messages.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [index("copilot_reminders_due_idx").on(t.due_at)],
);

/**
 * IA de la plataforma (la que usa el Vigía de personas y autónomos): una
 * sola fila. La clave se guarda cifrada con ENCRYPTION_KEY y nunca se muestra.
 */
export const platform_ai = pgTable("platform_ai", {
  id: text("id").primaryKey().default("default"),
  /** google | openai | openai_compatible */
  provider: text("provider").notNull().default("google"),
  api_key_enc: text("api_key_enc"),
  key_hint: text("key_hint"),
  base_url: text("base_url"),
  model_primary: text("model_primary").notNull().default("gemini-3.1-flash-lite"),
  model_fallback: text("model_fallback"),
  /** Transcripción de audio: nativo (Gemini entiende el audio) | openai (Whisper o similar) */
  transcription: text("transcription").notNull().default("nativo"),
  transcription_key_enc: text("transcription_key_enc"),
  transcription_model: text("transcription_model").notNull().default("whisper-1"),
  /** Precio por millón de tokens (USD) para estimar el costo */
  price_in_per_m: numeric("price_in_per_m", { precision: 10, scale: 4 }).notNull().default("0.10"),
  price_out_per_m: numeric("price_out_per_m", { precision: 10, scale: 4 }).notNull().default("0.40"),
  /** La clave es del plan gratis del proveedor (no apta para datos reales) */
  free_tier: boolean("free_tier").notNull().default(false),
  /** Límites por plan: { persona_gratis: { messages, audios }, … } */
  limits: jsonb("limits").$type<Record<string, { messages?: number | null; audios?: number | null }>>().notNull().default({}),
  daily_cap_usd: numeric("daily_cap_usd", { precision: 10, scale: 2 }),
  monthly_cap_usd: numeric("monthly_cap_usd", { precision: 10, scale: 2 }),
  /** Último aviso al Faro Manager por tope alcanzado */
  cap_alerted_at: timestamp("cap_alerted_at", { withTimezone: true }),
  updated_by: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updated_at: updatedAt(),
});

/**
 * Avisos dentro de la app (campanita): un gasto que te cargaron, un pago, un
 * mensaje. Son de una persona; nunca se muestran a otra.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    ref_id: uuid("ref_id"),
    read_at: timestamp("read_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.user_id, t.read_at, t.created_at)],
);

// ── Mensajes (chat interno, docs/faro-producto.md «Mensajes») ─────────────
// Solo entre personas que comparten un espacio. El Faro Manager no ve los
// mensajes, salvo uno reportado.

export const conversationKind = pgEnum("conversation_kind", ["directo", "grupo", "gastos", "flota", "equipo"]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: conversationKind("kind").notNull(),
    /** Grupo de chat y canal del equipo: nombre; directo, gastos y flota: se arma con el nombre del espacio o de la otra persona */
    title: text("title"),
    /** Canal interno del estudio */
    studio_id: uuid("studio_id").references(() => studios.id, { onDelete: "cascade" }),
    expense_group_id: uuid("expense_group_id").references(() => expense_groups.id, { onDelete: "cascade" }),
    fleet_id: uuid("fleet_id").references(() => fleets.id, { onDelete: "cascade" }),
    /** Directo: los dos ids ordenados («a:b»), para no duplicar la conversación */
    direct_key: text("direct_key"),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    last_message_at: timestamp("last_message_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [
    uniqueIndex("conversations_direct_idx").on(t.direct_key),
    uniqueIndex("conversations_group_idx").on(t.expense_group_id),
    uniqueIndex("conversations_fleet_idx").on(t.fleet_id),
  ],
);

export const conversation_members = pgTable(
  "conversation_members",
  {
    conversation_id: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("miembro"),
    last_read_at: timestamp("last_read_at", { withTimezone: true }),
    muted: boolean("muted").notNull().default(false),
    /** Salió (o dejó de compartir el espacio): no ve mensajes nuevos */
    left_at: timestamp("left_at", { withTimezone: true }),
    joined_at: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.conversation_id, t.user_id] }), index("conversation_members_user_idx").on(t.user_id)],
);

export const chat_messages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversation_id: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    author_id: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body"),
    reply_to: uuid("reply_to"),
    attachment_path: text("attachment_path"),
    attachment_name: text("attachment_name"),
    attachment_mime: text("attachment_mime"),
    attachment_size: integer("attachment_size"),
    edited_at: timestamp("edited_at", { withTimezone: true }),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [index("chat_messages_conv_idx").on(t.conversation_id, t.created_at)],
);

export const user_blocks = pgTable(
  "user_blocks",
  {
    blocker_id: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blocked_id: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    created_at: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blocker_id, t.blocked_id] })],
);

export const message_reports = pgTable(
  "message_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    message_id: uuid("message_id")
      .notNull()
      .references(() => chat_messages.id, { onDelete: "cascade" }),
    reporter_id: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    detail: text("detail"),
    /** Copia del mensaje al momento del reporte (lo único que ve el Faro Manager) */
    snapshot: jsonb("snapshot").$type<{ body: string | null; author: string | null; attachment: string | null; at: string }>().notNull(),
    status: text("status").notNull().default("abierto"),
    resolution: text("resolution"),
    resolved_by: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolved_at: timestamp("resolved_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("message_reports_once_idx").on(t.message_id, t.reporter_id)],
);

/** Suscripciones de notificaciones push (PWA) */
export const push_subscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint), index("push_subscriptions_user_idx").on(t.user_id)],
);

// ───────────────────────── ARCA y facturación (F3 · docs/faro-producto.md §2.c) ─────────────────────────
// Siempre por los web services oficiales (WSAA, WSFEv1, constancia de
// inscripción), con el certificado de la CUIT que opera Faro y la delegación
// de cada contribuyente. Todo lo que llega de ARCA guarda fuente, fecha,
// ID externo, estado de validación y el registro original.

/** Certificado y clave privada de la CUIT operadora de Faro, por ambiente (cifrados con ENCRYPTION_KEY) */
export const arca_credentials = pgTable(
  "arca_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    environment: text("environment").notNull(), // homologacion | produccion
    cuit: text("cuit").notNull(),
    cert_enc: text("cert_enc").notNull(),
    key_enc: text("key_enc").notNull(),
    cert_subject: text("cert_subject"),
    cert_not_after: timestamp("cert_not_after", { withTimezone: true }),
    last_test_at: timestamp("last_test_at", { withTimezone: true }),
    last_test_ok: boolean("last_test_ok"),
    last_test_detail: text("last_test_detail"),
    updated_by: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("arca_credentials_env_idx").on(t.environment)],
);

/** Tickets de acceso del WSAA (válidos ~12 h): se reusan hasta su vencimiento */
export const arca_tickets = pgTable(
  "arca_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    environment: text("environment").notNull(),
    service: text("service").notNull(),
    cuit: text("cuit").notNull(),
    token: text("token").notNull(),
    sign: text("sign").notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("arca_tickets_service_idx").on(t.environment, t.service, t.cuit)],
);

/** Situación de un contribuyente según ARCA (constancia de inscripción), con el registro original */
export const arca_taxpayers = pgTable(
  "arca_taxpayers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id").references((): AnyPgColumn => organizations.id, { onDelete: "cascade" }),
    cuit: text("cuit").notNull(),
    source: text("source").notNull(), // ws_sr_constancia_inscripcion | manual
    environment: text("environment"),
    external_id: text("external_id"),
    validation: text("validation").notNull().default("validado"), // validado | error | a_revisar
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    raw: jsonb("raw").$type<unknown>(),
    error: text("error"),
    fetched_at: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    fetched_by: uuid("fetched_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("arca_taxpayers_cuit_idx").on(t.studio_id, t.cuit, t.fetched_at)],
);

/** Datos de facturación de un emisor (autónomo u organización): marca del PDF y contacto */
export const invoice_settings = pgTable(
  "invoice_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organizations.id, { onDelete: "cascade" }),
    cuit: text("cuit").notNull(),
    business_name: text("business_name").notNull(),
    iva_condition: text("iva_condition").notNull().default("monotributo"), // monotributo | responsable_inscripto | exento
    address: text("address"),
    activity_start: date("activity_start"),
    iibb: text("iibb"),
    logo_path: text("logo_path"),
    color: text("color").default("#1c2235"),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    footer: text("footer"),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("invoice_settings_org_cuit_idx").on(t.organization_id, t.cuit)],
);

/** Puntos de venta habilitados para web services (los trae ARCA) */
export const invoice_points = pgTable(
  "invoice_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organizations.id, { onDelete: "cascade" }),
    cuit: text("cuit").notNull(),
    number: integer("number").notNull(),
    kind: text("kind"),
    blocked: boolean("blocked").notNull().default(false),
    source: text("source").notNull().default("wsfe"),
    synced_at: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invoice_points_unique_idx").on(t.organization_id, t.cuit, t.number)],
);

/** Clientes frecuentes del emisor */
export const invoice_customers = pgTable(
  "invoice_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organizations.id, { onDelete: "cascade" }),
    doc_type: integer("doc_type").notNull().default(80), // 80 CUIT · 86 CUIL · 96 DNI · 99 consumidor final
    doc_number: text("doc_number").notNull().default("0"),
    name: text("name").notNull(),
    iva_condition: text("iva_condition").notNull().default("consumidor_final"),
    email: text("email"),
    address: text("address"),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("invoice_customers_org_idx").on(t.organization_id)],
);

/** Productos y servicios frecuentes */
export const invoice_products = pgTable(
  "invoice_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organizations.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    unit_price: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
    iva_rate: numeric("iva_rate", { precision: 5, scale: 2 }), // null = no corresponde (factura C)
    created_at: createdAt(),
  },
  (t) => [index("invoice_products_org_idx").on(t.organization_id)],
);

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  /** Alícuota de IVA (21, 10.5, 27, 5, 2.5, 0); null en comprobantes C */
  ivaRate: number | null;
}

/** Comprobantes electrónicos (borradores y autorizados por ARCA) */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organizations.id, { onDelete: "cascade" }),
    cuit: text("cuit").notNull(),
    environment: text("environment").notNull(),
    point_of_sale: integer("point_of_sale").notNull(),
    cbte_type: integer("cbte_type").notNull(),
    number: bigint("number", { mode: "number" }),
    issue_date: date("issue_date").notNull(),
    concept: integer("concept").notNull().default(2), // 1 productos · 2 servicios · 3 ambos
    service_from: date("service_from"),
    service_to: date("service_to"),
    payment_due: date("payment_due"),
    customer_id: uuid("customer_id").references((): AnyPgColumn => invoice_customers.id, { onDelete: "set null" }),
    customer_doc_type: integer("customer_doc_type").notNull(),
    customer_doc_number: text("customer_doc_number").notNull(),
    customer_name: text("customer_name").notNull(),
    customer_iva_condition: text("customer_iva_condition").notNull(),
    customer_email: text("customer_email"),
    customer_address: text("customer_address"),
    currency: text("currency").notNull().default("PES"),
    exchange_rate: numeric("exchange_rate", { precision: 14, scale: 6 }).notNull().default("1"),
    items: jsonb("items").$type<InvoiceItem[]>().notNull(),
    net: numeric("net", { precision: 14, scale: 2 }).notNull(),
    iva: numeric("iva", { precision: 14, scale: 2 }).notNull().default("0"),
    exempt: numeric("exempt", { precision: 14, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    iva_breakdown: jsonb("iva_breakdown").$type<{ rate: number; base: number; amount: number }[]>().notNull().default([]),
    associated_invoice_id: uuid("associated_invoice_id").references((): AnyPgColumn => invoices.id, { onDelete: "set null" }),
    status: text("status").notNull().default("borrador"), // borrador | autorizando | autorizada | rechazada | error
    cae: text("cae"),
    cae_due: date("cae_due"),
    observations: jsonb("observations").$type<{ code: number; msg: string }[]>(),
    error: text("error"),
    /** Pedido y respuesta originales de ARCA */
    raw_request: jsonb("raw_request").$type<unknown>(),
    raw_response: jsonb("raw_response").$type<unknown>(),
    public_token: text("public_token"),
    payment_url: text("payment_url"),
    emailed_at: timestamp("emailed_at", { withTimezone: true }),
    notes: text("notes"),
    origin: text("origin").notNull().default("manual"), // manual | vigia | aprobacion | flujo
    // F7: preferencia de Mercado Pago del link de pago (en la cuenta del emisor) y cobro
    mp_preference_id: text("mp_preference_id"),
    paid_at: timestamp("paid_at", { withTimezone: true }),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    authorized_by: uuid("authorized_by").references(() => users.id, { onDelete: "set null" }),
    authorized_at: timestamp("authorized_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    index("invoices_org_idx").on(t.organization_id, t.issue_date),
    uniqueIndex("invoices_number_idx").on(t.cuit, t.environment, t.point_of_sale, t.cbte_type, t.number),
    uniqueIndex("invoices_token_idx").on(t.public_token),
  ],
);

/** Escalas de monotributo versionadas por vigencia (las mantiene el Faro Manager) */
export const monotributo_scales = pgTable(
  "monotributo_scales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    valid_from: date("valid_from").notNull(),
    status: text("status").notNull().default("a_validar"), // a_validar | validada
    source: text("source").notNull(),
    notes: text("notes"),
    categories: jsonb("categories")
      .$type<{ letter: string; maxIncome: number; maxSurfaceM2: number | null; maxEnergyKw: number | null; maxRent: number | null; feeServices: number | null; feeGoods: number | null; servicesAllowed: boolean }[]>()
      .notNull(),
    validated_by: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
    updated_by: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("monotributo_scales_from_idx").on(t.valid_from)],
);

/** Facturación fuera de Faro (meses anteriores u otro facturador) para el semáforo */
export const income_adjustments = pgTable(
  "income_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organizations.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // AAAA-MM
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    note: text("note"),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("income_adjustments_month_idx").on(t.organization_id, t.month)],
);

/** Perfil fiscal para el calendario personal (régimen y jurisdicción) */
export const tax_profiles = pgTable(
  "tax_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organizations.id, { onDelete: "cascade" }),
    cuit: text("cuit").notNull(),
    regime: text("regime").notNull().default("monotributo"), // monotributo | responsable_inscripto
    category: text("category"),
    iibb: text("iibb").notNull().default("simplificado"), // simplificado | local | convenio | exento
    jurisdiction: text("jurisdiction"),
    autonomos: boolean("autonomos").notNull().default(false),
    alerts_email: boolean("alerts_email").notNull().default(true),
    alert_days: integer("alert_days").notNull().default(3),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("tax_profiles_org_idx").on(t.organization_id)],
);

/** Chequeos guiados de lo que ARCA no ofrece por web service (deuda, multas, intimaciones) */
export const guided_checks = pgTable(
  "guided_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organizations.id, { onDelete: "cascade" }),
    check_key: text("check_key").notNull(),
    status: text("status").notNull().default("sin_revisar"), // sin_revisar | ok | con_novedades
    finding: text("finding"),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    checked_at: timestamp("checked_at", { withTimezone: true }),
    checked_by: uuid("checked_by").references(() => users.id, { onDelete: "set null" }),
    every_days: integer("every_days").notNull().default(30),
    next_reminder_at: timestamp("next_reminder_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("guided_checks_unique_idx").on(t.organization_id, t.check_key)],
);

// ───────────────────────── Bitácora completa (F8 · docs/faro-producto.md §2.g) ─────────────────────────
// Todo es de la persona (user_id de la sesión); nunca lo ve su estudio, su
// organización ni su empleador, salvo lo que comparta explícitamente.

/** Presupuesto por categoría ("sobres"), sugerido a partir de los meses cargados */
export const bitacora_budgets = pgTable(
  "bitacora_budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category_id: uuid("category_id")
      .notNull()
      .references(() => bitacora_categories.id, { onDelete: "cascade" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    suggested: boolean("suggested").notNull().default(false),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("bitacora_budgets_cat_idx").on(t.user_id, t.category_id)],
);

/** Gastos fijos y suscripciones (detectados por recurrencia o cargados a mano) */
export const bitacora_recurring = pgTable(
  "bitacora_recurring",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    key: text("key").notNull(),
    category_id: uuid("category_id").references(() => bitacora_categories.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("fijo"), // fijo | suscripcion
    currency: text("currency").notNull().default("ARS"),
    avg_amount: bigint("avg_amount", { mode: "number" }).notNull(),
    last_amount: bigint("last_amount", { mode: "number" }).notNull(),
    last_date: date("last_date").notNull(),
    next_date: date("next_date").notNull(),
    months: integer("months").notNull().default(1),
    price_change_pct: numeric("price_change_pct", { precision: 7, scale: 2 }),
    status: text("status").notNull().default("detectado"), // detectado | confirmado | descartado
    source: text("source").notNull().default("deteccion"),
    still_used: boolean("still_used"),
    notified_due_at: date("notified_due_at"),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("bitacora_recurring_key_idx").on(t.user_id, t.key)],
);

/** Metas de ahorro (viaje, fondo de emergencia) */
export const bitacora_goals = pgTable(
  "bitacora_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("otro"), // viaje | emergencia | otro
    currency: text("currency").notNull().default("ARS"),
    target: bigint("target", { mode: "number" }).notNull(),
    saved: bigint("saved", { mode: "number" }).notNull().default(0),
    deadline: date("deadline"),
    archived: boolean("archived").notNull().default(false),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("bitacora_goals_user_idx").on(t.user_id)],
);

export const bitacora_goal_moves = pgTable("bitacora_goal_moves", {
  id: uuid("id").primaryKey().defaultRandom(),
  goal_id: uuid("goal_id")
    .notNull()
    .references(() => bitacora_goals.id, { onDelete: "cascade" }),
  amount: bigint("amount", { mode: "number" }).notNull(),
  date: date("date").notNull(),
  note: text("note"),
  created_at: createdAt(),
});

/** Avisos de Bitácora: fugas, vencimientos de fijos, aumentos, sobres excedidos, resumen semanal */
export const bitacora_insights = pgTable(
  "bitacora_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    ref: text("ref").notNull().default(""),
    period: text("period").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("nuevo"), // nuevo | visto | descartado
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("bitacora_insights_once_idx").on(t.user_id, t.kind, t.period, t.ref)],
);

/** Serie del IPC (la carga el Faro Manager, con fuente y fecha) para valores reales */
export const ipc_series = pgTable("ipc_series", {
  month: text("month").primaryKey(), // AAAA-MM
  value: numeric("value", { precision: 14, scale: 4 }).notNull(),
  source: text("source").notNull(),
  updated_by: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updated_at: updatedAt(),
});

/** Cotizaciones diarias guardadas (dólar MEP), para mostrar meses pasados en dólares */
export const fx_snapshots = pgTable(
  "fx_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    currency: text("currency").notNull(),
    kind: text("kind").notNull(), // mep | oficial
    rate: numeric("rate", { precision: 14, scale: 4 }).notNull(),
    source: text("source").notNull(),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("fx_snapshots_day_idx").on(t.date, t.currency, t.kind)],
);

/** Lotes de importación (resúmenes bancarios, tarjetas, Mercado Pago) con el archivo y el mapeo */
export const bitacora_imports = pgTable(
  "bitacora_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // csv | pdf | mercadopago_csv | mercadopago_api | gmail
    file_name: text("file_name"),
    mapping: jsonb("mapping").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("vista_previa"), // vista_previa | importado | descartado
    rows: jsonb("rows").$type<unknown[]>().notNull().default([]),
    total: integer("total").notNull().default(0),
    imported: integer("imported").notNull().default(0),
    duplicates: integer("duplicates").notNull().default(0),
    created_at: createdAt(),
  },
  (t) => [index("bitacora_imports_user_idx").on(t.user_id, t.created_at)],
);

/** Conexiones de la persona (Mercado Pago, Gmail), con tokens cifrados */
export const bitacora_connections = pgTable(
  "bitacora_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // mercadopago | gmail
    account_label: text("account_label"),
    external_user_id: text("external_user_id"),
    access_token_enc: text("access_token_enc").notNull(),
    refresh_token_enc: text("refresh_token_enc"),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    status: text("status").notNull().default("activa"), // activa | error | desconectada
    last_sync_at: timestamp("last_sync_at", { withTimezone: true }),
    last_error: text("last_error"),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("bitacora_connections_provider_idx").on(t.user_id, t.provider)],
);

/** Propuestas de movimientos detectados (Gmail, Mercado Pago) que la persona acepta o descarta */
export const bitacora_proposals = pgTable(
  "bitacora_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    external_id: text("external_id").notNull(),
    kind: text("kind").notNull().default("gasto"),
    detected: text("detected").notNull(), // servicio | suscripcion | resumen_tarjeta | factura
    description: text("description").notNull(),
    amount: bigint("amount", { mode: "number" }),
    currency: text("currency").notNull().default("ARS"),
    date: date("date"),
    category_hint: text("category_hint"),
    raw: jsonb("raw").$type<unknown>(),
    status: text("status").notNull().default("pendiente"), // pendiente | aceptada | descartada
    entry_id: uuid("entry_id"),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("bitacora_proposals_ext_idx").on(t.user_id, t.source, t.external_id)],
);

/** Bitácora compartida (hogar o pareja): permiso explícito y revocable de quien la comparte */
export const bitacora_shares = pgTable(
  "bitacora_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    owner_id: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    member_id: uuid("member_id").references(() => users.id, { onDelete: "cascade" }),
    invited_email: text("invited_email").notNull(),
    token: text("token").notNull(),
    permission: text("permission").notNull().default("ver"), // ver | cargar
    status: text("status").notNull().default("invitada"), // invitada | activa | revocada
    accepted_at: timestamp("accepted_at", { withTimezone: true }),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("bitacora_shares_token_idx").on(t.token), index("bitacora_shares_member_idx").on(t.member_id)],
);

// ───────────── F6 · Lectura inteligente (smart_docs) y conciliación (bank_rec) ─────────────

/**
 * Documento leído por la IA: lo extraído (tipado), confianza por campo,
 * validaciones, huella para duplicados y el registro original de la
 * respuesta del modelo. Nada cuenta hasta que una persona lo confirma.
 * scope: organizacion (estudio o portal) · personal (autónomo) · bitacora (ticket personal)
 */
export const smart_documents = pgTable(
  "smart_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    owner_user_id: uuid("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("organizacion"),
    document_id: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    storage_path: text("storage_path").notNull(),
    file_name: text("file_name").notNull(),
    mime_type: text("mime_type").notNull(),
    size_bytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    source: text("source").notNull().default("subida"), // subida | documentos | portal | vigia
    kind: text("kind"), // factura | ticket | nota_credito | nota_debito | extracto | otro
    status: text("status").notNull().default("leyendo"), // leyendo | para_confirmar | confirmado | descartado | error
    extracted: jsonb("extracted").$type<Record<string, unknown>>(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    low_fields: jsonb("low_fields").$type<string[]>().notNull().default([]),
    validation: jsonb("validation").$type<Record<string, unknown>>(),
    fingerprint: text("fingerprint"),
    duplicate_of: uuid("duplicate_of"),
    account: text("account"),
    provider: text("provider"),
    model: text("model"),
    input_tokens: integer("input_tokens"),
    output_tokens: integer("output_tokens"),
    cost_usd: numeric("cost_usd", { precision: 12, scale: 6 }),
    raw: jsonb("raw").$type<unknown>(),
    error: text("error"),
    synced_at: timestamp("synced_at", { withTimezone: true }),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    confirmed_by: uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
    confirmed_at: timestamp("confirmed_at", { withTimezone: true }),
    exported_at: timestamp("exported_at", { withTimezone: true }),
    target_id: uuid("target_id"), // gasto contable o movimiento de Bitácora creado al confirmar
    created_at: createdAt(),
  },
  (t) => [
    index("smart_documents_org_idx").on(t.studio_id, t.organization_id, t.status),
    index("smart_documents_owner_idx").on(t.owner_user_id, t.status),
    index("smart_documents_fp_idx").on(t.studio_id, t.fingerprint),
  ],
);

/** Extracto bancario importado (archivo original y mapeo) */
export const bank_statements = pgTable(
  "bank_statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    bank: text("bank").notNull(),
    account_label: text("account_label"),
    file_name: text("file_name").notNull(),
    source: text("source").notNull().default("csv"), // csv | pdf
    period_from: date("period_from"),
    period_to: date("period_to"),
    mapping: jsonb("mapping").$type<Record<string, unknown>>(),
    rows: jsonb("rows").$type<string[][]>().notNull().default([]),
    total: integer("total").notNull().default(0),
    duplicates: integer("duplicates").notNull().default(0),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [index("bank_statements_org_idx").on(t.organization_id, t.created_at)],
);

/** Movimiento del extracto con su clase, su estado y el comprobante con el que cruza */
export const bank_movements = pgTable(
  "bank_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    statement_id: uuid("statement_id")
      .notNull()
      .references(() => bank_statements.id, { onDelete: "cascade" }),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    description: text("description").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    cls: text("cls").notNull(), // cobro | pago | comision | impuesto | transferencia
    status: text("status").notNull().default("sin_conciliar"), // sin_conciliar | sugerido | conciliado | sin_factura | ignorado
    match_type: text("match_type"), // factura_emitida | comprobante_recibido
    match_id: uuid("match_id"),
    match_score: numeric("match_score", { precision: 4, scale: 2 }),
    match_reasons: jsonb("match_reasons").$type<string[]>(),
    rule_id: uuid("rule_id"),
    note: text("note"),
    external_id: text("external_id").notNull(),
    raw: jsonb("raw").$type<unknown>(),
    synced_at: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    confirmed_by: uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
    confirmed_at: timestamp("confirmed_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("bank_movements_ext_idx").on(t.organization_id, t.external_id), index("bank_movements_stmt_idx").on(t.statement_id, t.date)],
);

/** Regla guardada: si la descripción contiene el texto, se clasifica sola */
export const bank_rules = pgTable(
  "bank_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    pattern: text("pattern").notNull(),
    sign: text("sign").notNull().default("ambos"), // debito | credito | ambos
    action: text("action").notNull(), // comision | impuesto | ignorar | sin_factura
    label: text("label").notNull(),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [index("bank_rules_org_idx").on(t.studio_id, t.organization_id)],
);

// ───────────── F7 · Cobros (Mercado Pago, suscripciones de Faro, honorarios) ─────────────

/**
 * Cuenta de Mercado Pago que cobra: la de Faro (studio_id null, suscripciones)
 * o la de un tenant (honorarios del estudio, débitos de flotas, links de las
 * facturas de un autónomo). Credenciales cifradas con ENCRYPTION_KEY.
 */
export const mp_accounts = pgTable(
  "mp_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id").references(() => studios.id, { onDelete: "cascade" }),
    access_token_enc: text("access_token_enc").notNull(),
    public_key: text("public_key"),
    webhook_secret_enc: text("webhook_secret_enc"),
    mp_user_id: text("mp_user_id"),
    nickname: text("nickname"),
    status: text("status").notNull().default("sin_probar"), // sin_probar | ok | error
    last_error: text("last_error"),
    tested_at: timestamp("tested_at", { withTimezone: true }),
    updated_by: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("mp_accounts_studio_idx").on(sql`coalesce(${t.studio_id}, '00000000-0000-0000-0000-000000000000'::uuid)`)],
);

/** Suscripción de un tenant a su plan de Faro (prueba, período pago, gracia y cancelación) */
export const faro_subscriptions = pgTable("faro_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  studio_id: uuid("studio_id")
    .notNull()
    .unique()
    .references(() => studios.id, { onDelete: "cascade" }),
  plan_key: text("plan_key").notNull(),
  interval: text("interval").notNull().default("mensual"), // mensual | anual
  status: text("status").notNull().default("prueba"), // prueba | activa | morosa | suspendida | cancelada
  amount: bigint("amount", { mode: "number" }).notNull().default(0), // centavos por período
  currency: text("currency").notNull().default("ARS"),
  trial_ends_at: timestamp("trial_ends_at", { withTimezone: true }),
  current_period_start: timestamp("current_period_start", { withTimezone: true }),
  current_period_end: timestamp("current_period_end", { withTimezone: true }),
  past_due_since: timestamp("past_due_since", { withTimezone: true }),
  cancel_at_period_end: boolean("cancel_at_period_end").notNull().default(false),
  canceled_at: timestamp("canceled_at", { withTimezone: true }),
  pending_plan_key: text("pending_plan_key"),
  pending_interval: text("pending_interval"),
  mp_preapproval_id: text("mp_preapproval_id"),
  mp_status: text("mp_status"),
  init_point: text("init_point"),
  notices: jsonb("notices").$type<string[]>().notNull().default([]),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

/** Cada pago informado por Mercado Pago, conciliado con lo que cobra (idempotente por ID de pago) */
export const mp_payments = pgTable(
  "mp_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    account: text("account").notNull(), // faro | <studio_id>
    studio_id: uuid("studio_id").references(() => studios.id, { onDelete: "cascade" }),
    kind: text("kind"), // sub | hon | flota | fac
    ref_id: uuid("ref_id"),
    mp_payment_id: text("mp_payment_id").notNull(),
    status: text("status").notNull(),
    status_detail: text("status_detail"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("ARS"),
    applied: boolean("applied").notNull().default(false),
    raw: jsonb("raw").$type<unknown>(),
    synced_at: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("mp_payments_ext_idx").on(t.account, t.mp_payment_id), index("mp_payments_ref_idx").on(t.kind, t.ref_id)],
);

/** Registro de cada webhook recibido (firma, resultado), para auditoría e idempotencia */
export const webhook_events = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    account: text("account").notNull(),
    topic: text("topic"),
    data_id: text("data_id"),
    request_id: text("request_id"),
    signature_ok: boolean("signature_ok").notNull(),
    result: text("result").notNull(), // procesado | repetido | rechazado | error | ignorado
    error: text("error"),
    raw: jsonb("raw").$type<unknown>(),
    created_at: createdAt(),
  },
  (t) => [index("webhook_events_idx").on(t.provider, t.data_id)],
);

/** Configuración de la cobranza de honorarios del estudio */
export const billing_settings = pgTable("billing_settings", {
  studio_id: uuid("studio_id")
    .primaryKey()
    .references(() => studios.id, { onDelete: "cascade" }),
  /** Organización que representa al estudio para facturar por ARCA (con su CUIT y la delegación) */
  issuer_organization_id: uuid("issuer_organization_id").references(() => organizations.id, { onDelete: "set null" }),
  reminders: boolean("reminders").notNull().default(true),
  due_day: integer("due_day").notNull().default(10),
  updated_by: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updated_at: updatedAt(),
});

/** Abono mensual de una organización, con su ajuste periódico */
export const fee_plans = pgTable(
  "fee_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    concept: text("concept").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(), // centavos (base)
    start_month: text("start_month").notNull(), // AAAA-MM
    adjust_kind: text("adjust_kind").notNull().default("ninguno"), // ninguno | porcentaje | ipc
    adjust_every: integer("adjust_every").notNull().default(3),
    adjust_percent: numeric("adjust_percent", { precision: 6, scale: 2 }),
    active: boolean("active").notNull().default(true),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [index("fee_plans_org_idx").on(t.studio_id, t.organization_id)],
);

/** Cargo del estado de cuenta de una organización (un período del abono o un cobro suelto) */
export const fee_charges = pgTable(
  "fee_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fee_plan_id: uuid("fee_plan_id").references(() => fee_plans.id, { onDelete: "set null" }),
    period: text("period"), // AAAA-MM
    concept: text("concept").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    due_date: date("due_date").notNull(),
    status: text("status").notNull().default("pendiente"), // pendiente | pagado | anulado
    paid_at: timestamp("paid_at", { withTimezone: true }),
    paid_amount: bigint("paid_amount", { mode: "number" }),
    payment_method: text("payment_method"), // mercadopago | transferencia | efectivo | otro
    mp_preference_id: text("mp_preference_id"),
    payment_url: text("payment_url"),
    invoice_id: uuid("invoice_id"),
    reminders_sent: jsonb("reminders_sent").$type<number[]>().notNull().default([]),
    last_reminder_at: timestamp("last_reminder_at", { withTimezone: true }),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("fee_charges_period_idx").on(t.fee_plan_id, t.period), index("fee_charges_org_idx").on(t.studio_id, t.organization_id, t.status)],
);

// ───────────── F5 · Empleados (legajo, recibos con firma, comunicación interna) ─────────────

/** Documentos del legajo de un empleado (DNI, alta temprana, contrato, certificados) */
export const employee_documents = pgTable(
  "employee_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employee_id: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("otro"), // dni | alta | contrato | certificado | baja | otro
    name: text("name").notNull(),
    storage_path: text("storage_path").notNull(),
    mime_type: text("mime_type").notNull(),
    size_bytes: integer("size_bytes").notNull(),
    uploaded_by: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [index("employee_documents_emp_idx").on(t.employee_id)],
);

/** Historial del legajo: altas, bajas, cambios, licencias y notas */
export const employee_events = pgTable(
  "employee_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employee_id: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // alta | baja | cambio | licencia | horas_extra | documento | nota
    date: date("date").notNull(),
    detail: text("detail").notNull(),
    request_id: uuid("request_id"),
    actor_id: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [index("employee_events_emp_idx").on(t.employee_id, t.date)],
);

/** Lote de recibos de un período (PDFs individuales o uno único dividido por CUIL) */
export const payslip_batches = pgTable(
  "payslip_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // AAAA-MM
    mode: text("mode").notNull(), // individual | unico
    file_name: text("file_name"),
    status: text("status").notNull().default("revision"), // revision | publicado
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    published_at: timestamp("published_at", { withTimezone: true }),
    published_by: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [index("payslip_batches_org_idx").on(t.organization_id, t.period)],
);

/** Recibo de un empleado con su firma (conforme / no conforme) y la constancia */
export const payslips = pgTable(
  "payslips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batch_id: uuid("batch_id")
      .notNull()
      .references(() => payslip_batches.id, { onDelete: "cascade" }),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employee_id: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    cuil: text("cuil"),
    period: text("period").notNull(),
    file_name: text("file_name").notNull(),
    storage_path: text("storage_path").notNull(),
    size_bytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    pages: jsonb("pages").$type<number[]>(),
    match: text("match"), // auto | manual
    status: text("status").notNull().default("sin_asignar"), // sin_asignar | asignado | publicado | conforme | no_conforme
    published_at: timestamp("published_at", { withTimezone: true }),
    viewed_at: timestamp("viewed_at", { withTimezone: true }),
    signed_at: timestamp("signed_at", { withTimezone: true }),
    decision: text("decision"),
    reason: text("reason"),
    sign_ip: text("sign_ip"),
    sign_user_agent: text("sign_user_agent"),
    sign_device: text("sign_device"),
    seal: text("seal"),
    reminders_sent: jsonb("reminders_sent").$type<number[]>().notNull().default([]),
    created_at: createdAt(),
  },
  (t) => [index("payslips_batch_idx").on(t.batch_id), index("payslips_emp_idx").on(t.employee_id, t.period)],
);

/** Comunicado interno de la organización (o del estudio en su nombre) */
export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    area: text("area"), // null = todos
    attachments: jsonb("attachments").$type<{ name: string; path: string; mime: string; size: number }[]>().notNull().default([]),
    require_ack: boolean("require_ack").notNull().default(true),
    from_studio: boolean("from_studio").notNull().default(false),
    author_id: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [index("announcements_org_idx").on(t.organization_id, t.created_at)],
);

/** Destinatarios de un comunicado: cuándo lo leyó y cuándo confirmó la lectura */
export const announcement_reads = pgTable(
  "announcement_reads",
  {
    announcement_id: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    employee_id: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    user_id: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    read_at: timestamp("read_at", { withTimezone: true }),
    ack_at: timestamp("ack_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.announcement_id, t.employee_id] })],
);

// ───────────── F4 · Flujos (automatizaciones) ─────────────

/** Flujo: disparador + grafo del canvas (nodos y conexiones), con su estado */
export const flows = pgTable(
  "flows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("borrador"), // borrador | activo | pausado
    trigger_type: text("trigger_type").notNull(), // evento | horario | webhook | vigia
    trigger_event: text("trigger_event"),
    graph: jsonb("graph").$type<Record<string, unknown>>().notNull(),
    template_key: text("template_key"),
    webhook_token: text("webhook_token"),
    next_run_at: timestamp("next_run_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updated_by: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    last_run_at: timestamp("last_run_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("flows_studio_idx").on(t.studio_id, t.status), index("flows_event_idx").on(t.trigger_event, t.status), uniqueIndex("flows_webhook_idx").on(t.webhook_token)],
);

/** Corrida de un flujo (cola en Postgres): estado, contexto, reintentos e idempotencia */
export const flow_runs = pgTable(
  "flow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flow_id: uuid("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    idempotency_key: text("idempotency_key").notNull(),
    status: text("status").notNull().default("pendiente"), // pendiente | en_curso | esperando | completada | error | cancelada | rechazada
    source: text("source").notNull(), // evento | horario | webhook | vigia | prueba
    context: jsonb("context").$type<Record<string, unknown>>().notNull(),
    cursor: jsonb("cursor").$type<string[]>().notNull().default([]), // nodos por ejecutar
    attempts: integer("attempts").notNull().default(0),
    next_attempt_at: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    waiting_approval_id: uuid("waiting_approval_id"),
    error: text("error"),
    started_at: timestamp("started_at", { withTimezone: true }),
    finished_at: timestamp("finished_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("flow_runs_idem_idx").on(t.flow_id, t.idempotency_key), index("flow_runs_queue_idx").on(t.status, t.next_attempt_at)],
);

/** Registro de cada paso de una corrida */
export const flow_steps = pgTable(
  "flow_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    run_id: uuid("run_id")
      .notNull()
      .references(() => flow_runs.id, { onDelete: "cascade" }),
    node_id: text("node_id").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(), // ok | error | esperando | saltado | rechazado
    attempt: integer("attempt").notNull().default(1),
    input: jsonb("input").$type<unknown>(),
    output: jsonb("output").$type<unknown>(),
    error: text("error"),
    started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finished_at: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("flow_steps_run_idx").on(t.run_id, t.started_at)],
);

/** Eventos que emiten los módulos (cola para los flujos), sin duplicados por clave */
export const flow_events = pgTable(
  "flow_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    organization_id: uuid("organization_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    dedupe_key: text("dedupe_key").notNull(),
    processed_at: timestamp("processed_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("flow_events_dedupe_idx").on(t.studio_id, t.dedupe_key), index("flow_events_pending_idx").on(t.processed_at)],
);

/** Tareas del equipo del estudio (las crean los flujos; la vista de cartera llega en F9) */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    detail: text("detail"),
    status: text("status").notNull().default("pendiente"), // pendiente | en_curso | hecha
    due_date: date("due_date"),
    assignee_id: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    source: text("source").notNull().default("manual"), // manual | flujo | obligacion
    source_ref: text("source_ref"),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("tasks_studio_idx").on(t.studio_id, t.status, t.due_date), uniqueIndex("tasks_source_idx").on(t.studio_id, t.source, t.source_ref)],
);

// ───────────────────────── F9: consultas con IA, marca blanca y WhatsApp ─────────────────────────

/**
 * Consultas laborales y fiscales (ai_consults): el cliente consulta desde el
 * portal (una solicitud de tipo consulta), la IA prepara el borrador y una
 * persona del estudio lo revisa y lo aprueba antes de que salga.
 */
export const ai_consults = pgTable(
  "ai_consults",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    request_id: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(), // laboral | fiscal
    question: text("question").notNull(),
    status: text("status").notNull().default("generando"), // generando | borrador | aprobada | descartada | error
    draft: text("draft"),
    final_body: text("final_body"),
    edited: boolean("edited").notNull().default(false),
    error: text("error"),
    model: text("model"),
    provider: text("provider"),
    input_tokens: integer("input_tokens"),
    output_tokens: integer("output_tokens"),
    cost_usd: numeric("cost_usd", { precision: 10, scale: 5 }),
    reviewed_by: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("ai_consults_request_idx").on(t.request_id), index("ai_consults_studio_idx").on(t.studio_id, t.status)],
);

/** Marca blanca del portal (plan Avanzado): logo, colores y dominio propio del estudio */
export const studio_branding = pgTable("studio_branding", {
  studio_id: uuid("studio_id")
    .primaryKey()
    .references(() => studios.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  display_name: text("display_name"),
  logo_path: text("logo_path"),
  logo_mime: text("logo_mime"),
  primary_color: text("primary_color"),
  accent_color: text("accent_color"),
  /** Host en minúsculas, sin puerto (ej.: portal.estudio.com.ar) */
  custom_domain: text("custom_domain").unique(),
  domain_status: text("domain_status").notNull().default("sin_dominio"), // sin_dominio | pendiente | verificado
  domain_token: text("domain_token"),
  domain_checked_at: timestamp("domain_checked_at", { withTimezone: true }),
  domain_verified_at: timestamp("domain_verified_at", { withTimezone: true }),
  updated_by: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updated_at: updatedAt(),
});

/**
 * Números de WhatsApp Business Cloud API. studio_id null = el número de Faro
 * (Faro Manager), que los estudios pueden usar compartido; con studio_id, el
 * número propio del estudio. Token y secreto de la app, cifrados.
 */
export const whatsapp_accounts = pgTable("whatsapp_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  studio_id: uuid("studio_id")
    .unique()
    .references(() => studios.id, { onDelete: "cascade" }),
  mode: text("mode").notNull().default("propio"), // propio | compartido (usa el número de Faro)
  phone_number_id: text("phone_number_id"),
  waba_id: text("waba_id"),
  display_phone: text("display_phone"),
  access_token_enc: text("access_token_enc"),
  app_secret_enc: text("app_secret_enc"),
  verify_token: text("verify_token"),
  status: text("status").notNull().default("activa"), // activa | pausada
  last_error: text("last_error"),
  updated_by: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

/** Plantillas aprobadas por Meta (se sincronizan desde la cuenta) */
export const whatsapp_templates = pgTable(
  "whatsapp_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    account_id: uuid("account_id")
      .notNull()
      .references(() => whatsapp_accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    language: text("language").notNull().default("es_AR"),
    category: text("category"),
    body: text("body").notNull(),
    params: integer("params").notNull().default(0),
    status: text("status").notNull(), // APPROVED | PENDING | REJECTED
    external_id: text("external_id"),
    synced_at: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    raw: jsonb("raw"),
  },
  (t) => [uniqueIndex("whatsapp_templates_name_idx").on(t.account_id, t.name, t.language)],
);

/** Números de los clientes verificados con un código (consentimiento para avisos) */
export const whatsapp_contacts = pgTable(
  "whatsapp_contacts",
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
    /** Solo dígitos, con código de país (5491122334455) */
    phone: text("phone").notNull(),
    code_hash: text("code_hash"),
    code_expires_at: timestamp("code_expires_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    verified_at: timestamp("verified_at", { withTimezone: true }),
    opt_in_avisos: boolean("opt_in_avisos").notNull().default(true),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("whatsapp_contacts_user_idx").on(t.organization_id, t.user_id), index("whatsapp_contacts_phone_idx").on(t.phone)],
);

/** Mensajes enviados y recibidos: fuente, ID externo, fecha, validación y registro original */
export const whatsapp_messages = pgTable(
  "whatsapp_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id").references(() => studios.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    account_id: uuid("account_id").references(() => whatsapp_accounts.id, { onDelete: "set null" }),
    direction: text("direction").notNull(), // saliente | entrante
    phone: text("phone").notNull(),
    kind: text("kind").notNull(), // plantilla | texto | imagen | documento | otro
    template: text("template"),
    body: text("body"),
    media_path: text("media_path"),
    media_mime: text("media_mime"),
    status: text("status").notNull(), // enviado | entregado | leido | fallido | recibido | sin_contacto
    error: text("error"),
    /** A qué quedó vinculado: solicitud, lectura inteligente, consulta al Vigía */
    entity_type: text("entity_type"),
    entity_id: uuid("entity_id"),
    source: text("source").notNull().default("whatsapp"),
    external_id: text("external_id"),
    validation: text("validation").notNull().default("sin_validar"), // sin_validar | firma_ok | firma_invalida
    raw: jsonb("raw"),
    synced_at: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("whatsapp_messages_external_idx").on(t.external_id), index("whatsapp_messages_studio_idx").on(t.studio_id, t.created_at)],
);

// ───────────────────────── Escudo de responsabilidad (principios §1.b y §1.c) ─────────────────────────

/** Tareas que requieren un contador matriculado: Faro no las acompaña y deriva. Valores por defecto en src/modules/escudo/catalog.ts */
export const professional_tasks = pgTable("professional_tasks", {
  key: text("key").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
  active: boolean("active").notNull().default(true),
  /** a_validar | validada (por un contador: nombre y matrícula en validated_by) */
  validation: text("validation").notNull().default("a_validar"),
  validated_by: text("validated_by"),
  position: integer("position").notNull().default(0),
  updated_by: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updated_at: updatedAt(),
});

/** Reglas del disparador de derivación (umbrales «a validar» por un contador) */
export const derivation_rules = pgTable("derivation_rules", {
  key: text("key").primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  need: text("need").notNull(),
  threshold: numeric("threshold", { precision: 14, scale: 4 }),
  snooze_days: integer("snooze_days").notNull().default(30),
  active: boolean("active").notNull().default(true),
  validation: text("validation").notNull().default("a_validar"),
  validated_by: text("validated_by"),
  updated_by: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updated_at: updatedAt(),
});

/** Sugerencia de sumar un contador para una persona: descartable, vuelve después de snooze_days */
export const derivation_suggestions = pgTable(
  "derivation_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rule_key: text("rule_key").notNull(),
    /** Qué necesita y por qué (datos del momento): lo que llega a la Red */
    context: jsonb("context").$type<{ need: string; why: string; data?: Record<string, unknown> }>().notNull(),
    status: text("status").notNull().default("activa"), // activa | descartada | enviada
    snoozed_until: timestamp("snoozed_until", { withTimezone: true }),
    triggered_at: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("derivation_suggestions_user_rule_idx").on(t.user_id, t.rule_key)],
);

// ───────────────────────── Cajas (principios §10, §11, §17 y §18) ─────────────────────────

/** personal: la Bitácora (sus movimientos siguen en bitacora_entries) · negocio: la actividad · compartida: con otras personas */
export const boxKind = pgEnum("box_kind", ["personal", "negocio", "compartida"]);

/** Una caja es un mundo cerrado: su gente, su plata y su propósito. Entre cajas solo pasa plata con un movimiento explícito. */
export const boxes = pgTable(
  "boxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: boxKind("kind").notNull(),
    /** Compartidas: pareja | familia | amigos | negocio | padres (opciones prearmadas) */
    purpose: text("purpose"),
    name: text("name").notNull(),
    owner_id: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Invitación por link (solo el hash) */
    invite_token_hash: text("invite_token_hash"),
    invite_created_at: timestamp("invite_created_at", { withTimezone: true }),
    archived_at: timestamp("archived_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("boxes_owner_individual_idx").on(t.owner_id, t.kind).where(sql`${t.kind} in ('personal', 'negocio')`), index("boxes_owner_idx").on(t.owner_id)],
);

export const box_members = pgTable(
  "box_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    box_id: uuid("box_id")
      .notNull()
      .references(() => boxes.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("integrante"), // titular | integrante
    status: text("status").notNull().default("activo"), // activo | salio
    joined_at: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    left_at: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("box_members_box_user_idx").on(t.box_id, t.user_id), index("box_members_user_idx").on(t.user_id)],
);

/** Metas de ahorro dentro de una caja */
export const box_goals = pgTable("box_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  box_id: uuid("box_id")
    .notNull()
    .references(() => boxes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  target: bigint("target", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("ARS"),
  created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  archived_at: timestamp("archived_at", { withTimezone: true }),
  created_at: createdAt(),
});

/**
 * Movimientos de una caja de negocio o compartida (los de la caja personal son
 * los de la Bitácora). kind: gasto | ingreso | ahorro. En las compartidas,
 * quién pagó, el final (registrar o dividir) y si la persona que pagó lo
 * confirmó: hasta entonces no cuenta en su seguimiento.
 */
export const box_entries = pgTable(
  "box_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    box_id: uuid("box_id")
      .notNull()
      .references(() => boxes.id, { onDelete: "cascade" }),
    // Sin clave foránea: el movimiento queda aunque se borre la cuenta de quien lo cargó (y no choca con el borrado en cascada de la caja)
    created_by: uuid("created_by"),
    paid_by: uuid("paid_by"),
    kind: text("kind").notNull().default("gasto"),
    /** En centavos */
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("ARS"),
    date: date("date").notNull(),
    category: text("category").notNull().default("otros"),
    description: text("description").notNull(),
    note: text("note"),
    /** registrar | dividir (compartidas) */
    mode: text("mode").notNull().default("registrar"),
    /** confirmado | pendiente (lo cargó otra persona y falta que quien pagó lo confirme) */
    status: text("status").notNull().default("confirmado"),
    confirmed_at: timestamp("confirmed_at", { withTimezone: true }),
    goal_id: uuid("goal_id"),
    /** Negocio: ingreso con factura emitida (false = sin facturar, zona gris §13) y gasto deducible */
    invoiced: boolean("invoiced").notNull().default(false),
    deductible: boolean("deductible").notNull().default(false),
    /** manual | vigia | bitacora (movido) | sueldo | aporte */
    source: text("source").notNull().default("manual"),
    origin_id: uuid("origin_id"),
    /** La misma carga en la caja personal (una carga, varios destinos) */
    personal_entry_id: uuid("personal_entry_id"),
    transfer_id: uuid("transfer_id"),
    copilot_message_id: uuid("copilot_message_id"),
    /** Registro original (por ejemplo, el movimiento de la Bitácora que se movió) */
    raw: jsonb("raw").$type<unknown>(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("box_entries_box_date_idx").on(t.box_id, t.date)],
);

/** Dividir: cuánto le toca a cada integrante y si confirmó que se lo pagó a quien puso la plata */
export const box_entry_shares = pgTable(
  "box_entry_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entry_id: uuid("entry_id")
      .notNull()
      .references(() => box_entries.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    /** Quien debe confirma que pagó; recién ahí cuenta en su seguimiento */
    paid_at: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("box_entry_shares_entry_user_idx").on(t.entry_id, t.user_id)],
);

/** Movimiento explícito entre cajas: el sueldo del dueño (negocio → personal) o un aporte (personal → otra caja) */
export const box_transfers = pgTable(
  "box_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // sueldo | aporte
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** null = la caja personal del usuario (sin clave foránea: el registro del movimiento queda) */
    from_box_id: uuid("from_box_id"),
    to_box_id: uuid("to_box_id"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("ARS"),
    date: date("date").notNull(),
    salary_id: uuid("salary_id"),
    note: text("note"),
    created_at: createdAt(),
  },
  (t) => [index("box_transfers_user_idx").on(t.user_id, t.date)],
);

/** Sueldo del dueño: monto y frecuencia; se registra solo en cada fecha */
export const box_salaries = pgTable("box_salaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  box_id: uuid("box_id")
    .notNull()
    .unique()
    .references(() => boxes.id, { onDelete: "cascade" }),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("ARS"),
  frequency: text("frequency").notNull().default("mensual"), // mensual | quincenal | semanal
  next_date: date("next_date").notNull(),
  active: boolean("active").notNull().default(true),
  updated_at: updatedAt(),
});

// ───────────────────────── Conexión con un contador (principios §2, §4 a §9) ─────────────────────────

/**
 * Conexión, no copia: el estudio accede con un permiso sobre la cuenta del
 * usuario y trabaja sobre sus datos en vivo; nada se copia a su espacio.
 * Estados: invitada (la inició el estudio y falta el sí del usuario) →
 * admision (el estudio revisa) → acuerdo (firman las dos partes) → activa →
 * en_cierre / en_disputa → cerrada. También rechazada o cancelada.
 */
export const account_connections = pgTable(
  "account_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** La persona o el autónomo dueño de los datos */
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    user_studio_id: uuid("user_studio_id").references(() => studios.id, { onDelete: "set null" }),
    /** El estudio que pide o recibe el permiso */
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    initiated_by: text("initiated_by").notNull(), // usuario | estudio
    /** Alcances: caja de negocio y lo fiscal siempre; las cajas personales solo si el usuario las activa */
    scope_personal: boolean("scope_personal").notNull().default(false),
    /** delegar (por defecto: el contador opera y el usuario mira) | proponer (cada acción queda para aprobar) */
    autonomy: text("autonomy").notNull().default("delegar"),
    message: text("message"),
    /** Admisión */
    interview_requested_at: timestamp("interview_requested_at", { withTimezone: true }),
    interview_note: text("interview_note"),
    info_request: text("info_request"),
    info_response: text("info_response"),
    decision_reason: text("decision_reason"),
    decided_by: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decided_at: timestamp("decided_at", { withTimezone: true }),
    /** Acuerdo de servicio (el de Flotas) firmado por las dos partes y políticas aceptadas */
    terms: jsonb("terms").$type<{ services: string; monthlyPrice: number; noticeDays: number; version: string }>(),
    agreement_id: uuid("agreement_id"),
    studio_signed_by: uuid("studio_signed_by").references(() => users.id, { onDelete: "set null" }),
    studio_signed_name: text("studio_signed_name"),
    studio_signed_at: timestamp("studio_signed_at", { withTimezone: true }),
    user_signed_name: text("user_signed_name"),
    user_signed_at: timestamp("user_signed_at", { withTimezone: true }),
    policies_accepted_at: timestamp("policies_accepted_at", { withTimezone: true }),
    started_at: timestamp("started_at", { withTimezone: true }),
    /** Desconexión con mediación */
    closing_started_at: timestamp("closing_started_at", { withTimezone: true }),
    closing_initiated_by: text("closing_initiated_by"),
    closing_reason: text("closing_reason"),
    readonly_until: timestamp("readonly_until", { withTimezone: true }),
    fees_zero_at: timestamp("fees_zero_at", { withTimezone: true }),
    pending_delivered_at: timestamp("pending_delivered_at", { withTimezone: true }),
    user_clear_at: timestamp("user_clear_at", { withTimezone: true }),
    studio_clear_at: timestamp("studio_clear_at", { withTimezone: true }),
    closed_at: timestamp("closed_at", { withTimezone: true }),
    /** Resumen semanal opcional de «Lo que hizo tu contador» */
    weekly_summary: boolean("weekly_summary").notNull().default(false),
    weekly_sent_at: timestamp("weekly_sent_at", { withTimezone: true }),
    /** Origen: flota (acuerdo existente), red, invitación */
    source: text("source").notNull().default("red"),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("account_connections_user_idx").on(t.user_id), index("account_connections_studio_idx").on(t.studio_id, t.status)],
);

/** «Lo que hizo tu contador»: cada acción con quién, qué, cuándo, y antes y después (o la propuesta para aprobar) */
export const connection_actions = pgTable(
  "connection_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connection_id: uuid("connection_id")
      .notNull()
      .references(() => account_connections.id, { onDelete: "cascade" }),
    actor_id: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actor_name: text("actor_name").notNull(),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    entity_type: text("entity_type"),
    entity_id: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    /** Lo que hay que hacer si se aprueba (modo «proponer y aprobar») */
    payload: jsonb("payload"),
    status: text("status").notNull().default("aplicada"), // aplicada | propuesta | aprobada | rechazada
    decided_at: timestamp("decided_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [index("connection_actions_conn_idx").on(t.connection_id, t.created_at)],
);

/** Canal de mensajes de la desconexión en disputa */
export const connection_messages = pgTable("connection_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  connection_id: uuid("connection_id")
    .notNull()
    .references(() => account_connections.id, { onDelete: "cascade" }),
  author_id: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  side: text("side").notNull(), // usuario | estudio
  body: text("body").notNull(),
  created_at: createdAt(),
});

/** Calificaciones: durante la relación (a los 30 días y cada 6 meses, salteables) y al cierre. Solo se guardan */
export const connection_ratings = pgTable("connection_ratings", {
  id: uuid("id").primaryKey().defaultRandom(),
  connection_id: uuid("connection_id")
    .notNull()
    .references(() => account_connections.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // periodica | cierre
  score: integer("score"),
  comment: text("comment"),
  skipped: boolean("skipped").notNull().default(false),
  created_at: createdAt(),
});
