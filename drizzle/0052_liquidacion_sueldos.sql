CREATE TABLE "cct_scales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cct_key" text NOT NULL,
	"valid_from" date NOT NULL,
	"status" text DEFAULT 'a_validar' NOT NULL,
	"source" text NOT NULL,
	"categories" jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"rem" bigint NOT NULL,
	"norem" bigint NOT NULL,
	"desc" bigint NOT NULL,
	"net" bigint NOT NULL,
	"contrib" bigint NOT NULL,
	"cost" bigint NOT NULL,
	"bases" jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_novelties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"period" text NOT NULL,
	"kind" text NOT NULL,
	"quantity" numeric(10, 2),
	"amount" numeric(14, 2),
	"detail" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"ref" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"period" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'borrador' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_id" uuid,
	"pay_date" date NOT NULL,
	"final_info" jsonb,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"basis" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"totals" jsonb DEFAULT '{"employees":0,"rem":0,"norem":0,"desc":0,"net":0,"contrib":0,"cost":0}'::jsonb NOT NULL,
	"warnings" integer DEFAULT 0 NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"batch_id" uuid,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"employer_kind" text DEFAULT 'general' NOT NULL,
	"art_pct" numeric(6, 3) DEFAULT '2.5' NOT NULL,
	"art_fixed" numeric(12, 2) DEFAULT '800' NOT NULL,
	"life_insurance" numeric(12, 2) DEFAULT '350' NOT NULL,
	"own_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pay_place" text,
	"last_deposit" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "cct_key" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "basic_override" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "hours" integer;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "affiliated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "cbu" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "legajo" text;--> statement-breakpoint
ALTER TABLE "cct_scales" ADD CONSTRAINT "cct_scales_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_novelties" ADD CONSTRAINT "payroll_novelties_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_novelties" ADD CONSTRAINT "payroll_novelties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_novelties" ADD CONSTRAINT "payroll_novelties_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_novelties" ADD CONSTRAINT "payroll_novelties_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_parent_id_payroll_runs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payroll_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_batch_id_payslip_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payslip_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cct_scales_key_from_idx" ON "cct_scales" USING btree ("cct_key","valid_from");--> statement-breakpoint
CREATE INDEX "payroll_items_run_idx" ON "payroll_items" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "payroll_items_emp_idx" ON "payroll_items" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payroll_novelties_org_idx" ON "payroll_novelties" USING btree ("organization_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_novelties_ref_idx" ON "payroll_novelties" USING btree ("organization_id","ref") WHERE "payroll_novelties"."ref" is not null;--> statement-breakpoint
CREATE INDEX "payroll_runs_org_idx" ON "payroll_runs" USING btree ("organization_id","period","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_settings_org_idx" ON "payroll_settings" USING btree ("organization_id");