CREATE TABLE "billing_settings" (
	"studio_id" uuid PRIMARY KEY NOT NULL,
	"issuer_organization_id" uuid,
	"reminders" boolean DEFAULT true NOT NULL,
	"due_day" integer DEFAULT 10 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faro_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"plan_key" text NOT NULL,
	"interval" text DEFAULT 'mensual' NOT NULL,
	"status" text DEFAULT 'prueba' NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"past_due_since" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"pending_plan_key" text,
	"pending_interval" text,
	"mp_preapproval_id" text,
	"mp_status" text,
	"init_point" text,
	"notices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faro_subscriptions_studio_id_unique" UNIQUE("studio_id")
);
--> statement-breakpoint
CREATE TABLE "fee_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"fee_plan_id" uuid,
	"period" text,
	"concept" text NOT NULL,
	"amount" bigint NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_amount" bigint,
	"payment_method" text,
	"mp_preference_id" text,
	"payment_url" text,
	"invoice_id" uuid,
	"reminders_sent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_reminder_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"concept" text NOT NULL,
	"amount" bigint NOT NULL,
	"start_month" text NOT NULL,
	"adjust_kind" text DEFAULT 'ninguno' NOT NULL,
	"adjust_every" integer DEFAULT 3 NOT NULL,
	"adjust_percent" numeric(6, 2),
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mp_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid,
	"access_token_enc" text NOT NULL,
	"public_key" text,
	"webhook_secret_enc" text,
	"mp_user_id" text,
	"nickname" text,
	"status" text DEFAULT 'sin_probar' NOT NULL,
	"last_error" text,
	"tested_at" timestamp with time zone,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mp_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account" text NOT NULL,
	"studio_id" uuid,
	"kind" text,
	"ref_id" uuid,
	"mp_payment_id" text NOT NULL,
	"status" text NOT NULL,
	"status_detail" text,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"applied" boolean DEFAULT false NOT NULL,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"account" text NOT NULL,
	"topic" text,
	"data_id" text,
	"request_id" text,
	"signature_ok" boolean NOT NULL,
	"result" text NOT NULL,
	"error" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "mp_preference_id" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD COLUMN "mp_preapproval_id" text;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD COLUMN "debit_status" text;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD COLUMN "debit_url" text;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_issuer_organization_id_organizations_id_fk" FOREIGN KEY ("issuer_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faro_subscriptions" ADD CONSTRAINT "faro_subscriptions_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_fee_plan_id_fee_plans_id_fk" FOREIGN KEY ("fee_plan_id") REFERENCES "public"."fee_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_accounts" ADD CONSTRAINT "mp_accounts_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_accounts" ADD CONSTRAINT "mp_accounts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_payments" ADD CONSTRAINT "mp_payments_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_charges_period_idx" ON "fee_charges" USING btree ("fee_plan_id","period");--> statement-breakpoint
CREATE INDEX "fee_charges_org_idx" ON "fee_charges" USING btree ("studio_id","organization_id","status");--> statement-breakpoint
CREATE INDEX "fee_plans_org_idx" ON "fee_plans" USING btree ("studio_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mp_accounts_studio_idx" ON "mp_accounts" USING btree (coalesce("studio_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE UNIQUE INDEX "mp_payments_ext_idx" ON "mp_payments" USING btree ("account","mp_payment_id");--> statement-breakpoint
CREATE INDEX "mp_payments_ref_idx" ON "mp_payments" USING btree ("kind","ref_id");--> statement-breakpoint
CREATE INDEX "webhook_events_idx" ON "webhook_events" USING btree ("provider","data_id");