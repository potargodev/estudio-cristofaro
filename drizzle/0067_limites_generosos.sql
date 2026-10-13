-- §2.p B11: límites más generosos. Solo cambia los planes que siguen con los
-- valores de antes (lo editado en el Faro Manager no se pisa).
UPDATE "faro_plans" SET "limits" = "limits" || '{"organizations": 10, "staffUsers": 2, "smartDocsPerMonth": 100, "flows": 3}'::jsonb
  WHERE "key" = 'inicial' AND "limits"->>'organizations' = '5' AND "limits"->>'staffUsers' = '1' AND "limits"->>'smartDocsPerMonth' = '30';--> statement-breakpoint
UPDATE "faro_plans" SET "limits" = "limits" || '{"organizations": 60, "staffUsers": 10, "smartDocsPerMonth": 3000, "flows": 25, "agentTasksPerMonth": 200}'::jsonb
  WHERE "key" = 'profesional' AND "limits"->>'organizations' = '40' AND "limits"->>'staffUsers' = '5';--> statement-breakpoint
UPDATE "faro_plans" SET "limits" = "limits" || '{"organizations": 250, "staffUsers": 50, "smartDocsPerMonth": 20000, "agentTasksPerMonth": 2000}'::jsonb
  WHERE "key" = 'avanzado' AND "limits"->>'organizations' = '120' AND "limits"->>'staffUsers' = '25';--> statement-breakpoint
UPDATE "faro_plans" SET "limits" = "limits" || '{"invoicesPerMonth": 30}'::jsonb
  WHERE "key" = 'autonomo_gratis' AND "limits"->>'invoicesPerMonth' = '10';--> statement-breakpoint
UPDATE "faro_plans" SET "limits" = "limits" || '{"smartDocsPerMonth": 1000, "agentTasksPerMonth": 50}'::jsonb
  WHERE "key" = 'autonomo_pro' AND "limits"->>'smartDocsPerMonth' = '300';--> statement-breakpoint
UPDATE "faro_plans" SET "limits" = "limits" || '{"smartDocsPerMonth": 200}'::jsonb
  WHERE "key" = 'persona_plus' AND "limits"->>'smartDocsPerMonth' = '100';
