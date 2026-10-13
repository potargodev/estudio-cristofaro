#!/usr/bin/env bash
# Regresión completa sobre una base nueva: migraciones, datos de prueba,
# simuladores, servidor de producción (npm run build antes) y todas las
# pruebas de servidor y navegador; primero sin la demo y después con la demo
# cargada. Deja un resumen y el log de cada prueba en $SALIDA (por defecto
# /tmp/faro-regresion). Solo desarrollo: nunca contra staging.
#
#   npm run build && bash scripts/pruebas/regresion.sh [filtro]
set -uo pipefail
cd "$(dirname "$0")/../.."
FILTRO="${1:-}"
SALIDA="${SALIDA:-/tmp/faro-regresion}"
rm -rf "$SALIDA"; mkdir -p "$SALIDA"
set -a; . ./.env.local; set +a

# ── Base y archivos nuevos ──
BASE_DB="${DATABASE_URL%/*}"
export DATABASE_URL="$BASE_DB/faro_regresion"
psql "$BASE_DB/postgres" -qc "DROP DATABASE IF EXISTS faro_regresion WITH (FORCE)" -c "CREATE DATABASE faro_regresion" >/dev/null
export UPLOADS_DIR="$SALIDA/uploads"; mkdir -p "$UPLOADS_DIR"

# ── Simuladores y variables que apuntan a ellos ──
export XUBIO_API_URL=http://localhost:4020/API/1.1 GOOGLE_API_MOCK_URL=http://localhost:4030 GOOGLE_OAUTH_MOCK_URL=http://localhost:4030
export FX_API_URL=http://localhost:4040
export ARCA_WSAA_URL=http://localhost:4060/ws/services/LoginCms ARCA_WSFE_URL=http://localhost:4060/wsfev1/service.asmx
export ARCA_PADRON_URL=http://localhost:4060/sr-padron/webservices/personaServiceA5 ARCA_WSCDC_URL=http://localhost:4060/WSCDC/service.asmx
export MERCADOPAGO_API_URL=http://localhost:4070 MERCADOPAGO_AUTH_URL=http://localhost:4070 MERCADOPAGO_MOCK_URL=http://localhost:4070/checkout/v1/redirect
export MP_CLIENT_ID=mock MP_CLIENT_SECRET=mock MP_MOCK_WEBHOOK_SECRET=mock-webhook-secret
export WHATSAPP_API_URL=http://localhost:4090 CRON_SECRET=secreto-de-pruebas ALLOW_PRIVATE_URLS=true
export TIENDAS_API_URL=http://localhost:4100 CONTABILIUM_API_URL=http://localhost:4110
# Marca blanca: con APP_HOSTS cargado, otro host (el dominio propio de f9-navegador) sirve solo el portal
export APP_HOSTS=localhost
export FARO_URL=http://localhost:3000 PW="${PW:-/opt/node22/lib/node_modules/playwright/index.mjs}"
pkill -f "mocks/.*/server.mjs" 2>/dev/null; pkill -f "connector/mock/server.mjs" 2>/dev/null; pkill -f "mock/server.mjs" 2>/dev/null
for m in openai xubio google dolar arca mercadopago tiendas contabilium; do setsid node "mocks/$m/server.mjs" > "$SALIDA/mock-$m.log" 2>&1 & done
# WhatsApp en 4090: el 4080 es del simulador de Tango, que levantan las pruebas de principios
PORT=4090 setsid node mocks/whatsapp/server.mjs > "$SALIDA/mock-whatsapp.log" 2>&1 &
(cd connector && setsid node mock/server.mjs > "$SALIDA/mock-tango-delta.log" 2>&1 &)
sleep 2

node dist/migrate.mjs 2>/dev/null || npx tsx scripts/migrate.ts > "$SALIDA/migrate.log" 2>&1
# Como en staging: el admin del seed es también el owner de Faro (las pruebas usan su sesión en el Faro Manager)
export FARO_OWNER_EMAIL="$ADMIN_EMAIL"
npx tsx scripts/seed.ts > "$SALIDA/seed.log" 2>&1
node scripts/pruebas/datos.mjs > "$SALIDA/datos.log" 2>&1
node scripts/pruebas/proveedor.mjs > "$SALIDA/proveedor.log" 2>&1
node --conditions=react-server --import tsx scripts/pruebas/arca-datos.mts > "$SALIDA/arca-datos.log" 2>&1
psql "$DATABASE_URL" -qc "update users set two_factor_enabled = true, faro_role = 'faro_owner' where email = '${FARO_OWNER_EMAIL:-cristofaro.dev@gmail.com}'" \
  -c "insert into users (name, email, email_verified, role, studio_id, two_factor_enabled, faro_role) select 'Owner de pruebas', 'owner@faro.test', true, 'dueno', id, true, 'faro_owner' from studios where slug = '${STUDIO_SLUG:-cristofaro}' on conflict (email) do update set faro_role = 'faro_owner', two_factor_enabled = true" >/dev/null
LOG="$SALIDA/servidor.log" bash scripts/pruebas/servidor.sh > /dev/null || { echo "El servidor no arrancó (ver $SALIDA/servidor.log)"; exit 1; }

RESUMEN="$SALIDA/resumen.txt"
correr() { # nombre, comando…
  local nombre="$1"; shift
  [ -n "$FILTRO" ] && [[ "$nombre" != *"$FILTRO"* ]] && return
  local t0=$SECONDS
  timeout "${LIMITE:-900}" "$@" > "$SALIDA/$nombre.log" 2>&1
  local rc=$?
  local res="$(grep -cE '^✔' "$SALIDA/$nombre.log")✔ $(grep -cE '^✘' "$SALIDA/$nombre.log")✘"
  printf "%-4s %-34s %-12s %4ss\n" "$([ $rc = 0 ] && echo OK || echo FALLA)" "$nombre" "$res" "$((SECONDS - t0))" | tee -a "$RESUMEN"
}
S=(node --conditions=react-server --import tsx)
T=(npx tsx --conditions=react-server)

echo "── Sin la demo (en el orden en que se construyeron las fases, docs/avances.md) ──" | tee -a "$RESUMEN"
correr unitarias npm test
correr f1 "${T[@]}" scripts/pruebas/f1.mts
correr niveles node scripts/pruebas/niveles.mjs
correr planes "${T[@]}" scripts/pruebas/planes.mts
correr conexiones "${T[@]}" scripts/pruebas/conexiones.mts
correr asistente node scripts/pruebas/asistente.mjs
correr mcp node scripts/pruebas/mcp.mjs
correr gastos "${T[@]}" scripts/pruebas/gastos.mts
correr gastos-ia node scripts/pruebas/gastos-ia.mjs
correr industrias "${T[@]}" scripts/pruebas/industrias.mts
correr industrias-ia node scripts/pruebas/industrias-ia.mjs
# La Red crea la ficha publicada del estudio A que usan las Flotas
correr red "${T[@]}" scripts/pruebas/red.mts
correr flotas "${T[@]}" scripts/pruebas/flotas.mts
correr copiloto "${T[@]}" scripts/pruebas/copiloto.mts
correr vigia-aislamiento node scripts/pruebas/vigia-aislamiento.mjs
correr bitacora "${T[@]}" scripts/pruebas/bitacora.mts
correr grupos-amigos "${T[@]}" scripts/pruebas/grupos-amigos.mts
correr mensajes "${T[@]}" scripts/pruebas/mensajes.mts
# F3 · ARCA y Faro Personal
correr arca-cliente "${S[@]}" scripts/pruebas/arca-cliente.mts
correr arca-navegador node scripts/pruebas/arca-navegador.mjs
correr arca-vigia "${S[@]}" scripts/pruebas/arca-vigia.mts
correr leyendas "${S[@]}" scripts/pruebas/leyendas.mts
# F8 · Bitácora
correr bitacora-navegador node scripts/pruebas/bitacora-navegador.mjs
correr bitacora-servidor "${S[@]}" scripts/pruebas/bitacora-servidor.mts
# F6 · Lectura inteligente y conciliación
correr lectura-navegador node scripts/pruebas/lectura-navegador.mjs
correr lectura-servidor "${S[@]}" scripts/pruebas/lectura-servidor.mts
# §2.q · Lectura de compras (ítems, tributos, aprendizaje por proveedor y carga masiva)
correr lectura-compras "${S[@]}" scripts/pruebas/lectura-compras.mts
# §2.q · Conciliación con tolerancias, grupos y asientos de ajuste
correr conciliacion-tolerancias "${S[@]}" scripts/pruebas/conciliacion-tolerancias.mts
# §2.q · Análisis del Libro IVA
correr libro-iva "${S[@]}" scripts/pruebas/libro-iva.mts
# F7 · Cobros
correr cobros-navegador node scripts/pruebas/cobros-navegador.mjs
correr cobros-servidor "${S[@]}" scripts/pruebas/cobros-servidor.mts
# F5 · Empleados
correr empleados-navegador node scripts/pruebas/empleados-navegador.mjs
correr empleados-servidor "${S[@]}" scripts/pruebas/empleados-servidor.mts
correr liquidacion "${S[@]}" scripts/pruebas/liquidacion.mts
# §2.q · Stock (con el simulador de tiendas)
correr stock "${S[@]}" scripts/pruebas/stock.mts
# A0 · Núcleo y adaptadores (con los simuladores de Contabilium y Xubio)
correr nucleo "${S[@]}" scripts/pruebas/nucleo.mts
# A1 · Contabilidad general nativa
correr contabilidad "${S[@]}" scripts/pruebas/contabilidad.mts
# A2 · Ajuste por inflación (índices del simulador de cotizaciones)
correr inflacion "${S[@]}" scripts/pruebas/inflacion.mts
# A3 · Reportes de cierre de sueldos e impuestos del banco
correr cierre-sueldos "${S[@]}" scripts/pruebas/cierre-sueldos.mts
# A4 · Enviar documentos por WhatsApp (links públicos, wa.me y la API simulada)
correr compartir "${S[@]}" scripts/pruebas/compartir.mts
# F4 · Flujos
correr flujos-navegador node scripts/pruebas/flujos-navegador.mjs
correr flujos-servidor "${S[@]}" scripts/pruebas/flujos-servidor.mts
# F9 · Cartera, WhatsApp y marca blanca
correr f9-servidor "${S[@]}" scripts/pruebas/f9-servidor.mts
correr f9-navegador node scripts/pruebas/f9-navegador.mjs
# Principios de producto
correr principios-servidor "${S[@]}" scripts/pruebas/principios-servidor.mts
correr principios-navegador node scripts/pruebas/principios-navegador.mjs
correr tareas-internas "${S[@]}" scripts/pruebas/tareas-internas.mts
correr redirecciones npx tsx scripts/verificar-redirecciones.mts
correr enlaces npx tsx scripts/verificar-enlaces.mts

echo "── Con la demo cargada ──" | tee -a "$RESUMEN"
correr demo-navegador node scripts/pruebas/demo-navegador.mjs
npx tsx scripts/demo.ts seed > "$SALIDA/demo-seed.log" 2>&1
# Regresión por captura sobre la demo recién cargada (QA_ACTUALIZAR=1 rehace las referencias)
correr qa-capturas env SALIDA_CAPTURAS="$SALIDA/qa-capturas" node scripts/pruebas/qa-capturas.mjs ${QA_ACTUALIZAR:+--actualizar}
correr ver-como node scripts/pruebas/ver-como.mjs
correr auditoria-seguridad "${S[@]}" scripts/pruebas/auditoria-seguridad.mts
# §2.q · Agente contable (incluye la cartera de 20 organizaciones de la demo)
correr agente "${S[@]}" scripts/pruebas/agente.mts
correr red-con-demo "${T[@]}" scripts/pruebas/red.mts
correr principios-con-demo "${S[@]}" scripts/pruebas/principios-servidor.mts
correr recorrido env SALIDA="$SALIDA/recorrido.json" node scripts/pruebas/recorrido.mjs 200
# QA visual al píxel (npm run qa:visual): detector en pantallas y estados, datos extremos y capturas de referencia
LIMITE=3600 correr qa-visual env SALIDA="$SALIDA/qa-visual.json" node scripts/pruebas/qa-visual.mjs --estados --max=25 --capturas="$SALIDA/qa-visual"
correr qa-estados env SALIDA="$SALIDA/qa-estados.json" node scripts/pruebas/qa-estados.mjs --capturas="$SALIDA/qa-estados"
correr enlaces-con-demo npx tsx scripts/verificar-enlaces.mts

echo; echo "Resumen en $RESUMEN"
grep -c "^FALLA" "$RESUMEN" | xargs -I{} echo "{} pruebas con fallas"
