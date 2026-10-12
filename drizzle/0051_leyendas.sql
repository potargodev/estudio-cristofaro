CREATE TABLE "legend_rules" (
	"key" text PRIMARY KEY NOT NULL,
	"jurisdiction" text NOT NULL,
	"title" text NOT NULL,
	"template" text NOT NULL,
	"condition" text NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"status" text DEFAULT 'a_validar' NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"note" text,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_settings" ADD COLUMN "legend_profile" jsonb;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "legends" jsonb;--> statement-breakpoint
ALTER TABLE "legend_rules" ADD CONSTRAINT "legend_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;