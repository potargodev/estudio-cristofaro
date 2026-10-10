CREATE TABLE "help_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" text NOT NULL,
	"helpful" boolean NOT NULL,
	"comment" text,
	"user_id" uuid,
	"studio_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "help_feedback" ADD CONSTRAINT "help_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_feedback" ADD CONSTRAINT "help_feedback_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "help_feedback_article_idx" ON "help_feedback" USING btree ("article_id","created_at");