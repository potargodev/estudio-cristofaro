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

export const userRole = pgEnum("user_role", ["admin", "contador", "cliente"]);
export const leadStatus = pgEnum("lead_status", ["nuevo", "contactado", "presupuesto", "ganado", "perdido"]);
export const leadSource = pgEnum("lead_source", ["diagnostico", "contacto", "whatsapp", "manual", "otro"]);
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
export const orgRole = pgEnum("org_role", ["administrador", "direccion", "administracion", "rrhh", "consulta"]);
export const membershipStatus = pgEnum("membership_status", ["activa", "suspendida", "revocada"]);
export const invitationStatus = pgEnum("invitation_status", ["pendiente", "aceptada", "revocada", "vencida"]);
export const staffAssignment = pgEnum("staff_assignment", ["responsable", "colaborador"]);
export const auditResult = pgEnum("audit_result", ["ok", "denegado", "error"]);

// ───────────────────────── Estudios ─────────────────────────

export const studios = pgTable("studios", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
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
