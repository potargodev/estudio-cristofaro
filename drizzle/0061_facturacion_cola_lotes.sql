CREATE TABLE "arca_status_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text NOT NULL,
	"ok" boolean NOT NULL,
	"app" text,
	"db" text,
	"auth" text,
	"latency_ms" integer,
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_batch_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid,
	"row_number" integer NOT NULL,
	"data" jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"invoice_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"mode" text DEFAULT 'borradores' NOT NULL,
	"status" text DEFAULT 'validado' NOT NULL,
	"rows_total" integer DEFAULT 0 NOT NULL,
	"rows_valid" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "queued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "queued_by" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "queue_reason" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "reserved_number" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_batch_rows" ADD CONSTRAINT "invoice_batch_rows_batch_id_invoice_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."invoice_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_batch_rows" ADD CONSTRAINT "invoice_batch_rows_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_batches" ADD CONSTRAINT "invoice_batches_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_batches" ADD CONSTRAINT "invoice_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arca_status_env_idx" ON "arca_status_checks" USING btree ("environment","checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_batch_rows_idx" ON "invoice_batch_rows" USING btree ("batch_id","row_number");--> statement-breakpoint
CREATE INDEX "invoice_batch_rows_status_idx" ON "invoice_batch_rows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoice_batches_studio_idx" ON "invoice_batches" USING btree ("studio_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_idem_idx" ON "invoices" USING btree ("studio_id","idempotency_key") WHERE "invoices"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "invoices_queue_idx" ON "invoices" USING btree ("status","queued_at");