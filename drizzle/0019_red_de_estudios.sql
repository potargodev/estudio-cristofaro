CREATE TYPE "public"."license_status" AS ENUM('sin_cargar', 'pendiente', 'verificada', 'rechazada');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pendiente', 'publicada', 'rechazada');--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'red';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'flota';--> statement-breakpoint
CREATE TABLE "directory_profiles" (
	"studio_id" uuid PRIMARY KEY NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"accepting_clients" boolean DEFAULT true NOT NULL,
	"headline" text,
	"description" text,
	"province" text,
	"city" text,
	"modality" text DEFAULT 'ambas' NOT NULL,
	"services" text[] DEFAULT '{}'::text[] NOT NULL,
	"industries" text[] DEFAULT '{}'::text[] NOT NULL,
	"languages" text[] DEFAULT '{español}'::text[] NOT NULL,
	"team_size" text,
	"fee_range" text,
	"contact_email" text,
	"license_body" text,
	"license_number" text,
	"license_holder" text,
	"license_status" "license_status" DEFAULT 'sin_cargar' NOT NULL,
	"license_note" text,
	"license_reviewed_by" uuid,
	"license_reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"author_user_id" uuid,
	"author_label" text NOT NULL,
	"rating" integer NOT NULL,
	"body" text NOT NULL,
	"status" "review_status" DEFAULT 'pendiente' NOT NULL,
	"moderation_note" text,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"response" text,
	"responded_by" uuid,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_reviews_org_key" UNIQUE("studio_id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "directory_profiles" ADD CONSTRAINT "directory_profiles_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_profiles" ADD CONSTRAINT "directory_profiles_license_reviewed_by_users_id_fk" FOREIGN KEY ("license_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_reviews" ADD CONSTRAINT "directory_reviews_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_reviews" ADD CONSTRAINT "directory_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_reviews" ADD CONSTRAINT "directory_reviews_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_reviews" ADD CONSTRAINT "directory_reviews_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_reviews" ADD CONSTRAINT "directory_reviews_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "directory_reviews_studio_idx" ON "directory_reviews" USING btree ("studio_id","status");