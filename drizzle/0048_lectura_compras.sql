CREATE TABLE "smart_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid,
	"owner_user_id" uuid,
	"scope" text NOT NULL,
	"source" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid,
	"owner_user_id" uuid,
	"scope" text NOT NULL,
	"supplier_cuit" text NOT NULL,
	"supplier_name" text,
	"rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'aprendido' NOT NULL,
	"applied_count" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "smart_documents" ADD COLUMN "original" jsonb;--> statement-breakpoint
ALTER TABLE "smart_documents" ADD COLUMN "decisions" jsonb;--> statement-breakpoint
ALTER TABLE "smart_documents" ADD COLUMN "learned" jsonb;--> statement-breakpoint
ALTER TABLE "smart_documents" ADD COLUMN "corrected_fields" jsonb;--> statement-breakpoint
ALTER TABLE "smart_documents" ADD COLUMN "supplier_cuit" text;--> statement-breakpoint
ALTER TABLE "smart_documents" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "smart_batches" ADD CONSTRAINT "smart_batches_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_batches" ADD CONSTRAINT "smart_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_batches" ADD CONSTRAINT "smart_batches_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_batches" ADD CONSTRAINT "smart_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_rules" ADD CONSTRAINT "supplier_rules_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_rules" ADD CONSTRAINT "supplier_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_rules" ADD CONSTRAINT "supplier_rules_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_rules" ADD CONSTRAINT "supplier_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "smart_batches_scope_idx" ON "smart_batches" USING btree ("studio_id","organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_rules_idx" ON "supplier_rules" USING btree ("studio_id","scope","organization_id","owner_user_id","supplier_cuit") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE INDEX "smart_documents_supplier_idx" ON "smart_documents" USING btree ("studio_id","organization_id","supplier_cuit");--> statement-breakpoint
CREATE INDEX "smart_documents_queue_idx" ON "smart_documents" USING btree ("status","created_at");--> statement-breakpoint
-- Proveedor de los comprobantes ya leídos (para la precisión por proveedor)
UPDATE "smart_documents" SET "supplier_cuit" = "extracted"->>'cuit_emisor' WHERE "supplier_cuit" IS NULL AND "extracted" IS NOT NULL;
