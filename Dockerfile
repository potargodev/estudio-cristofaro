# Imagen de producción para Easypanel: Next.js standalone + migraciones de Drizzle.
#   docker build -t estudio-cristofaro .
#   docker run -p 3000:3000 --env-file .env estudio-cristofaro

# ───────── 1. Dependencias ─────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ───────── 2. Build ─────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# El build no necesita base ni variables del sitio: SITE_URL, SITE_NOINDEX,
# DATABASE_URL, etc. se leen en runtime, así la misma imagen sirve para
# staging y producción.
RUN npm run build && npm run build:scripts

# ───────── 3. Runtime ─────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Migraciones + scripts empaquetados (no necesitan node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

# Al arrancar: aplica las migraciones pendientes y después levanta el servidor.
# Si la migración falla, el contenedor no arranca (mejor que servir con la base desfasada).
CMD ["sh", "-c", "node dist/migrate.mjs && exec node server.js"]
