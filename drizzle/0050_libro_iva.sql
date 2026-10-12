CREATE TABLE "iva_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"period" text NOT NULL,
	"book" text NOT NULL,
	"row_id" uuid NOT NULL,
	"note" text,
	"status" text DEFAULT 'a_revisar' NOT NULL,
	"created_by" uuid,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "iva_marks" ADD CONSTRAINT "iva_marks_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iva_marks" ADD CONSTRAINT "iva_marks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iva_marks" ADD CONSTRAINT "iva_marks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iva_marks" ADD CONSTRAINT "iva_marks_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "iva_marks_row_idx" ON "iva_marks" USING btree ("organization_id","book","row_id");--> statement-breakpoint
CREATE INDEX "iva_marks_period_idx" ON "iva_marks" USING btree ("organization_id","period");