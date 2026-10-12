-- Avisos «Subió …» de la Bitácora: el porcentaje pasa al formato argentino
-- ("251.8% más" → "251,8 % más"), igual que los que se generan desde ahora.
UPDATE "bitacora_insights"
SET "body" = regexp_replace("body", '([0-9]+)\.([0-9]+)% más', '\1,\2' || chr(160) || '% más')
WHERE "kind" = 'aumento' AND "body" ~ '[0-9]\.[0-9]+% más';--> statement-breakpoint
UPDATE "bitacora_insights"
SET "body" = regexp_replace("body", '([0-9]+)% más', '\1' || chr(160) || '% más')
WHERE "kind" = 'aumento' AND "body" ~ '[0-9]% más';
