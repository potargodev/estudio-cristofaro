ALTER TYPE "public"."tenant_status" ADD VALUE 'prueba' BEFORE 'suspendido';--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"email" text,
	"cuil" text,
	"position" text,
	"start_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Roles de tenant sin pérdida: admin pasa a dueno y autonomo a titular (mismos usuarios, mismo dato)
ALTER TYPE "public"."user_role" RENAME VALUE 'admin' TO 'dueno';--> statement-breakpoint
ALTER TYPE "public"."user_role" RENAME VALUE 'autonomo' TO 'titular';--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "limits" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "industries" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "tax_regime" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "fiscal_address" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "onboarding" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employees_org_idx" ON "employees" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_org_user_idx" ON "employees" USING btree ("organization_id","user_id") WHERE "employees"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_org_email_idx" ON "employees" USING btree ("organization_id","email") WHERE "employees"."email" is not null;--> statement-breakpoint
-- Nivel plataforma: owner/soporte pasan a faro_owner/faro_support
UPDATE "users" SET "faro_role" = 'faro_owner' WHERE "faro_role" = 'owner';--> statement-breakpoint
UPDATE "users" SET "faro_role" = 'faro_support' WHERE "faro_role" = 'soporte';--> statement-breakpoint
-- Dueño de cada tenant: el primer dueño (o titular) que se creó
UPDATE "studios" s SET "owner_user_id" = (
  SELECT u."id" FROM "users" u WHERE u."studio_id" = s."id" AND u."role" IN ('dueno', 'titular') ORDER BY u."created_at" LIMIT 1
) WHERE s."owner_user_id" IS NULL;--> statement-breakpoint
UPDATE "studios" SET "legal_name" = "name" WHERE "legal_name" IS NULL AND "kind" = 'personal';--> statement-breakpoint
-- Tenant personal: una sola organización, la propia
INSERT INTO "organizations" ("studio_id", "name", "status")
SELECT s."id", s."name", 'activa' FROM "studios" s
WHERE s."kind" = 'personal' AND NOT EXISTS (SELECT 1 FROM "organizations" o WHERE o."studio_id" = s."id");--> statement-breakpoint
INSERT INTO "legal_entities" ("studio_id", "organization_id", "cuit", "business_name", "regime")
SELECT s."id", o."id", s."cuit", s."name", 'monotributo' FROM "studios" s JOIN "organizations" o ON o."studio_id" = s."id"
WHERE s."kind" = 'personal' AND s."cuit" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "legal_entities" l WHERE l."organization_id" = o."id");--> statement-breakpoint
-- Empleados existentes (miembros con rol empleado) pasan a la tabla employees
INSERT INTO "employees" ("studio_id", "organization_id", "first_name", "email", "user_id")
SELECT m."studio_id", m."organization_id", u."name", u."email", u."id" FROM "memberships" m JOIN "users" u ON u."id" = m."user_id"
WHERE m."role" = 'empleado' ON CONFLICT DO NOTHING;
