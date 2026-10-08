# Estudio Cristofaro · Web + Backoffice (fase 1)

Next.js 15 (App Router) · Tailwind 4 · Postgres + Drizzle · Better Auth · Nodemailer (SMTP) · Docker / Easypanel

## Qué incluye

**Web pública**
- Home con la nueva propuesta de valor: el resumen mensual del hero se completa en vivo, selector "¿Qué tipo de contribuyente sos?" que se despliega, diferenciales en grilla bento, números del estudio, proceso, servicios, novedades y marquesina de rubros.
- Landings por segmento: `/monotributistas`, `/pymes-y-sociedades`, `/empleadores`, `/emprendedores`.
- `/servicios` y una página por servicio (`/servicios/contable`, `impositivo`, `laboral`, `societario`).
- `/planes`, `/equipo`, `/novedades`, `/preguntas-frecuentes`, `/contacto`.
- `/diagnostico`: formulario de 4 pasos que crea una consulta en el backoffice.
- Botón flotante de WhatsApp, SEO por página, sitemap, robots, JSON-LD (AccountingService y FAQPage), imagen para compartir generada.
- Redirecciones de las URLs viejas (`/index.html`, `/features.html`, `/about.html`, `/faq.html`, `/contact.html`).
- Si la base no está configurada o no responde, la web funciona igual con contenido de respaldo (`src/lib/content.ts`). El build nunca necesita la base.
- Formulario de consultas con honeypot y límite de 5 envíos cada 10 minutos por IP.
- Movimiento sutil con [motion](https://motion.dev) y scroll suave con Lenis (solo en la web pública). Con `prefers-reduced-motion` no hay animaciones: se ve directo el estado final.

**Backoffice (`/admin`)**
- Login con email y contraseña (Better Auth), sin registro público. Roles: admin y contador (cliente queda listo para la fase 2).
- Resumen: consultas del mes, sin contactar, conversión, clientes activos, abono total, próximas acciones y origen de consultas.
- Consultas: tablero kanban (Nuevas → Contactadas → Presupuesto enviado → Ganadas / Perdidas), búsqueda, ficha con seguimiento, responsable, próxima acción, notas, respuesta directa por WhatsApp o mail y botón **Convertir en cliente**.
- Clientes: listado con filtros, alta y edición (CUIT, régimen, categoría, servicios, abono).
- Contenidos: novedades, planes y preguntas frecuentes editables sin tocar código.
- Usuarios (solo admin): alta de contadores con contraseña inicial, cambio de rol y desactivación (cierra sus sesiones).
- Formularios, selects, diálogos de confirmación, avisos y toasts con [shadcn/ui](https://ui.shadcn.com) (copiado en `src/components/ui` y adaptado a la marca).
- Mails automáticos por consulta nueva (aviso al estudio + confirmación al interesado) por SMTP.
- Multi-estudio: cada página y cada action filtra por el estudio del usuario logueado.

**Preparado para la fase 2** (tablas creadas, sin pantallas todavía): `obligations` (vencimientos por cliente), `documents` (archivos), `client_users` (acceso de clientes al portal). Todo el modelo lleva `studio_id`, listo para multi-estudio.

## Desarrollo local

Necesitás Node 22 y Docker.

```bash
npm install
cp .env.example .env.local      # completar; para local alcanza con los valores de abajo
docker compose up -d            # Postgres 16 en localhost:5432
npm run db:migrate              # crea las tablas (migraciones de /drizzle)
npm run db:seed                 # estudio, planes, preguntas y usuario admin
npm run dev                     # web en http://localhost:3000, backoffice en /admin
```

Para probar la imagen de producción contra el Postgres local:

```bash
docker build -t estudio-cristofaro .
docker run --rm --network host --env-file .env.local estudio-cristofaro   # migra y levanta en :3000
```

Valores mínimos de `.env.local` para desarrollo:

```
DATABASE_URL=postgres://cristofaro:cristofaro@localhost:5432/cristofaro
BETTER_AUTH_SECRET=cualquier-texto-largo-solo-para-local
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ADMIN_EMAIL=vos@estudiocristofaro.com
ADMIN_PASSWORD=una-clave-de-8-o-mas
```

### Base de datos

- El esquema está en `src/db/schema.ts`. Después de cambiarlo: `npm run db:generate` crea la migración nueva en `/drizzle` (se commitea) y `npm run db:migrate` la aplica.
- El contenedor aplica las migraciones pendientes solo, cada vez que arranca.
- `npm run db:seed` se puede correr varias veces: no duplica el estudio, los planes, las preguntas ni el usuario admin.
- Los usuarios viven en la tabla `users` (Better Auth) con su `role` y `studio_id`; las sesiones en `sessions` y las contraseñas hasheadas en `accounts`.

## Deploy en Easypanel (VPS de Hostinger)

La app corre como un contenedor Docker (este repo trae el `Dockerfile`) y la base es un servicio Postgres del mismo proyecto de Easypanel. Cada vez que el contenedor arranca aplica solo las migraciones pendientes y después levanta el servidor en el puerto 3000.

### 1. Proyecto y base de datos

1. En Easypanel: **Create Project** → por ejemplo `cristofaro`.
2. Dentro del proyecto: **+ Service → Postgres**. Nombre: `db`. Easypanel genera usuario, contraseña y base.
3. En la pestaña **Credentials** del servicio copiá la **Internal connection URL** (algo como `postgres://postgres:CLAVE@cristofaro_db:5432/cristofaro`). Esa es la `DATABASE_URL` de la app: el host interno (`cristofaro_db`) solo existe dentro de Easypanel, la base no queda expuesta a internet.

### 2. App desde GitHub

1. **+ Service → App**. Nombre: `web`.
2. **Source → GitHub**: repo `potargodev/estudio-cristofaro`, rama `main`. (La primera vez hay que conectar GitHub en *Settings → GitHub* de Easypanel.)
3. **Build → Dockerfile**, ruta `Dockerfile`.
4. **Environment**: cargá las variables de la tabla de abajo y guardá.
5. **Deploy**. En los logs tiene que aparecer `[migrate] Base actualizada.` y después `Ready`.
6. Opcional: activá **Auto Deploy** para que cada push a `main` despliegue solo.

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | La Internal connection URL del paso 1 |
| `BETTER_AUTH_SECRET` | Texto aleatorio largo: `openssl rand -base64 32`. No cambiarlo después (cierra todas las sesiones) |
| `BETTER_AUTH_URL` | `https://estudiocristofaro.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://estudiocristofaro.com` (se fija al compilar; si cambia, hay que redeployar) |
| `STUDIO_SLUG` | `cristofaro` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Usuario admin que crea el seed (mínimo 8 caracteres) |
| `SMTP_HOST` / `SMTP_PORT` | `smtp.hostinger.com` / `465` |
| `SMTP_USER` / `SMTP_PASS` | Casilla de Hostinger que envía los avisos y su contraseña |
| `MAIL_FROM` | `Estudio Cristofaro <avisos@estudiocristofaro.com>` (la misma casilla de `SMTP_USER`) |
| `STUDIO_NOTIFY_EMAIL` | Dónde llegan los avisos de consultas nuevas |

Si faltan las variables SMTP la web funciona igual, solo que no manda mails.

### 3. Dominio y SSL

1. En el DNS del dominio: registro **A** de `estudiocristofaro.com` (y de `www`) apuntando a la IP del VPS.
2. En el servicio `web` → **Domains**: agregá `estudiocristofaro.com` con puerto **3000** y HTTPS activado. Easypanel pide el certificado de Let's Encrypt solo y lo renueva.
3. Agregá también `www.estudiocristofaro.com` con redirección al dominio principal.

### 4. Datos iniciales (una sola vez)

En el servicio `web` → **Console** (o `docker exec` en el VPS):

```bash
node dist/seed.mjs
```

Crea el estudio, los planes, las preguntas frecuentes y el usuario admin. Se puede volver a correr sin duplicar nada. Después de entrar por primera vez a `/admin`, sacá `ADMIN_PASSWORD` de las variables de entorno. Los demás usuarios se crean desde **/admin/usuarios**.

### 5. Healthcheck

`GET /api/health` devuelve `200 {"ok":true,"db":"ok"}` si la app y la base responden, y `503` si la base no contesta. La imagen ya trae un `HEALTHCHECK` con ese endpoint; en Easypanel podés usar la misma ruta para el monitoreo.

### 6. Backups del Postgres a S3

1. Creá un bucket en un almacenamiento compatible con S3 (AWS S3, Cloudflare R2, Backblaze B2, etc.) y unas credenciales con permiso de escritura solo sobre ese bucket.
2. En Easypanel → **Settings → Backups / Storage**: agregá el destino S3 (endpoint, región, bucket, access key y secret key).
3. En el servicio `db` → **Backups**: elegí ese destino, un horario (por ejemplo diario a las 3 a. m.) y cuántas copias conservar.
4. Probá una restauración al menos una vez: el backup es un dump de `pg_dump` que se restaura con `pg_restore` (o `psql` si es SQL plano) sobre una base vacía.

### Actualizar

Push a `main` (con Auto Deploy) o **Deploy** a mano. Si el cambio trae migraciones nuevas en `/drizzle`, se aplican solas al arrancar el contenedor nuevo.

## Contenido real pendiente

- Equipo: nombres, matrícula, foto y bio (`src/lib/content.ts` → `team`).
- Testimonios reales con autorización (`testimonials`; la sección aparece sola cuando hay al menos uno).
- Montos de los planes: desde el backoffice → Contenidos → Planes.
- Horario y dirección de la oficina (`src/lib/site.ts`).
- Números del estudio (años, clientes activos, presentaciones por mes) en `src/lib/content.ts` → `stats`: hoy tienen valores de ejemplo marcados como TODO.
- Revisar y ajustar los textos de servicios y segmentos con el estudio.

## Identidad de marca

Colores, tipografías y logos salen del manual de marca (octubre 2026).

- **Colores** (`src/app/globals.css`): azul noche `navy` (#1c2235) como principal, rosé `rose` (#a57c6d) como acento, escala de pizarras y fondo `paper` cálido. Las variantes `rose-deep` y `rose-light` existen para que el texto rosé cumpla contraste sobre fondo claro y oscuro.
- **Logos** (`public/marca/`): `logo-horizontal.svg`, `sello.svg`, `nombre.svg` y `monograma.svg`, extraídos en vector del manual. Los componentes `Logo` y `Monogram` los usan como máscara, así toman el color del texto.
- **Tipografías**: Archivo para textos. Para títulos la marca usa **Belgan Aesthetic**, que no está en Google Fonts y requiere licencia comercial; mientras tanto se muestra **Forum**, la más parecida. Para activar Belgan: copiar el archivo con licencia web a `public/fonts/belgan-aesthetic.woff2` y agregar en `globals.css`:
  ```css
  @font-face {
    font-family: "Belgan Aesthetic";
    src: url("/fonts/belgan-aesthetic.woff2") format("woff2");
    font-display: swap;
  }
  ```
