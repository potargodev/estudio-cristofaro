CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"bank" text NOT NULL,
	"label" text,
	"date_tolerance_days" integer DEFAULT 60 NOT NULL,
	"amount_tolerance_kind" text DEFAULT 'porcentaje' NOT NULL,
	"amount_tolerance" numeric(12, 2) DEFAULT '2' NOT NULL,
	"ledger_account" text DEFAULT 'Banco' NOT NULL,
	"rounding_account" text DEFAULT 'Diferencias de redondeo' NOT NULL,
	"fee_account" text DEFAULT 'Gastos bancarios' NOT NULL,
	"receivable_account" text DEFAULT 'Deudores por ventas' NOT NULL,
	"payable_account" text DEFAULT 'Proveedores' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"movement_ids" jsonb NOT NULL,
	"candidate_ids" jsonb NOT NULL,
	"difference" bigint DEFAULT 0 NOT NULL,
	"journal_entry_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"date" date NOT NULL,
	"concept" text NOT NULL,
	"lines" jsonb NOT NULL,
	"status" text DEFAULT 'borrador' NOT NULL,
	"source" text NOT NULL,
	"source_id" uuid,
	"created_by" uuid,
	"registered_by" uuid,
	"registered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_movements" ADD COLUMN "match_group_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_movements" ADD COLUMN "group_suggestion" jsonb;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD COLUMN "bank_account_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_matches" ADD CONSTRAINT "bank_matches_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_matches" ADD CONSTRAINT "bank_matches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_matches" ADD CONSTRAINT "bank_matches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_idx" ON "bank_accounts" USING btree ("organization_id","bank","label") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE INDEX "bank_matches_org_idx" ON "bank_matches" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "journal_entries_org_idx" ON "journal_entries" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "journal_entries_source_idx" ON "journal_entries" USING btree ("source","source_id");--> statement-breakpoint
-- Una cuenta bancaria por banco y número de los extractos ya importados (con las tolerancias de siempre)
INSERT INTO "bank_accounts" ("studio_id", "organization_id", "bank", "label") SELECT DISTINCT "studio_id", "organization_id", "bank", "account_label" FROM "bank_statements" ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "bank_statements" s SET "bank_account_id" = a."id" FROM "bank_accounts" a WHERE a."organization_id" = s."organization_id" AND a."bank" = s."bank" AND a."label" IS NOT DISTINCT FROM s."account_label" AND s."bank_account_id" IS NULL;
