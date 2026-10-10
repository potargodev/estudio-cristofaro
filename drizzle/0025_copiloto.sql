CREATE TYPE "public"."copilot_role" AS ENUM('usuario', 'copiloto');--> statement-breakpoint
CREATE TYPE "public"."copilot_status" AS ENUM('ok', 'procesando', 'pendiente', 'error');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('propuesta', 'confirmada', 'deshecha', 'descartada');--> statement-breakpoint
CREATE TABLE "copilot_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "copilot_role" NOT NULL,
	"kind" text DEFAULT 'texto' NOT NULL,
	"text" text,
	"transcript" text,
	"attachment_path" text,
	"attachment_name" text,
	"attachment_mime" text,
	"reply_to" uuid,
	"status" "copilot_status" DEFAULT 'ok' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"model" text,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"unseen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "copilot_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"source_message_id" uuid,
	"tool" text NOT NULL,
	"input" jsonb NOT NULL,
	"preview" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "proposal_status" DEFAULT 'propuesta' NOT NULL,
	"auto" boolean DEFAULT false NOT NULL,
	"result_type" text,
	"result_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "copilot_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"source_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_ai" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"api_key_enc" text,
	"key_hint" text,
	"base_url" text,
	"model_primary" text DEFAULT 'gemini-3.1-flash-lite' NOT NULL,
	"model_fallback" text,
	"transcription" text DEFAULT 'nativo' NOT NULL,
	"transcription_key_enc" text,
	"transcription_model" text DEFAULT 'whisper-1' NOT NULL,
	"price_in_per_m" numeric(10, 4) DEFAULT '0.10' NOT NULL,
	"price_out_per_m" numeric(10, 4) DEFAULT '0.40' NOT NULL,
	"free_tier" boolean DEFAULT false NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"daily_cap_usd" numeric(10, 2),
	"monthly_cap_usd" numeric(10, 2),
	"cap_alerted_at" timestamp with time zone,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_proposals" ADD CONSTRAINT "copilot_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_proposals" ADD CONSTRAINT "copilot_proposals_message_id_copilot_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."copilot_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_proposals" ADD CONSTRAINT "copilot_proposals_source_message_id_copilot_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."copilot_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_reminders" ADD CONSTRAINT "copilot_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_reminders" ADD CONSTRAINT "copilot_reminders_source_message_id_copilot_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."copilot_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_ai" ADD CONSTRAINT "platform_ai_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "copilot_messages_user_idx" ON "copilot_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "copilot_messages_status_idx" ON "copilot_messages" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "copilot_proposals_user_idx" ON "copilot_proposals" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "copilot_reminders_due_idx" ON "copilot_reminders" USING btree ("due_at");