#!/usr/bin/env bash
# Backup de Faro: base (pg_dump, formato custom) + archivos del portal (/data/uploads).
# Pensado para correr con cron en el VPS (ver docs/backup.md). Deja un par de
# archivos por fecha en BACKUP_DIR y borra los de más de RETENTION_DAYS días.
#
# Variables (en el entorno o en /etc/faro-backup.env):
#   BACKUP_DIR        carpeta destino                       (por defecto /var/backups/faro)
#   RETENTION_DAYS    días que se guardan                   (por defecto 14)
#   La base, una de dos:
#     PG_CONTAINER    nombre (o prefijo) del contenedor de Postgres de Easypanel: usa docker exec
#     DATABASE_URL    conexión directa con pg_dump instalado en el host
#   PG_USER / PG_DB   usuario y base dentro del contenedor  (por defecto postgres / cristofaro)
#   Los archivos, una de dos:
#     UPLOADS_PATH    carpeta del volumen en el host
#     WEB_CONTAINER   nombre (o prefijo) del contenedor web: copia /data/uploads con docker cp
set -euo pipefail

[ -f /etc/faro-backup.env ] && set -a && . /etc/faro-backup.env && set +a
BACKUP_DIR="${BACKUP_DIR:-/var/backups/faro}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-cristofaro}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
umask 077

container() { docker ps --format '{{.Names}}' | grep -m1 "^$1" || { echo "No encontré el contenedor $1" >&2; exit 1; }; }

# 1. Base
DB_FILE="$BACKUP_DIR/faro-db-$STAMP.dump"
if [ -n "${PG_CONTAINER:-}" ]; then
  docker exec "$(container "$PG_CONTAINER")" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc --no-owner > "$DB_FILE.tmp"
elif [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "$DATABASE_URL" -Fc --no-owner > "$DB_FILE.tmp"
else
  echo "Falta PG_CONTAINER o DATABASE_URL" >&2; exit 1
fi
mv "$DB_FILE.tmp" "$DB_FILE"

# 2. Archivos
FILES_FILE="$BACKUP_DIR/faro-uploads-$STAMP.tar.gz"
if [ -n "${UPLOADS_PATH:-}" ]; then
  tar -czf "$FILES_FILE.tmp" -C "$UPLOADS_PATH" .
elif [ -n "${WEB_CONTAINER:-}" ]; then
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  docker cp "$(container "$WEB_CONTAINER")":/data/uploads "$TMP/uploads"
  tar -czf "$FILES_FILE.tmp" -C "$TMP/uploads" .
else
  echo "Falta UPLOADS_PATH o WEB_CONTAINER" >&2; exit 1
fi
mv "$FILES_FILE.tmp" "$FILES_FILE"

# 3. Verificación mínima: el dump se puede listar y el tar se puede leer
pg_restore --list "$DB_FILE" > /dev/null 2>&1 || docker run --rm -i postgres:16-alpine pg_restore --list < "$DB_FILE" > /dev/null
tar -tzf "$FILES_FILE" > /dev/null

# 4. Retención
find "$BACKUP_DIR" -name 'faro-*' -type f -mtime +"$RETENTION_DAYS" -delete

echo "[backup] $(date -u +%FT%TZ) $(du -h "$DB_FILE" | cut -f1) base, $(du -h "$FILES_FILE" | cut -f1) archivos → $BACKUP_DIR"
