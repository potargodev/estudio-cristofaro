CREATE TABLE "derivation_rules" (
	"key" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"need" text NOT NULL,
	"threshold" numeric(14, 4),
	"snooze_days" integer DEFAULT 30 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"validation" text DEFAULT 'a_validar' NOT NULL,
	"validated_by" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derivation_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rule_key" text NOT NULL,
	"context" jsonb NOT NULL,
	"status" text DEFAULT 'activa' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional_tasks" (
	"key" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"validation" text DEFAULT 'a_validar' NOT NULL,
	"validated_by" text,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "derivation_rules" ADD CONSTRAINT "derivation_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivation_suggestions" ADD CONSTRAINT "derivation_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_tasks" ADD CONSTRAINT "professional_tasks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "derivation_suggestions_user_rule_idx" ON "derivation_suggestions" USING btree ("user_id","rule_key");