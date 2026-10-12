#!/usr/bin/env bash
# Restaura un backup de Faro (ver docs/backup.md). Pisa la base y los archivos de destino:
# pide confirmación salvo con FORCE=1.
#
#   scripts/backup/restore.sh <faro-db-AAAAMMDD-HHMMSS.dump> <faro-uploads-AAAAMMDD-HHMMSS.tar.gz>
#
# Destino de la base: DATABASE_URL (pg_restore en el host) o PG_CONTAINER (+ PG_USER, PG_DB).
# Destino de los archivos: UPLOADS_PATH (carpeta) o WEB_CONTAINER (copia a /data/uploads).
set -euo pipefail
[ -f /etc/faro-backup.env ] && set -a && . /etc/faro-backup.env && set +a
DB_FILE="${1:?Falta el .dump}"
FILES_FILE="${2:?Falta el .tar.gz}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-cristofaro}"
container() { docker ps --format '{{.Names}}' | grep -m1 "^$1" || { echo "No encontré el contenedor $1" >&2; exit 1; }; }

if [ "${FORCE:-}" != "1" ]; then
  read -r -p "Se va a reemplazar la base y los archivos de destino. Escribí RESTAURAR para seguir: " ok
  [ "$ok" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
fi

# Base: --clean --if-exists borra y recrea cada objeto del dump (incluida la tabla de migraciones)
if [ -n "${DATABASE_URL:-}" ]; then
  pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" "$DB_FILE"
elif [ -n "${PG_CONTAINER:-}" ]; then
  docker exec -i "$(container "$PG_CONTAINER")" pg_restore --clean --if-exists --no-owner -U "$PG_USER" -d "$PG_DB" < "$DB_FILE"
else
  echo "Falta DATABASE_URL o PG_CONTAINER" >&2; exit 1
fi

# Archivos
if [ -n "${UPLOADS_PATH:-}" ]; then
  mkdir -p "$UPLOADS_PATH"
  find "$UPLOADS_PATH" -mindepth 1 -delete
  tar -xzf "$FILES_FILE" -C "$UPLOADS_PATH"
elif [ -n "${WEB_CONTAINER:-}" ]; then
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  tar -xzf "$FILES_FILE" -C "$TMP"
  C="$(container "$WEB_CONTAINER")"
  docker exec "$C" sh -c 'find /data/uploads -mindepth 1 -delete'
  docker cp "$TMP/." "$C":/data/uploads
else
  echo "Falta UPLOADS_PATH o WEB_CONTAINER" >&2; exit 1
fi
echo "[restore] Listo. Reiniciá el servicio web para que tome la base restaurada."
