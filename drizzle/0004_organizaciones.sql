CREATE TYPE "public"."audit_result" AS ENUM('ok', 'denegado', 'error');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pendiente', 'aceptada', 'revocada', 'vencida');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('activa', 'suspendida', 'revocada');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('administrador', 'direccion', 'administracion', 'rrhh', 'consulta');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('onboarding', 'activa', 'pausada', 'baja');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('bajo', 'medio', 'alto');--> statement-breakpoint
CREATE TYPE "public"."staff_assignment" AS ENUM('responsable', 'colaborador');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid,
	"organization_id" uuid,
	"actor_id" uuid,
	"actor_label" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"result" "audit_result" DEFAULT 'ok' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "org_role" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "invitation_status" DEFAULT 'pendiente' NOT NULL,
	"invited_by" uuid,
	"needs_approval" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "legal_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"cuit" text,
	"business_name" text NOT NULL,
	"regime" "tax_regime" DEFAULT 'otro' NOT NULL,
	"category" text,
	"tax_address" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "org_role" DEFAULT 'consulta' NOT NULL,
	"status" "membership_status" DEFAULT 'activa' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_org_user_key" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organization_modules" (
	"organization_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activated_by" uuid,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_modules_organization_id_module_key_pk" PRIMARY KEY("organization_id","module_key")
);
--> statement-breakpoint
CREATE TABLE "organization_staff" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assignment" "staff_assignment" DEFAULT 'colaborador' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_staff_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"name" text NOT NULL,
	"service_plan_id" uuid,
	"status" "organization_status" DEFAULT 'onboarding' NOT NULL,
	"risk_level" "risk_level" DEFAULT 'bajo' NOT NULL,
	"notes" text,
	"contact_name" text,
	"email" text,
	"phone" text,
	"services" text[] DEFAULT '{}'::text[] NOT NULL,
	"monthly_fee" numeric(12, 2),
	"limit_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"max_legal_entities" integer NOT NULL,
	"max_users" integer NOT NULL,
	"max_modules" integer NOT NULL,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_plans_studio_key" UNIQUE("studio_id","key")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "legal_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "obligations" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "obligations" ADD COLUMN "legal_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "legal_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "tango_companies" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "tango_companies" ADD COLUMN "legal_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "tango_records" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "tango_records" ADD COLUMN "legal_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_modules" ADD CONSTRAINT "organization_modules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_modules" ADD CONSTRAINT "organization_modules_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_staff" ADD CONSTRAINT "organization_staff_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_staff" ADD CONSTRAINT "organization_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_service_plan_id_service_plans_id_fk" FOREIGN KEY ("service_plan_id") REFERENCES "public"."service_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_org_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_studio_idx" ON "audit_log" USING btree ("studio_id","created_at");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email","status");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_entities_studio_cuit_idx" ON "legal_entities" USING btree ("studio_id","cuit") WHERE "legal_entities"."cuit" is not null;--> statement-breakpoint
CREATE INDEX "legal_entities_org_idx" ON "legal_entities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_staff_one_lead_idx" ON "organization_staff" USING btree ("organization_id") WHERE "organization_staff"."assignment" = 'responsable';--> statement-breakpoint
CREATE INDEX "organizations_studio_idx" ON "organizations" USING btree ("studio_id","name");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_companies" ADD CONSTRAINT "tango_companies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_companies" ADD CONSTRAINT "tango_companies_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_records" ADD CONSTRAINT "tango_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_records" ADD CONSTRAINT "tango_records_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- ───── Planes de servicio (uno de cada por estudio) ─────
INSERT INTO "service_plans" ("studio_id", "key", "name", "description", "max_legal_entities", "max_users", "max_modules", "features", "position")
SELECT s."id", p."key", p."name", p."description", p."le", p."us", p."mo", p."features", p."pos"
FROM "studios" s
CROSS JOIN (VALUES
  ('negocio_en_orden', 'Negocio en Orden', 'Para pequeñas empresas que necesitan centralizar y ordenar su operación mensual.', 1, 5, 1,
    ARRAY['Responsable del estudio asignado','Calendario de obligaciones','Vencimientos, importes y enlaces de pago','Repositorio seguro de documentos','Carga y clasificación asistida','Solicitudes con seguimiento','Alertas automáticas','Resumen operativo mensual','Primera respuesta en menos de 24 horas hábiles','Revisión trimestral'], 1),
  ('empresa_en_control', 'Empresa en Control', 'Para PyMEs con más movimiento, empleados o varias personas involucradas en la administración.', 2, 12, 3,
    ARRAY['Todo lo de Negocio en Orden','Roles y permisos por área','Tablero mensual de situación','Reunión mensual','Seguimiento de documentación pendiente','Automatizaciones y recordatorios configurables','Indicadores operativos básicos','Atención prioritaria'], 2),
  ('gestion_estrategica', 'Gestión Estratégica', 'Para organizaciones de mayor complejidad que necesitan información para decidir.', 5, 25, 5,
    ARRAY['Todo lo de Empresa en Control','Equipo de atención asignado','Informe mensual ejecutivo','Reunión mensual de dirección','Planificación fiscal y financiera','Proyecciones y alertas de desvíos','Indicadores personalizados','Automatizaciones avanzadas','Seguimiento quincenal de temas críticos'], 3)
) AS p("key", "name", "description", "le", "us", "mo", "features", "pos")
ON CONFLICT ("studio_id", "key") DO NOTHING;
--> statement-breakpoint
-- ───── Cada cliente pasa a ser una organización (mismo id) con una razón social ─────
INSERT INTO "organizations" ("id", "studio_id", "name", "status", "notes", "contact_name", "email", "phone", "services", "monthly_fee", "lead_id", "created_at", "updated_at")
SELECT "id", "studio_id", "business_name", CASE WHEN "active" THEN 'activa'::organization_status ELSE 'baja'::organization_status END,
  "notes", "contact_name", "email", "phone", "services", "monthly_fee", "lead_id", "created_at", "updated_at"
FROM "clients";
--> statement-breakpoint
INSERT INTO "legal_entities" ("studio_id", "organization_id", "cuit", "business_name", "regime", "category", "tax_address", "active", "created_at", "updated_at")
SELECT "studio_id", "id", "cuit", "business_name", "regime", "category", "address", "active", "created_at", "updated_at"
FROM "clients";
--> statement-breakpoint
UPDATE "obligations" t SET "organization_id" = t."client_id",
  "legal_entity_id" = (SELECT le."id" FROM "legal_entities" le WHERE le."organization_id" = t."client_id" LIMIT 1);
--> statement-breakpoint
UPDATE "documents" t SET "organization_id" = t."client_id",
  "legal_entity_id" = (SELECT le."id" FROM "legal_entities" le WHERE le."organization_id" = t."client_id" LIMIT 1);
--> statement-breakpoint
UPDATE "requests" t SET "organization_id" = t."client_id",
  "legal_entity_id" = (SELECT le."id" FROM "legal_entities" le WHERE le."organization_id" = t."client_id" LIMIT 1);
--> statement-breakpoint
UPDATE "tango_companies" t SET "organization_id" = t."client_id",
  "legal_entity_id" = (SELECT le."id" FROM "legal_entities" le WHERE le."organization_id" = t."client_id" LIMIT 1)
WHERE t."client_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "tango_records" t SET "organization_id" = t."client_id",
  "legal_entity_id" = (SELECT le."id" FROM "legal_entities" le WHERE le."organization_id" = t."client_id" LIMIT 1)
WHERE t."client_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "leads" SET "organization_id" = "client_id" WHERE "client_id" IS NOT NULL;
--> statement-breakpoint
-- ───── Accesos al portal → membresías con rol Administrador ─────
INSERT INTO "memberships" ("studio_id", "organization_id", "user_id", "role", "status", "created_at")
SELECT c."studio_id", cu."client_id", cu."user_id", 'administrador',
  CASE WHEN u."active" THEN 'activa'::membership_status ELSE 'suspendida'::membership_status END, u."created_at"
FROM "client_users" cu
JOIN "clients" c ON c."id" = cu."client_id"
JOIN "users" u ON u."id" = cu."user_id"
ON CONFLICT DO NOTHING;
