#!/usr/bin/env bash
# Reinicia el servidor de producción local (después de npm run build) en :3000
cd "$(dirname "$0")/../.."
pkill -f "[n]ext-server" ; pkill -f "[n]ext start" ; sleep 1
setsid npx next start -p 3000 > "${LOG:-/tmp/faro-prod.log}" 2>&1 &
for i in $(seq 1 30); do curl -sf localhost:3000/api/health > /dev/null && echo "servidor listo" && exit 0; sleep 1; done
echo "el servidor no respondió"; tail -20 "${LOG:-/tmp/faro-prod.log}"; exit 1
