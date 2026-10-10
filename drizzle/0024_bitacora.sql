CREATE TYPE "public"."movement_kind" AS ENUM('gasto', 'ingreso');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('efectivo', 'debito', 'credito', 'transferencia', 'mercado_pago');--> statement-breakpoint
CREATE TABLE "bitacora_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text,
	"name" text NOT NULL,
	"kind" "movement_kind" DEFAULT 'gasto' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bitacora_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "movement_kind" DEFAULT 'gasto' NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"date" date NOT NULL,
	"category_id" uuid,
	"description" text NOT NULL,
	"payment_method" "payment_method",
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"copilot_message_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bitacora_categories" ADD CONSTRAINT "bitacora_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora_entries" ADD CONSTRAINT "bitacora_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora_entries" ADD CONSTRAINT "bitacora_entries_category_id_bitacora_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."bitacora_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bitacora_categories_user_idx" ON "bitacora_categories" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bitacora_categories_key" ON "bitacora_categories" USING btree ("user_id","key") WHERE "bitacora_categories"."key" is not null;--> statement-breakpoint
CREATE INDEX "bitacora_entries_user_date_idx" ON "bitacora_entries" USING btree ("user_id","date");