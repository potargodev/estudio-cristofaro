-- Resumen semanal de la Bitácora: una vez por persona y semana (semana ISO de
-- Buenos Aires). Borra los repetidos (queda el primero) y pasa el período de la
-- fecha a la semana, que es la clave nueva del índice único.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id, to_char((created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 'IYYY-"W"IW')
    ORDER BY created_at, id
  ) AS rn
  FROM bitacora_insights
  WHERE kind = 'resumen_semanal'
)
DELETE FROM bitacora_insights WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
--> statement-breakpoint
UPDATE bitacora_insights
SET period = to_char((created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 'IYYY-"W"IW')
WHERE kind = 'resumen_semanal' AND period !~ '^[0-9]{4}-W[0-9]{2}$';
--> statement-breakpoint
-- El mismo aviso en la campanita: uno por persona y semana
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id, to_char((created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 'IYYY-"W"IW')
    ORDER BY created_at, id
  ) AS rn
  FROM notifications
  WHERE title = 'Tu semana en un minuto'
)
DELETE FROM notifications WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
