CREATE TYPE "public"."agreement_status" AS ENUM('activo', 'baja_solicitada', 'finalizado');--> statement-breakpoint
CREATE TYPE "public"."fleet_member_role" AS ENUM('capitan', 'tripulante');--> statement-breakpoint
CREATE TYPE "public"."fleet_member_status" AS ENUM('invitado', 'activo', 'salio', 'rechazo');--> statement-breakpoint
CREATE TABLE "agreement_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" uuid NOT NULL,
	"period" text NOT NULL,
	"amount" integer NOT NULL,
	"method" text,
	"registered_by" uuid,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreement_payments_period_key" UNIQUE("agreement_id","period")
);
--> statement-breakpoint
CREATE TABLE "fleet_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fleet_id" uuid NOT NULL,
	"kind" text DEFAULT 'evento' NOT NULL,
	"actor_id" uuid,
	"actor_label" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleet_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fleet_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"profile" text,
	"role" "fleet_member_role" DEFAULT 'tripulante' NOT NULL,
	"status" "fleet_member_status" DEFAULT 'invitado' NOT NULL,
	"informal_ack_at" timestamp with time zone,
	"invited_by" uuid,
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_members_email_key" UNIQUE("fleet_id","email")
);
--> statement-breakpoint
CREATE TABLE "fleet_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fleet_id" uuid NOT NULL,
	"studio_id" uuid NOT NULL,
	"prices" jsonb NOT NULL,
	"includes" text NOT NULL,
	"min_members" integer DEFAULT 3 NOT NULL,
	"notice_days" integer DEFAULT 30 NOT NULL,
	"status" text DEFAULT 'enviada' NOT NULL,
	"below_min_since" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_proposals_key" UNIQUE("fleet_id","studio_id")
);
--> statement-breakpoint
CREATE TABLE "fleet_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fleet_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_votes_member_key" UNIQUE("fleet_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "fleets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'activa' NOT NULL,
	"request_status" text DEFAULT 'borrador' NOT NULL,
	"request_zone" text,
	"request_services" text[] DEFAULT '{}'::text[] NOT NULL,
	"request_message" text,
	"request_published_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"fleet_id" uuid,
	"proposal_id" uuid,
	"organization_id" uuid,
	"member_name" text NOT NULL,
	"member_email" text NOT NULL,
	"profile" text NOT NULL,
	"monthly_price" integer NOT NULL,
	"terms" jsonb NOT NULL,
	"status" "agreement_status" DEFAULT 'activo' NOT NULL,
	"signed_name" text NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"signed_ip" text,
	"group_price_until" date,
	"end_requested_at" timestamp with time zone,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreement_payments" ADD CONSTRAINT "agreement_payments_agreement_id_service_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."service_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_payments" ADD CONSTRAINT "agreement_payments_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_events" ADD CONSTRAINT "fleet_events_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_events" ADD CONSTRAINT "fleet_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_members" ADD CONSTRAINT "fleet_members_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_members" ADD CONSTRAINT "fleet_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_members" ADD CONSTRAINT "fleet_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_proposals" ADD CONSTRAINT "fleet_proposals_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_proposals" ADD CONSTRAINT "fleet_proposals_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_proposals" ADD CONSTRAINT "fleet_proposals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_votes" ADD CONSTRAINT "fleet_votes_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_votes" ADD CONSTRAINT "fleet_votes_member_id_fleet_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."fleet_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_votes" ADD CONSTRAINT "fleet_votes_proposal_id_fleet_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."fleet_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleets" ADD CONSTRAINT "fleets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_proposal_id_fleet_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."fleet_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fleet_events_fleet_idx" ON "fleet_events" USING btree ("fleet_id","created_at");--> statement-breakpoint
CREATE INDEX "fleet_members_user_idx" ON "fleet_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "service_agreements_user_idx" ON "service_agreements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "service_agreements_studio_idx" ON "service_agreements" USING btree ("studio_id");