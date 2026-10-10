CREATE TYPE "public"."tenant_kind" AS ENUM('studio', 'personal');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('activo', 'suspendido');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'colaborador';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'autonomo';--> statement-breakpoint
CREATE TABLE "assisted_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"faro_user_id" uuid NOT NULL,
	"studio_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_module_overrides" (
	"studio_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_module_overrides_studio_id_module_key_pk" PRIMARY KEY("studio_id","module_key")
);
--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "kind" "tenant_kind" DEFAULT 'studio' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "plan_key" text DEFAULT 'senal' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "status" "tenant_status" DEFAULT 'activo' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "cuit" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "created_via" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "faro_role" text;--> statement-breakpoint
ALTER TABLE "assisted_access" ADD CONSTRAINT "assisted_access_faro_user_id_users_id_fk" FOREIGN KEY ("faro_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assisted_access" ADD CONSTRAINT "assisted_access_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_module_overrides" ADD CONSTRAINT "studio_module_overrides_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_module_overrides" ADD CONSTRAINT "studio_module_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assisted_access_user_idx" ON "assisted_access" USING btree ("faro_user_id","expires_at");--> statement-breakpoint
-- Estudio Cristofaro es el cliente cero: plan Horizonte
UPDATE "studios" SET "plan_key" = 'horizonte', "created_via" = 'seed';
