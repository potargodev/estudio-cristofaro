CREATE TABLE "seeker_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seeker_id" uuid NOT NULL,
	"studio_id" uuid NOT NULL,
	"contacted_by" uuid,
	"message" text,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"decided_at" timestamp with time zone,
	"connection_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seeker_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid NOT NULL,
	"fleet_id" uuid,
	"active" boolean DEFAULT false NOT NULL,
	"industry" text,
	"size" text,
	"province" text,
	"city" text,
	"needs" text[] DEFAULT '{}'::text[] NOT NULL,
	"note" text,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seeker_contacts" ADD CONSTRAINT "seeker_contacts_seeker_id_seeker_profiles_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."seeker_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeker_contacts" ADD CONSTRAINT "seeker_contacts_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeker_contacts" ADD CONSTRAINT "seeker_contacts_contacted_by_users_id_fk" FOREIGN KEY ("contacted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD CONSTRAINT "seeker_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD CONSTRAINT "seeker_profiles_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seeker_contacts_seeker_studio_idx" ON "seeker_contacts" USING btree ("seeker_id","studio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seeker_profiles_user_idx" ON "seeker_profiles" USING btree ("user_id") WHERE "seeker_profiles"."fleet_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "seeker_profiles_fleet_idx" ON "seeker_profiles" USING btree ("fleet_id");