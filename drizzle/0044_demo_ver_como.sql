CREATE TABLE "demo_impersonations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"faro_user_id" uuid NOT NULL,
	"original_session_id" uuid,
	"target_user_id" uuid NOT NULL,
	"target_email" text NOT NULL,
	"target_session_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "demo_impersonations" ADD CONSTRAINT "demo_impersonations_faro_user_id_users_id_fk" FOREIGN KEY ("faro_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demo_impersonations_user_idx" ON "demo_impersonations" USING btree ("faro_user_id","created_at");