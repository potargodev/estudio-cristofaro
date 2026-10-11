CREATE TABLE "ai_consults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"question" text NOT NULL,
	"status" text DEFAULT 'generando' NOT NULL,
	"draft" text,
	"final_body" text,
	"edited" boolean DEFAULT false NOT NULL,
	"error" text,
	"model" text,
	"provider" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(10, 5),
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_branding" (
	"studio_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"logo_path" text,
	"logo_mime" text,
	"primary_color" text,
	"accent_color" text,
	"custom_domain" text,
	"domain_status" text DEFAULT 'sin_dominio' NOT NULL,
	"domain_token" text,
	"domain_checked_at" timestamp with time zone,
	"domain_verified_at" timestamp with time zone,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_branding_custom_domain_unique" UNIQUE("custom_domain")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid,
	"mode" text DEFAULT 'propio' NOT NULL,
	"phone_number_id" text,
	"waba_id" text,
	"display_phone" text,
	"access_token_enc" text,
	"app_secret_enc" text,
	"verify_token" text,
	"status" text DEFAULT 'activa' NOT NULL,
	"last_error" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_accounts_studio_id_unique" UNIQUE("studio_id")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"opt_in_avisos" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid,
	"organization_id" uuid,
	"account_id" uuid,
	"direction" text NOT NULL,
	"phone" text NOT NULL,
	"kind" text NOT NULL,
	"template" text,
	"body" text,
	"media_path" text,
	"media_mime" text,
	"status" text NOT NULL,
	"error" text,
	"entity_type" text,
	"entity_id" uuid,
	"source" text DEFAULT 'whatsapp' NOT NULL,
	"external_id" text,
	"validation" text DEFAULT 'sin_validar' NOT NULL,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"language" text DEFAULT 'es_AR' NOT NULL,
	"category" text,
	"body" text NOT NULL,
	"params" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"external_id" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
ALTER TABLE "ai_consults" ADD CONSTRAINT "ai_consults_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_consults" ADD CONSTRAINT "ai_consults_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_consults" ADD CONSTRAINT "ai_consults_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_consults" ADD CONSTRAINT "ai_consults_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_branding" ADD CONSTRAINT "studio_branding_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_branding" ADD CONSTRAINT "studio_branding_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_consults_request_idx" ON "ai_consults" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "ai_consults_studio_idx" ON "ai_consults" USING btree ("studio_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_contacts_user_idx" ON "whatsapp_contacts" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "whatsapp_contacts_phone_idx" ON "whatsapp_contacts" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_messages_external_idx" ON "whatsapp_messages" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_studio_idx" ON "whatsapp_messages" USING btree ("studio_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_templates_name_idx" ON "whatsapp_templates" USING btree ("account_id","name","language");