# Backup y restauración

Faro guarda datos en dos lugares y los dos entran en el backup:

- **Postgres** (servicio `db` de Easypanel): toda la base.
- **`/data/uploads`** (volumen del servicio `web`): documentos, recibos, comprobantes, adjuntos y logos. No están en la base.

Los scripts están en `scripts/backup/`: `backup.sh` (pg_dump en formato custom + un `.tar.gz` de los archivos, con verificación y retención) y `restore.sh`.

## Instalar en el VPS (una vez)

1. Copiá la carpeta `scripts/backup/` al VPS, por ejemplo en `/opt/faro-backup/`.
2. Buscá los nombres de los contenedores: `docker ps --format '{{.Names}}' | grep cristofaro`. Easypanel los nombra `cristofaro_db.1.<id>` y `cristofaro_web.1.<id>`; alcanza con el prefijo.
3. Creá `/etc/faro-backup.env` (permisos `600`):

   ```
   BACKUP_DIR=/var/backups/faro
   RETENTION_DAYS=14
   PG_CONTAINER=cristofaro_db
   PG_USER=postgres
   PG_DB=cristofaro
   WEB_CONTAINER=cristofaro_web
   ```

   `PG_USER` y `PG_DB` son los del servicio `db` en Easypanel. Si el volumen de archivos tiene una ruta fija en el host, podés usar `UPLOADS_PATH=<ruta>` en lugar de `WEB_CONTAINER`.
4. Probalo a mano: `sudo /opt/faro-backup/backup.sh`. Tiene que terminar con `[backup] … base, … archivos → /var/backups/faro`.
5. Programalo con cron (`sudo crontab -e`), todos los días a las 3:17:

   ```
   17 3 * * * /opt/faro-backup/backup.sh >> /var/log/faro-backup.log 2>&1
   ```

6. Sacá una copia fuera del VPS (por ejemplo con `rclone` a un bucket o al backup de Hostinger). Un backup que vive solo en el mismo servidor no protege de perderlo.

El backup automático del servicio `db` de Easypanel a S3 (README, «Backups del Postgres a S3») sigue sirviendo para la base, pero no incluye `/data/uploads`: por eso existe este script.

## Restaurar

1. Elegí el par de archivos de la misma fecha: `faro-db-AAAAMMDD-HHMMSS.dump` y `faro-uploads-AAAAMMDD-HHMMSS.tar.gz`.
2. Pausá el servicio `web` en Easypanel (que nadie escriba mientras tanto).
3. Corré, con las mismas variables de `/etc/faro-backup.env`:

   ```
   sudo /opt/faro-backup/restore.sh /var/backups/faro/faro-db-….dump /var/backups/faro/faro-uploads-….tar.gz
   ```

   Pide escribir `RESTAURAR` para confirmar (o `FORCE=1`). Reemplaza la base completa y el contenido de `/data/uploads`.
4. Volvé a levantar `web`. Al arrancar, `node dist/migrate.mjs` ve que la base ya tiene sus migraciones y sigue («Base al día»): si el backup es de una versión anterior, aplica solo las que faltan.

## Prueba de restauración (12 de octubre de 2026, en local)

Backup de una base con la demo cargada (34 usuarios, 21 espacios, 594 eventos de auditoría, 46 migraciones y 45 archivos) y restauración en una base vacía: mismas cantidades, los 45 archivos idénticos (sha256) y el migrador respondió «Base al día». Repetir la prueba en el VPS al instalarlo y una vez por trimestre.
