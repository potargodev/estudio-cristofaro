CREATE TYPE "public"."group_role" AS ENUM('admin', 'miembro');--> statement-breakpoint
CREATE TYPE "public"."group_type" AS ENUM('socios', 'equipo', 'oficina', 'proyecto', 'viaje', 'personal');--> statement-breakpoint
CREATE TYPE "public"."reimbursement_status" AS ENUM('pendiente', 'aprobada', 'rechazada', 'reintegrada');--> statement-breakpoint
CREATE TYPE "public"."settlement_method" AS ENUM('efectivo', 'transferencia', 'mercado_pago');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('informado', 'confirmado', 'rechazado');--> statement-breakpoint
CREATE TYPE "public"."split_method" AS ENUM('iguales', 'porcentaje', 'partes', 'montos', 'items');--> statement-breakpoint
ALTER TYPE "public"."org_role" ADD VALUE 'empleado';--> statement-breakpoint
CREATE TABLE "accounting_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid,
	"source" text NOT NULL,
	"source_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"date" date NOT NULL,
	"category" text DEFAULT 'otros' NOT NULL,
	"deductible" boolean DEFAULT false NOT NULL,
	"receipt_path" text,
	"receipt_name" text,
	"receipt_mime" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_expenses_source_key" UNIQUE("source","source_id")
);
--> statement-breakpoint
CREATE TABLE "expense_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"expense_id" uuid,
	"member_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "group_type" DEFAULT 'personal' NOT NULL,
	"base_currency" text DEFAULT 'ARS' NOT NULL,
	"organization_id" uuid,
	"context_tenant" boolean DEFAULT false NOT NULL,
	"color" text DEFAULT '#c8a465' NOT NULL,
	"image_path" text,
	"simplify_debts" boolean DEFAULT true NOT NULL,
	"reminder_frequency" text DEFAULT 'semanal' NOT NULL,
	"last_reminder_at" timestamp with time zone,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_payers" (
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "expense_payers_expense_id_member_id_pk" PRIMARY KEY("expense_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "expense_shares" (
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "expense_shares_expense_id_member_id_pk" PRIMARY KEY("expense_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"fx_rate" numeric(18, 6),
	"fx_source" text,
	"fx_date" date,
	"date" date NOT NULL,
	"category" text DEFAULT 'otros' NOT NULL,
	"split_method" "split_method" DEFAULT 'iguales' NOT NULL,
	"split_spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"receipt_path" text,
	"receipt_name" text,
	"receipt_mime" text,
	"notes" text,
	"is_company" boolean DEFAULT false NOT NULL,
	"is_deductible" boolean DEFAULT false NOT NULL,
	"recurrence" text,
	"recurrence_next" date,
	"recurrence_parent_id" uuid,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"member_id" uuid,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"expense_id" uuid,
	"settlement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"email" text,
	"role" "group_role" DEFAULT 'miembro' NOT NULL,
	"payment_alias" text,
	"payment_cvu" text,
	"guest_token_hash" text,
	"reminders_opt_out" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_guest_token_hash_unique" UNIQUE("guest_token_hash")
);
--> statement-breakpoint
CREATE TABLE "partner_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reimbursements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"date" date NOT NULL,
	"category" text DEFAULT 'otros' NOT NULL,
	"receipt_path" text,
	"receipt_name" text,
	"receipt_mime" text,
	"status" "reimbursement_status" DEFAULT 'pendiente' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"reason" text,
	"reimbursed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"from_member" uuid NOT NULL,
	"to_member" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"method" "settlement_method" DEFAULT 'transferencia' NOT NULL,
	"status" "settlement_status" DEFAULT 'informado' NOT NULL,
	"confirmed_by_from" boolean DEFAULT false NOT NULL,
	"confirmed_by_to" boolean DEFAULT false NOT NULL,
	"payment_link" text,
	"receipt_path" text,
	"receipt_name" text,
	"note" text,
	"created_by" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounting_expenses" ADD CONSTRAINT "accounting_expenses_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_expenses" ADD CONSTRAINT "accounting_expenses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_comments" ADD CONSTRAINT "expense_comments_group_id_expense_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."expense_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_comments" ADD CONSTRAINT "expense_comments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_comments" ADD CONSTRAINT "expense_comments_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_groups" ADD CONSTRAINT "expense_groups_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_groups" ADD CONSTRAINT "expense_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_groups" ADD CONSTRAINT "expense_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payers" ADD CONSTRAINT "expense_payers_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payers" ADD CONSTRAINT "expense_payers_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_group_id_expense_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."expense_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_group_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."group_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_activity" ADD CONSTRAINT "group_activity_group_id_expense_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."expense_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_activity" ADD CONSTRAINT "group_activity_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_expense_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."expense_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_movements" ADD CONSTRAINT "partner_movements_group_id_expense_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."expense_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_movements" ADD CONSTRAINT "partner_movements_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_movements" ADD CONSTRAINT "partner_movements_created_by_group_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."group_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_group_id_expense_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."expense_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_from_member_group_members_id_fk" FOREIGN KEY ("from_member") REFERENCES "public"."group_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_to_member_group_members_id_fk" FOREIGN KEY ("to_member") REFERENCES "public"."group_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_created_by_group_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."group_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounting_expenses_org_idx" ON "accounting_expenses" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "expense_comments_idx" ON "expense_comments" USING btree ("group_id","expense_id","created_at");--> statement-breakpoint
CREATE INDEX "expense_groups_studio_idx" ON "expense_groups" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX "expenses_group_idx" ON "expenses" USING btree ("group_id","date");--> statement-breakpoint
CREATE INDEX "expenses_recurrence_idx" ON "expenses" USING btree ("recurrence_next");--> statement-breakpoint
CREATE INDEX "group_activity_idx" ON "group_activity" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_user_idx" ON "group_members" USING btree ("group_id","user_id") WHERE "group_members"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "group_members_user_lookup_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "partner_movements_group_idx" ON "partner_movements" USING btree ("group_id","date");--> statement-breakpoint
CREATE INDEX "reimbursements_org_idx" ON "reimbursements" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "settlements_group_idx" ON "settlements" USING btree ("group_id","created_at");