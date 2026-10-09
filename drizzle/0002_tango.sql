CREATE TYPE "public"."integration_status" AS ENUM('activa', 'pausada');--> statement-breakpoint
CREATE TYPE "public"."integration_type" AS ENUM('tango');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('en_curso', 'ok', 'error');--> statement-breakpoint
CREATE TABLE "integration_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"sync_id" text NOT NULL,
	"kind" text DEFAULT 'sync' NOT NULL,
	"status" "sync_status" DEFAULT 'en_curso' NOT NULL,
	"companies" integer DEFAULT 0 NOT NULL,
	"records" integer DEFAULT 0 NOT NULL,
	"message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "integration_syncs_sync_key" UNIQUE("integration_id","sync_id")
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"type" "integration_type" NOT NULL,
	"status" "integration_status" DEFAULT 'activa' NOT NULL,
	"connector_key_hash" text,
	"key_prefix" text,
	"key_created_at" timestamp with time zone,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_connector_key_hash_unique" UNIQUE("connector_key_hash"),
	CONSTRAINT "integrations_studio_type_key" UNIQUE("studio_id","type")
);
--> statement-breakpoint
CREATE TABLE "tango_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"company_id" text NOT NULL,
	"name" text,
	"client_id" uuid,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tango_companies_studio_company_key" UNIQUE("studio_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "tango_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"company_id" text NOT NULL,
	"process" integer NOT NULL,
	"external_id" text NOT NULL,
	"raw" jsonb NOT NULL,
	"client_id" uuid,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tango_records_key" UNIQUE("studio_id","company_id","process","external_id")
);
--> statement-breakpoint
ALTER TABLE "integration_syncs" ADD CONSTRAINT "integration_syncs_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_companies" ADD CONSTRAINT "tango_companies_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_companies" ADD CONSTRAINT "tango_companies_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_records" ADD CONSTRAINT "tango_records_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_records" ADD CONSTRAINT "tango_records_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_syncs_started_idx" ON "integration_syncs" USING btree ("integration_id","started_at");--> statement-breakpoint
CREATE INDEX "tango_records_client_idx" ON "tango_records" USING btree ("client_id");