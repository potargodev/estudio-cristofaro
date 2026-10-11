-- Plan Inicial gratis (docs/principios-producto.md §20): sin prueba, sin
-- organización extra, hasta 5 organizaciones y 1 usuario. Los estudios que
-- estaban en Inicial con prueba o suspendidos por fin de prueba quedan activos
-- sin cobro. Las suscripciones de Mercado Pago las normaliza
-- normalizeFreeSubscriptions() al arrancar (cancela el débito y lo audita).
UPDATE "faro_plans" SET "price_usd" = 0, "free" = true, "trial_days" = 0, "extra_org_usd" = NULL,
  "tagline" = 'Gratis, para empezar a ordenar la cartera.',
  "limits" = "limits" || '{"organizations": 5, "staffUsers": 1}'::jsonb
WHERE "key" = 'inicial';
--> statement-breakpoint
INSERT INTO "audit_log" ("studio_id", "actor_label", "action", "entity_type", "entity_id", "result", "metadata")
SELECT "id", 'Faro', 'plan.inicial_gratis', 'tenant', "id"::text, 'ok',
  jsonb_build_object('estado_anterior', "status", 'prueba_hasta', "trial_ends_at", 'motivo', 'El plan Inicial pasa a ser gratis (sin prueba ni cobro)')
FROM "studios"
WHERE "plan_key" = 'inicial' AND ("status" <> 'activo' OR "trial_ends_at" IS NOT NULL)
  AND ("status" <> 'suspendido' OR "suspended_reason" IS NULL OR "suspended_reason" ILIKE '%prueba%' OR "suspended_reason" ILIKE '%pago%' OR "suspended_reason" ILIKE '%suscripci%');
--> statement-breakpoint
UPDATE "studios" SET "status" = 'activo', "trial_ends_at" = NULL, "suspended_reason" = NULL
WHERE "plan_key" = 'inicial' AND ("status" <> 'activo' OR "trial_ends_at" IS NOT NULL)
  AND ("status" <> 'suspendido' OR "suspended_reason" IS NULL OR "suspended_reason" ILIKE '%prueba%' OR "suspended_reason" ILIKE '%pago%' OR "suspended_reason" ILIKE '%suscripci%');
