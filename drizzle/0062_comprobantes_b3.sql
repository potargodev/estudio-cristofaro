CREATE TABLE "commercial_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"cuit" text NOT NULL,
	"kind" text NOT NULL,
	"number" integer NOT NULL,
	"issue_date" date NOT NULL,
	"valid_until" date,
	"customer_name" text NOT NULL,
	"customer_doc_type" integer DEFAULT 99 NOT NULL,
	"customer_doc_number" text DEFAULT '0' NOT NULL,
	"customer_iva_condition" text DEFAULT 'consumidor_final' NOT NULL,
	"customer_email" text,
	"customer_address" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total" numeric(16, 2) NOT NULL,
	"currency" text DEFAULT 'PES' NOT NULL,
	"applies_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_method" text,
	"status" text DEFAULT 'emitido' NOT NULL,
	"invoice_id" uuid,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"cuit" text NOT NULL,
	"name" text NOT NULL,
	"template" jsonb NOT NULL,
	"day_of_month" integer DEFAULT 1 NOT NULL,
	"next_date" date NOT NULL,
	"adjust" text DEFAULT 'ninguno' NOT NULL,
	"base_month" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_invoice_id" uuid,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_settings" ADD COLUMN "cbu" text;--> statement-breakpoint
ALTER TABLE "invoice_settings" ADD COLUMN "fce_transfer" text DEFAULT 'SCA' NOT NULL;--> statement-breakpoint
ALTER TABLE "commercial_docs" ADD CONSTRAINT "commercial_docs_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_docs" ADD CONSTRAINT "commercial_docs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_docs" ADD CONSTRAINT "commercial_docs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_docs" ADD CONSTRAINT "commercial_docs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_last_invoice_id_invoices_id_fk" FOREIGN KEY ("last_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_docs_number_idx" ON "commercial_docs" USING btree ("organization_id","cuit","kind","number");--> statement-breakpoint
CREATE INDEX "commercial_docs_org_idx" ON "commercial_docs" USING btree ("organization_id","kind","issue_date");--> statement-breakpoint
CREATE INDEX "recurring_invoices_next_idx" ON "recurring_invoices" USING btree ("active","next_date");--> statement-breakpoint
CREATE INDEX "recurring_invoices_org_idx" ON "recurring_invoices" USING btree ("organization_id");