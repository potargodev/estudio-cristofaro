CREATE TABLE "guide_checks" (
	"item_key" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"comment" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guide_checks" ADD CONSTRAINT "guide_checks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;