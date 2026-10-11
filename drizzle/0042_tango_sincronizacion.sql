CREATE TABLE "tango_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"fields" jsonb NOT NULL,
	"tango_raw" jsonb,
	"status" text DEFAULT 'abierto' NOT NULL,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tango_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid,
	"origin" text NOT NULL,
	"invoice_id" uuid,
	"external_id" text,
	"company_id" text,
	"doc_type" text NOT NULL,
	"number" text NOT NULL,
	"date" date NOT NULL,
	"customer_raw" text NOT NULL,
	"customer_std" text NOT NULL,
	"customer_cuit" text,
	"category_raw" text,
	"category_std" text,
	"total" numeric(16, 2) NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"raw" jsonb,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tango_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"api_url" text NOT NULL,
	"token_enc" text NOT NULL,
	"company_id" text DEFAULT '1' NOT NULL,
	"webhook_secret_enc" text,
	"webhooks" boolean DEFAULT false NOT NULL,
	"write_enabled" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'activo' NOT NULL,
	"last_error" text,
	"last_poll_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tango_links_studio_id_unique" UNIQUE("studio_id")
);
--> statement-breakpoint
CREATE TABLE "tango_norm_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"field" text NOT NULL,
	"raw_key" text NOT NULL,
	"examples" text[] DEFAULT '{}'::text[] NOT NULL,
	"standard" text NOT NULL,
	"status" text DEFAULT 'sugerida' NOT NULL,
	"origin" text DEFAULT 'auto' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tango_conflicts" ADD CONSTRAINT "tango_conflicts_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_conflicts" ADD CONSTRAINT "tango_conflicts_document_id_tango_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."tango_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_conflicts" ADD CONSTRAINT "tango_conflicts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_documents" ADD CONSTRAINT "tango_documents_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_documents" ADD CONSTRAINT "tango_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_documents" ADD CONSTRAINT "tango_documents_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_links" ADD CONSTRAINT "tango_links_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_links" ADD CONSTRAINT "tango_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_norm_rules" ADD CONSTRAINT "tango_norm_rules_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tango_norm_rules" ADD CONSTRAINT "tango_norm_rules_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tango_documents_external_idx" ON "tango_documents" USING btree ("studio_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tango_documents_invoice_idx" ON "tango_documents" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "tango_documents_status_idx" ON "tango_documents" USING btree ("studio_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tango_norm_rules_key" ON "tango_norm_rules" USING btree ("studio_id","field","raw_key");