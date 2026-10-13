CREATE TABLE "inbox_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "smart_documents" ADD COLUMN "computable" text;--> statement-breakpoint
ALTER TABLE "smart_documents" ADD COLUMN "computable_pct" integer;--> statement-breakpoint
ALTER TABLE "inbox_addresses" ADD CONSTRAINT "inbox_addresses_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_addresses" ADD CONSTRAINT "inbox_addresses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_addresses" ADD CONSTRAINT "inbox_addresses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_addresses_token_idx" ON "inbox_addresses" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_addresses_org_idx" ON "inbox_addresses" USING btree ("organization_id");