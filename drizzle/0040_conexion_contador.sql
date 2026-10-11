CREATE TABLE "account_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"user_studio_id" uuid,
	"studio_id" uuid NOT NULL,
	"status" text NOT NULL,
	"initiated_by" text NOT NULL,
	"scope_personal" boolean DEFAULT false NOT NULL,
	"autonomy" text DEFAULT 'delegar' NOT NULL,
	"message" text,
	"interview_requested_at" timestamp with time zone,
	"interview_note" text,
	"info_request" text,
	"info_response" text,
	"decision_reason" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"terms" jsonb,
	"agreement_id" uuid,
	"studio_signed_by" uuid,
	"studio_signed_name" text,
	"studio_signed_at" timestamp with time zone,
	"user_signed_name" text,
	"user_signed_at" timestamp with time zone,
	"policies_accepted_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"closing_started_at" timestamp with time zone,
	"closing_initiated_by" text,
	"closing_reason" text,
	"readonly_until" timestamp with time zone,
	"fees_zero_at" timestamp with time zone,
	"pending_delivered_at" timestamp with time zone,
	"user_clear_at" timestamp with time zone,
	"studio_clear_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"weekly_summary" boolean DEFAULT false NOT NULL,
	"weekly_sent_at" timestamp with time zone,
	"source" text DEFAULT 'red' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connection_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"summary" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"payload" jsonb,
	"status" text DEFAULT 'aplicada' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connection_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"author_id" uuid,
	"side" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connection_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"score" integer,
	"comment" text,
	"skipped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_connections" ADD CONSTRAINT "account_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_connections" ADD CONSTRAINT "account_connections_user_studio_id_studios_id_fk" FOREIGN KEY ("user_studio_id") REFERENCES "public"."studios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_connections" ADD CONSTRAINT "account_connections_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_connections" ADD CONSTRAINT "account_connections_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_connections" ADD CONSTRAINT "account_connections_studio_signed_by_users_id_fk" FOREIGN KEY ("studio_signed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_actions" ADD CONSTRAINT "connection_actions_connection_id_account_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."account_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_actions" ADD CONSTRAINT "connection_actions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_messages" ADD CONSTRAINT "connection_messages_connection_id_account_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."account_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_messages" ADD CONSTRAINT "connection_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_ratings" ADD CONSTRAINT "connection_ratings_connection_id_account_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."account_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_connections_user_idx" ON "account_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_connections_studio_idx" ON "account_connections" USING btree ("studio_id","status");--> statement-breakpoint
CREATE INDEX "connection_actions_conn_idx" ON "connection_actions" USING btree ("connection_id","created_at");--> statement-breakpoint
-- Conexión, no copia: los acuerdos de Flotas vigentes pasan al modelo de
-- permiso (el estudio ve en vivo la caja de negocio y lo fiscal; lo personal,
-- apagado). La organización que se había creado en el estudio queda como su
-- ficha de contacto y cobro.
INSERT INTO "account_connections" ("user_id", "user_studio_id", "studio_id", "status", "initiated_by", "terms", "agreement_id", "studio_signed_name", "studio_signed_at", "user_signed_name", "user_signed_at", "policies_accepted_at", "started_at", "source", "created_at")
SELECT a."user_id", u."studio_id", a."studio_id", 'activa', 'usuario',
  jsonb_build_object('services', coalesce(a."terms"->>'includes', ''), 'monthlyPrice', a."monthly_price", 'noticeDays', coalesce((a."terms"->>'noticeDays')::int, 30), 'version', coalesce(a."terms"->>'version', 'flota')),
  a."id", 'Propuesta grupal publicada por el estudio', a."signed_at", a."signed_name", a."signed_at", a."signed_at", a."signed_at", 'flota', a."created_at"
FROM "service_agreements" a
JOIN "users" u ON u."id" = a."user_id"
WHERE a."status" IN ('activo', 'baja_solicitada')
  AND NOT EXISTS (SELECT 1 FROM "account_connections" c WHERE c."agreement_id" = a."id");
--> statement-breakpoint
INSERT INTO "audit_log" ("studio_id", "actor_label", "action", "entity_type", "entity_id", "metadata")
SELECT c."studio_id", 'Faro', 'conexion.migrada', 'conexion', c."id"::text, jsonb_build_object('acuerdo', c."agreement_id", 'origen', 'flota')
FROM "account_connections" c WHERE c."source" = 'flota';
