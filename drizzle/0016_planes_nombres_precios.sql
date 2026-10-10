ALTER TYPE "public"."tenant_kind" ADD VALUE 'persona';--> statement-breakpoint
CREATE TABLE "faro_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studios" ALTER COLUMN "plan_key" SET DEFAULT 'inicial';--> statement-breakpoint
ALTER TABLE "faro_plans" ADD COLUMN "price_usd" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "faro_plans" ADD COLUMN "extra_org_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "faro_plans" ADD COLUMN "trial_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "faro_settings" ADD CONSTRAINT "faro_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Nombres de planes simples (§2.k): migración de datos, mismas cuentas y mismos límites contratados
UPDATE "studios" SET "plan_key" = CASE "plan_key" WHEN 'senal' THEN 'inicial' WHEN 'rumbo' THEN 'profesional' WHEN 'horizonte' THEN 'avanzado' WHEN 'destello' THEN 'autonomo_gratis' WHEN 'guia' THEN 'autonomo_pro' ELSE "plan_key" END;--> statement-breakpoint
UPDATE "plan_requests" SET "from_plan" = CASE "from_plan" WHEN 'senal' THEN 'inicial' WHEN 'rumbo' THEN 'profesional' WHEN 'horizonte' THEN 'avanzado' WHEN 'destello' THEN 'autonomo_gratis' WHEN 'guia' THEN 'autonomo_pro' ELSE "from_plan" END,
  "to_plan" = CASE "to_plan" WHEN 'senal' THEN 'inicial' WHEN 'rumbo' THEN 'profesional' WHEN 'horizonte' THEN 'avanzado' WHEN 'destello' THEN 'autonomo_gratis' WHEN 'guia' THEN 'autonomo_pro' ELSE "to_plan" END;--> statement-breakpoint
-- Planes editables: se renombran y toman los precios de referencia en USD
UPDATE "faro_plans" SET "key" = 'inicial', "name" = 'Inicial', "price_usd" = 49, "extra_org_usd" = 2, "trial_days" = 30, "free" = false, "limits" = "limits" || '{"organizations": 10}'::jsonb WHERE "key" = 'senal';--> statement-breakpoint
UPDATE "faro_plans" SET "key" = 'profesional', "name" = 'Profesional', "price_usd" = 119, "extra_org_usd" = 2, "trial_days" = 30, "limits" = "limits" || '{"organizations": 40}'::jsonb, "modules" = array_append("modules", 'red_estudios') WHERE "key" = 'rumbo';--> statement-breakpoint
UPDATE "faro_plans" SET "key" = 'avanzado', "name" = 'Avanzado', "price_usd" = 249, "extra_org_usd" = 2, "trial_days" = 30, "limits" = "limits" || '{"organizations": 120}'::jsonb, "modules" = array_append("modules", 'red_estudios') WHERE "key" = 'horizonte';--> statement-breakpoint
UPDATE "faro_plans" SET "key" = 'autonomo_gratis', "name" = 'Gratis', "price_usd" = 0 WHERE "key" = 'destello';--> statement-breakpoint
UPDATE "faro_plans" SET "key" = 'autonomo_pro', "name" = 'Pro', "price_usd" = 9, "trial_days" = 30 WHERE "key" = 'guia';--> statement-breakpoint
INSERT INTO "faro_settings" ("key", "value") VALUES ('usd_ars', '1400'::jsonb) ON CONFLICT DO NOTHING;
