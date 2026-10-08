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

// ───────────────────────── Fase 2 (estructura lista, sin UI todavía) ─────────────────────────

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
    assigned_to: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    created_at: createdAt(),
  },
  (t) => [index("obligations_due_idx").on(t.studio_id, t.due_date)],
);

// Documentos (archivos en el almacenamiento que se defina en la fase 2)
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  studio_id: uuid("studio_id")
    .notNull()
    .references(() => studios.id, { onDelete: "cascade" }),
  client_id: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  storage_path: text("storage_path").notNull(),
  category: text("category"), // comprobantes, constancias, ddjj, recibos, otro
  period: text("period"),
  uploaded_by: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  created_at: createdAt(),
});
