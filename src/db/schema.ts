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
    needs: text("needs").array().notNull().default(sql`'{}'::text[]`),
    message: text("message"),
    source: leadSource("source").notNull().default("contacto"),
    status: leadStatus("status").notNull().default("nuevo"),
    assigned_to: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    next_action: text("next_action"),
    next_action_at: date("next_action_at"),
    notes: text("notes"),
    lost_reason: text("lost_reason"),
    client_id: uuid("client_id").references((): AnyPgColumn => clients.id, { onDelete: "set null" }),
  },
  (t) => [index("leads_studio_status_idx").on(t.studio_id, t.status)],
);

// ───────────────────────── Clientes ─────────────────────────

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    created_at: createdAt(),
    updated_at: updatedAt(),
    business_name: text("business_name").notNull(),
    cuit: text("cuit"),
    regime: taxRegime("regime").notNull().default("otro"),
    category: text("category"), // categoría de monotributo, tipo societario, etc.
    services: text("services").array().notNull().default(sql`'{}'::text[]`),
    monthly_fee: numeric("monthly_fee", { precision: 12, scale: 2 }),
    contact_name: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    lead_id: uuid("lead_id").references((): AnyPgColumn => leads.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("clients_studio_cuit_idx").on(t.studio_id, t.cuit).where(sql`${t.cuit} is not null`)],
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
  features: text("features").array().notNull().default(sql`'{}'::text[]`),
  highlighted: boolean("highlighted").notNull().default(false),
  position: integer("position").notNull().default(0),
  published: boolean("published").notNull().default(true),
  created_at: createdAt(),
});

// ───────────────────────── Fase 2: portal del cliente ─────────────────────────

// Usuarios cliente con acceso al portal
export const client_users = pgTable(
  "client_users",
  {
    client_id: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.client_id, t.user_id] })],
);

// Vencimientos por cliente (generados según terminación de CUIT y régimen)
export const obligations = pgTable(
  "obligations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
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
  (t) => [index("obligations_due_idx").on(t.studio_id, t.due_date), index("obligations_client_idx").on(t.client_id, t.due_date)],
);

// Documentos: archivos en disco (UPLOADS_DIR) con nombre aleatorio; acá el nombre original.
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
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
  (t) => [index("documents_client_idx").on(t.client_id, t.created_at)],
);

// Solicitudes del cliente (consulta, pedido de factura, alta o baja de empleado, otro)
export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    type: requestType("type").notNull().default("consulta"),
    subject: text("subject").notNull(),
    status: requestStatus("status").notNull().default("abierta"),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("requests_studio_status_idx").on(t.studio_id, t.status), index("requests_client_idx").on(t.client_id)],
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
// empresa por cliente, se puede asignar cada una a un cliente de la plataforma.
export const tango_companies = pgTable(
  "tango_companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studio_id: uuid("studio_id")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    company_id: text("company_id").notNull(), // ID de empresa de Tango (header Company)
    name: text("name"),
    client_id: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    last_sync_at: timestamp("last_sync_at", { withTimezone: true }),
    created_at: createdAt(),
  },
  (t) => [unique("tango_companies_studio_company_key").on(t.studio_id, t.company_id)],
);

// Registros traídos de Tango, siempre con el JSON crudo. client_id vincula un
// cliente de Tango (proceso 2117) con un cliente de la plataforma.
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
    client_id: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    synced_at: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("tango_records_key").on(t.studio_id, t.company_id, t.process, t.external_id),
    index("tango_records_client_idx").on(t.client_id),
  ],
);
