CREATE TABLE "studio_template_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"industry_key" text NOT NULL,
	"version" integer NOT NULL,
	"validated_by" uuid,
	"validated_by_name" text NOT NULL,
	"note" text,
	"validated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_template_validations_key" UNIQUE("studio_id","industry_key","version")
);
--> statement-breakpoint
ALTER TABLE "studio_template_validations" ADD CONSTRAINT "studio_template_validations_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_template_validations" ADD CONSTRAINT "studio_template_validations_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;