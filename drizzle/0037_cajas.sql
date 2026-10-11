CREATE TYPE "public"."box_kind" AS ENUM('personal', 'negocio', 'compartida');--> statement-breakpoint
CREATE TABLE "box_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"box_id" uuid NOT NULL,
	"created_by" uuid,
	"paid_by" uuid,
	"kind" text DEFAULT 'gasto' NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"date" date NOT NULL,
	"category" text DEFAULT 'otros' NOT NULL,
	"description" text NOT NULL,
	"note" text,
	"mode" text DEFAULT 'registrar' NOT NULL,
	"status" text DEFAULT 'confirmado' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"goal_id" uuid,
	"invoiced" boolean DEFAULT false NOT NULL,
	"deductible" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"origin_id" uuid,
	"personal_entry_id" uuid,
	"transfer_id" uuid,
	"copilot_message_id" uuid,
	"raw" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "box_entry_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "box_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"box_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "box_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"box_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'integrante' NOT NULL,
	"status" text DEFAULT 'activo' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "box_salaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"box_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"frequency" text DEFAULT 'mensual' NOT NULL,
	"next_date" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "box_salaries_box_id_unique" UNIQUE("box_id")
);
--> statement-breakpoint
CREATE TABLE "box_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid NOT NULL,
	"from_box_id" uuid,
	"to_box_id" uuid,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"date" date NOT NULL,
	"salary_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "box_kind" NOT NULL,
	"purpose" text,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"invite_token_hash" text,
	"invite_created_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bitacora_entries" ADD COLUMN "moved_to_box_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "bitacora_entries" ADD COLUMN "box_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "bitacora_entries" ADD COLUMN "transfer_id" uuid;--> statement-breakpoint
ALTER TABLE "box_entries" ADD CONSTRAINT "box_entries_box_id_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_entries" ADD CONSTRAINT "box_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_entries" ADD CONSTRAINT "box_entries_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_entries" ADD CONSTRAINT "box_entries_goal_id_box_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."box_goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_entry_shares" ADD CONSTRAINT "box_entry_shares_entry_id_box_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."box_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_entry_shares" ADD CONSTRAINT "box_entry_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_goals" ADD CONSTRAINT "box_goals_box_id_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_goals" ADD CONSTRAINT "box_goals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_members" ADD CONSTRAINT "box_members_box_id_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_members" ADD CONSTRAINT "box_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_salaries" ADD CONSTRAINT "box_salaries_box_id_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_salaries" ADD CONSTRAINT "box_salaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_transfers" ADD CONSTRAINT "box_transfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_transfers" ADD CONSTRAINT "box_transfers_from_box_id_boxes_id_fk" FOREIGN KEY ("from_box_id") REFERENCES "public"."boxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_transfers" ADD CONSTRAINT "box_transfers_to_box_id_boxes_id_fk" FOREIGN KEY ("to_box_id") REFERENCES "public"."boxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "box_entries_box_date_idx" ON "box_entries" USING btree ("box_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "box_entry_shares_entry_user_idx" ON "box_entry_shares" USING btree ("entry_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "box_members_box_user_idx" ON "box_members" USING btree ("box_id","user_id");--> statement-breakpoint
CREATE INDEX "box_members_user_idx" ON "box_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "box_transfers_user_idx" ON "box_transfers" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "boxes_owner_individual_idx" ON "boxes" USING btree ("owner_id","kind") WHERE "boxes"."kind" in ('personal', 'negocio');--> statement-breakpoint
CREATE INDEX "boxes_owner_idx" ON "boxes" USING btree ("owner_id");--> statement-breakpoint
-- Datos: caja de negocio para cada autónomo y para quien marcó gastos «de mi actividad»
INSERT INTO "boxes" ("kind", "name", "owner_id")
SELECT DISTINCT 'negocio'::box_kind, 'Mi negocio', u."id"
FROM "users" u
LEFT JOIN "studios" s ON s."id" = u."studio_id"
WHERE (u."role" = 'titular' AND s."kind" = 'personal')
   OR EXISTS (SELECT 1 FROM "bitacora_entries" e WHERE e."user_id" = u."id" AND e."professional" AND e."deleted_at" IS NULL)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "box_members" ("box_id", "user_id", "role")
SELECT b."id", b."owner_id", 'titular' FROM "boxes" b WHERE b."kind" = 'negocio'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Los gastos «de mi actividad» pasan a la caja de negocio sin perder nada: el
-- registro original queda en raw y el de la Bitácora, borrado y vinculado.
WITH moved AS (
  INSERT INTO "box_entries" ("box_id", "created_by", "paid_by", "kind", "amount", "currency", "date", "category", "description", "note", "deductible", "source", "origin_id", "copilot_message_id", "raw", "created_at")
  SELECT b."id", e."user_id", e."user_id", e."kind"::text, e."amount", e."currency", e."date",
    CASE c."key" WHEN 'transporte' THEN 'transporte' WHEN 'suscripciones' THEN 'software' WHEN 'educacion' THEN 'capacitacion' WHEN 'casa' THEN 'servicios' WHEN 'ingresos' THEN 'ventas' ELSE CASE WHEN e."kind" = 'ingreso' THEN 'ventas' ELSE 'otros' END END,
    e."description", e."note", e."deductible", 'bitacora', e."id", e."copilot_message_id", to_jsonb(e.*) || jsonb_build_object('categoria_bitacora', c."name"), e."created_at"
  FROM "bitacora_entries" e
  JOIN "boxes" b ON b."owner_id" = e."user_id" AND b."kind" = 'negocio'
  LEFT JOIN "bitacora_categories" c ON c."id" = e."category_id"
  WHERE e."professional" AND e."deleted_at" IS NULL AND e."moved_to_box_entry_id" IS NULL
  RETURNING "id", "origin_id"
)
UPDATE "bitacora_entries" e SET "moved_to_box_entry_id" = moved."id", "deleted_at" = now()
FROM moved WHERE e."id" = moved."origin_id";
--> statement-breakpoint
INSERT INTO "audit_log" ("studio_id", "actor_id", "actor_label", "action", "entity_type", "entity_id", "metadata")
SELECT u."studio_id", u."id", 'Faro', 'caja.migracion_negocio', 'caja', b."id"::text,
  jsonb_build_object('movimientos', (SELECT count(*) FROM "box_entries" x WHERE x."box_id" = b."id" AND x."source" = 'bitacora'))
FROM "boxes" b JOIN "users" u ON u."id" = b."owner_id" WHERE b."kind" = 'negocio';
