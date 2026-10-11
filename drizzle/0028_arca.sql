CREATE TABLE "arca_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text NOT NULL,
	"cuit" text NOT NULL,
	"cert_enc" text NOT NULL,
	"key_enc" text NOT NULL,
	"cert_subject" text,
	"cert_not_after" timestamp with time zone,
	"last_test_at" timestamp with time zone,
	"last_test_ok" boolean,
	"last_test_detail" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arca_taxpayers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid,
	"cuit" text NOT NULL,
	"source" text NOT NULL,
	"environment" text,
	"external_id" text,
	"validation" text DEFAULT 'validado' NOT NULL,
	"data" jsonb NOT NULL,
	"raw" jsonb,
	"error" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fetched_by" uuid
);
--> statement-breakpoint
CREATE TABLE "arca_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text NOT NULL,
	"service" text NOT NULL,
	"cuit" text NOT NULL,
	"token" text NOT NULL,
	"sign" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guided_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"check_key" text NOT NULL,
	"status" text DEFAULT 'sin_revisar' NOT NULL,
	"finding" text,
	"amount" numeric(14, 2),
	"checked_at" timestamp with time zone,
	"checked_by" uuid,
	"every_days" integer DEFAULT 30 NOT NULL,
	"next_reminder_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"month" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"doc_type" integer DEFAULT 80 NOT NULL,
	"doc_number" text DEFAULT '0' NOT NULL,
	"name" text NOT NULL,
	"iva_condition" text DEFAULT 'consumidor_final' NOT NULL,
	"email" text,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"cuit" text NOT NULL,
	"number" integer NOT NULL,
	"kind" text,
	"blocked" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'wsfe' NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"description" text NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"iva_rate" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"cuit" text NOT NULL,
	"business_name" text NOT NULL,
	"iva_condition" text DEFAULT 'monotributo' NOT NULL,
	"address" text,
	"activity_start" date,
	"iibb" text,
	"logo_path" text,
	"color" text DEFAULT '#1c2235',
	"email" text,
	"phone" text,
	"website" text,
	"footer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"cuit" text NOT NULL,
	"environment" text NOT NULL,
	"point_of_sale" integer NOT NULL,
	"cbte_type" integer NOT NULL,
	"number" bigint,
	"issue_date" date NOT NULL,
	"concept" integer DEFAULT 2 NOT NULL,
	"service_from" date,
	"service_to" date,
	"payment_due" date,
	"customer_id" uuid,
	"customer_doc_type" integer NOT NULL,
	"customer_doc_number" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_iva_condition" text NOT NULL,
	"customer_email" text,
	"customer_address" text,
	"currency" text DEFAULT 'PES' NOT NULL,
	"exchange_rate" numeric(14, 6) DEFAULT '1' NOT NULL,
	"items" jsonb NOT NULL,
	"net" numeric(14, 2) NOT NULL,
	"iva" numeric(14, 2) DEFAULT '0' NOT NULL,
	"exempt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"iva_breakdown" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"associated_invoice_id" uuid,
	"status" text DEFAULT 'borrador' NOT NULL,
	"cae" text,
	"cae_due" date,
	"observations" jsonb,
	"error" text,
	"raw_request" jsonb,
	"raw_response" jsonb,
	"public_token" text,
	"payment_url" text,
	"emailed_at" timestamp with time zone,
	"notes" text,
	"origin" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"authorized_by" uuid,
	"authorized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monotributo_scales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"valid_from" date NOT NULL,
	"status" text DEFAULT 'a_validar' NOT NULL,
	"source" text NOT NULL,
	"notes" text,
	"categories" jsonb NOT NULL,
	"validated_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"cuit" text NOT NULL,
	"regime" text DEFAULT 'monotributo' NOT NULL,
	"category" text,
	"iibb" text DEFAULT 'simplificado' NOT NULL,
	"jurisdiction" text,
	"autonomos" boolean DEFAULT false NOT NULL,
	"alerts_email" boolean DEFAULT true NOT NULL,
	"alert_days" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "obligations" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "obligations" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "arca_credentials" ADD CONSTRAINT "arca_credentials_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arca_taxpayers" ADD CONSTRAINT "arca_taxpayers_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arca_taxpayers" ADD CONSTRAINT "arca_taxpayers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arca_taxpayers" ADD CONSTRAINT "arca_taxpayers_fetched_by_users_id_fk" FOREIGN KEY ("fetched_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guided_checks" ADD CONSTRAINT "guided_checks_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guided_checks" ADD CONSTRAINT "guided_checks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guided_checks" ADD CONSTRAINT "guided_checks_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_adjustments" ADD CONSTRAINT "income_adjustments_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_adjustments" ADD CONSTRAINT "income_adjustments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_adjustments" ADD CONSTRAINT "income_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_customers" ADD CONSTRAINT "invoice_customers_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_customers" ADD CONSTRAINT "invoice_customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_points" ADD CONSTRAINT "invoice_points_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_points" ADD CONSTRAINT "invoice_points_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_products" ADD CONSTRAINT "invoice_products_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_products" ADD CONSTRAINT "invoice_products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_settings" ADD CONSTRAINT "invoice_settings_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_settings" ADD CONSTRAINT "invoice_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_invoice_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."invoice_customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_associated_invoice_id_invoices_id_fk" FOREIGN KEY ("associated_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_authorized_by_users_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monotributo_scales" ADD CONSTRAINT "monotributo_scales_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monotributo_scales" ADD CONSTRAINT "monotributo_scales_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "arca_credentials_env_idx" ON "arca_credentials" USING btree ("environment");--> statement-breakpoint
CREATE INDEX "arca_taxpayers_cuit_idx" ON "arca_taxpayers" USING btree ("studio_id","cuit","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "arca_tickets_service_idx" ON "arca_tickets" USING btree ("environment","service","cuit");--> statement-breakpoint
CREATE UNIQUE INDEX "guided_checks_unique_idx" ON "guided_checks" USING btree ("organization_id","check_key");--> statement-breakpoint
CREATE UNIQUE INDEX "income_adjustments_month_idx" ON "income_adjustments" USING btree ("organization_id","month");--> statement-breakpoint
CREATE INDEX "invoice_customers_org_idx" ON "invoice_customers" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_points_unique_idx" ON "invoice_points" USING btree ("organization_id","cuit","number");--> statement-breakpoint
CREATE INDEX "invoice_products_org_idx" ON "invoice_products" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_settings_org_cuit_idx" ON "invoice_settings" USING btree ("organization_id","cuit");--> statement-breakpoint
CREATE INDEX "invoices_org_idx" ON "invoices" USING btree ("organization_id","issue_date");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_idx" ON "invoices" USING btree ("cuit","environment","point_of_sale","cbte_type","number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_token_idx" ON "invoices" USING btree ("public_token");--> statement-breakpoint
CREATE UNIQUE INDEX "monotributo_scales_from_idx" ON "monotributo_scales" USING btree ("valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_profiles_org_idx" ON "tax_profiles" USING btree ("organization_id");