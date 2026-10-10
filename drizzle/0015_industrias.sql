CREATE TABLE "industry_template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"industry_key" text NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"status" text DEFAULT 'borrador' NOT NULL,
	"validated_by_name" text,
	"validated_by_license" text,
	"validated_at" timestamp with time zone,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_industries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"industry_key" text NOT NULL,
	"version" integer NOT NULL,
	"template_status" text DEFAULT 'borrador' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"applied_by" uuid,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_setup_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"industry_key" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"data" jsonb NOT NULL,
	"customized" boolean DEFAULT false NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"removed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "industry_template_versions" ADD CONSTRAINT "industry_template_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_industries" ADD CONSTRAINT "organization_industries_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_industries" ADD CONSTRAINT "organization_industries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_industries" ADD CONSTRAINT "organization_industries_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_setup_items" ADD CONSTRAINT "organization_setup_items_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_setup_items" ADD CONSTRAINT "organization_setup_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "industry_template_versions_key_idx" ON "industry_template_versions" USING btree ("industry_key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_industries_org_idx" ON "organization_industries" USING btree ("organization_id","industry_key");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_setup_items_key_idx" ON "organization_setup_items" USING btree ("organization_id","industry_key","kind","key");--> statement-breakpoint
CREATE INDEX "organization_setup_items_org_idx" ON "organization_setup_items" USING btree ("organization_id","kind");