# Estudio Cristofaro · Web, portal de clientes y backoffice

Next.js 15 (App Router) · Tailwind 4 · Postgres + Drizzle · Better Auth · Nodemailer (SMTP) · Docker / Easypanel

## Qué incluye

**Web pública**
- Home con la nueva propuesta de valor: el resumen mensual del hero se completa en vivo, selector "¿Qué tipo de contribuyente sos?" que se despliega, diferenciales en grilla bento, números del estudio, proceso, servicios, novedades y marquesina de rubros.
- Landings por segmento: `/monotributistas`, `/pymes-y-sociedades`, `/empleadores`, `/emprendedores`.
- `/servicios` y una página por servicio (`/servicios/contable`, `impositivo`, `laboral`, `societario`).
- `/planes`, `/equipo` (retratos con especialidad), `/novedades`, `/preguntas-frecuentes`, `/contacto`, `/agendar` (llamada con Google Meet) y `/privacidad`.
- `/diagnostico`: formulario de 4 pasos que crea una consulta en el backoffice.
- Botón flotante de WhatsApp, SEO por página, sitemap, robots, JSON-LD (AccountingService y FAQPage), imagen para compartir generada.
- Redirecciones de las URLs viejas (`/index.html`, `/features.html`, `/about.html`, `/faq.html`, `/contact.html`).
- Si la base no está configurada o no responde, la web funciona igual con contenido de respaldo (`src/lib/content.ts`). El build nunca necesita la base.
- Formulario de consultas con honeypot y límite de 5 envíos cada 10 minutos por IP.
- Movimiento sutil con [motion](https://motion.dev) y scroll suave con Lenis (solo en la web pública). Con `prefers-reduced-motion` no hay animaciones: se ve directo el estado final.

**Backoffice (`/admin`)**
- Acceso del estudio con email, contraseña y segundo factor obligatorio (TOTP + códigos de respaldo). Roles: admin y contador.
- Resumen: KPIs, gráficos por semana de consultas y vencimientos, próximas llamadas, solicitudes abiertas y documentos nuevos.
- Consultas (kanban) con **Convertir en cliente**, que crea la organización con su razón social.
- **Organizaciones** (reemplaza a Clientes; las URLs viejas redirigen): listado con plan, responsable, módulos y alertas; ficha con *General y razones sociales*, *Plan y módulos* (límites del plan y excepciones auditadas), *Miembros e invitaciones*, *Equipo del estudio*, *Vencimientos*, *Documentos*, *Solicitudes*, *Integraciones* y *Actividad* (línea de tiempo desde la auditoría).
- **Agenda**: vista semanal, disponibilidad por persona y conexión con Google Calendar.
- Contenidos, usuarios del estudio e integraciones. Todo filtrado por estudio en el servidor y con auditoría de las acciones sensibles.

**Portal del cliente (`/portal`)**
- Sin contraseñas ni registro público: Google o enlace por mail, solo con invitación vigente o membresía activa.
- Una persona puede pertenecer a varias organizaciones (selector arriba). Roles Administrador, Dirección, Administración, Recursos Humanos y Consulta; la matriz de permisos está en `src/lib/permissions.ts` y se valida siempre en el servidor.
- Inicio como tablero (este mes, responsable del estudio con botón para agendar, actividad), Vencimientos, Documentos, Solicitudes, módulos activos de la organización (catálogo en `src/lib/modules/catalog.ts`) y **Mi equipo** para el administrador (invitar, revocar, cambiar roles, contador de usuarios del plan).
- Archivos privados: solo se bajan por `/api/archivos/[id]`, que verifica la membresía y el permiso, y cada descarga queda auditada.

**Integración con Tango Gestión (v1: conexión y clientes)**
- `/admin/integraciones` (solo admin): activar Tango, generar o regenerar la clave del conector (se muestra una sola vez, con el `config.json` listo para bajar), estado de la conexión, log de las últimas 20 sincronizaciones, empresas de Tango ↔ clientes y mapeo configurable de campos.
- "Clientes en Tango": cruce por CUIT con los clientes de la plataforma, vincular o importar como cliente nuevo. La ficha del cliente vinculado muestra "Vinculado con Tango".
- Conector local en [`connector/`](connector/README.md) (Node 22, sin dependencias) que lee la API Delta en la red del estudio y manda los datos firmados con HMAC a `POST /api/integrations/tango/ingest`. Incluye un simulador de la API Delta para desarrollo.
- Diseño enchufable (`src/lib/integrations/tango`): la interfaz `TangoSource` tiene la implementación "connector" y lugar para una futura "file" (importar exportaciones de Tango).

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
SITE_URL=http://localhost:3000
ADMIN_EMAIL=vos@estudiocristofaro.com
ADMIN_PASSWORD=una-clave-de-8-o-mas
UPLOADS_DIR=/ruta/absoluta/al/repo/.uploads
```

### Base de datos

- El esquema está en `src/db/schema.ts`. Después de cambiarlo: `npm run db:generate` crea la migración nueva en `/drizzle` (se commitea) y `npm run db:migrate` la aplica.
- El contenedor aplica las migraciones pendientes solo, cada vez que arranca.
- `npm run db:seed` se puede correr varias veces: no duplica el estudio, los planes, las preguntas ni el usuario admin.
- Los usuarios viven en la tabla `users` (Better Auth) con su `role` y `studio_id`; las sesiones en `sessions` y las contraseñas hasheadas en `accounts`.

## Deploy en Easypanel (VPS de Hostinger)

La app corre como un contenedor Docker (este repo trae el `Dockerfile`) y la base es un servicio Postgres del mismo proyecto de Easypanel. Cada vez que el contenedor arranca aplica solo las migraciones pendientes y después levanta el servidor en el puerto 3000. La configuración (URL, modo staging, base, login, mails) se lee en runtime: la misma imagen sirve para staging y producción.

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
| `SITE_URL` | `https://estudiocristofaro.com` (se lee en runtime: cambiarla no requiere recompilar) |
| `SITE_NOINDEX` | Vacía en producción; `true` en staging |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Opcional: otros orígenes permitidos para el login, separados por coma |
| `STUDIO_SLUG` | `cristofaro` |
| `UPLOADS_DIR` | `/data/uploads` (ya es el valor por defecto de la imagen; ahí va el volumen) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Usuario admin que crea el seed (mínimo 8 caracteres) |
| `SMTP_HOST` / `SMTP_PORT` | SMTP del proveedor de la casilla del dominio (ej. puerto `465`) |
| `SMTP_USER` / `SMTP_PASS` | Casilla de `@estudiocristofaro.com` que envía los avisos y su contraseña |
| `MAIL_FROM` | `Estudio Cristofaro <avisos@estudiocristofaro.com>` (la misma casilla de `SMTP_USER`) |
| `STUDIO_NOTIFY_EMAIL` | Dónde llegan los avisos de consultas nuevas |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Credenciales OAuth de Google para el login de clientes y la agenda (opcional: sin ellas no aparece el botón y la agenda funciona sin Google) |
| `ENCRYPTION_KEY` | Clave para cifrar los tokens de Google Calendar: `openssl rand -base64 32`. No cambiarla después |
| `CRON_SECRET` | Opcional: para disparar los recordatorios de la agenda desde un cron externo |

Si faltan las variables SMTP la web funciona igual, solo que no manda mails (las consultas se guardan en el backoffice). Usá el SMTP del proveedor donde está la casilla de `estudiocristofaro.com`: si se envía desde otro servidor, los mails caen en spam.

### 3. Volumen para los archivos del portal

Los documentos y comprobantes del portal se guardan en disco, en `/data/uploads` dentro del contenedor. Para que no se pierdan en cada deploy:

1. Servicio `web` → **Mounts** → **Add Volume**: nombre `uploads`, ruta de montaje `/data/uploads`.
2. Usá un **Volume** (volumen de Docker) y no un *Bind mount*: el volumen nuevo toma los permisos del usuario de la app. Si usás bind mount, la carpeta del host tiene que pertenecer al usuario `1001:1001` (`chown -R 1001:1001 <carpeta>`).
3. Incluí ese volumen en los backups del VPS: los archivos no están en el Postgres.

### 4. Dominio y SSL

1. En el DNS del dominio: registro **A** de `estudiocristofaro.com` (y de `www`) apuntando a la IP del VPS.
2. En el servicio `web` → **Domains**: agregá `estudiocristofaro.com` con puerto **3000** y HTTPS activado. Easypanel pide el certificado de Let's Encrypt solo y lo renueva.
3. Agregá también `www.estudiocristofaro.com` con redirección al dominio principal.

### 5. Datos iniciales (una sola vez)

En el servicio `web` → **Console** (o `docker exec` en el VPS):

```bash
node dist/seed.mjs
```

Crea el estudio, los planes, las preguntas frecuentes y el usuario admin. Se puede volver a correr sin duplicar nada. Después de entrar por primera vez a `/admin`, sacá `ADMIN_PASSWORD` de las variables de entorno. Los demás usuarios se crean desde **/admin/usuarios**.

### Acceso: estudio con 2FA, clientes con Google o enlace por mail

- **Estudio** (`/admin/login`): email y contraseña y, siempre, segundo factor con una app autenticadora (Google Authenticator, Microsoft Authenticator, 1Password…). La primera vez que alguien entra sin 2FA, la plataforma lo lleva a `/admin/seguridad`: confirma la contraseña, escanea el QR, guarda los 10 códigos de respaldo (cada uno sirve una vez) y confirma con el primer código. Las cuentas del estudio no pueden entrar con Google ni por enlace.
- **Clientes** (`/portal/login`): sin contraseña ni registro. Entran con **Continuar con Google** o con un **enlace por mail** (vence en 15 minutos, sirve una vez). El email tiene que tener una invitación vigente o una membresía activa; si no, se rechaza con un mensaje claro y no se manda nada. Al entrar se aceptan sus invitaciones pendientes.
- **Invitaciones**: las crea el estudio (pestaña *Miembros* de la organización) o el administrador de la organización (*Mi equipo* en el portal). Llegan por mail con un enlace a `/invitacion/<token>` que vence a los 7 días. Sin SMTP configurado, el enlace se muestra para copiarlo y mandarlo por otro medio. Los roles Dirección y RRHH que invita la organización esperan la confirmación del estudio.

#### Acceso de clientes con Google

1. En [Google Cloud Console](https://console.cloud.google.com/) creá un proyecto (o usá uno existente) → **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo *Externo*, nombre "Estudio Cristofaro", mail de soporte y el dominio `estudiocristofaro.com` en dominios autorizados. Scopes: `email`, `profile`, `openid`. Publicala (*En producción*) para que entre cualquier cuenta de Google.
2. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
3. **Orígenes autorizados de JavaScript**: `https://app.estudiocristofaro.com` (staging) y `https://estudiocristofaro.com` (producción).
4. **URIs de redireccionamiento autorizados**: `https://app.estudiocristofaro.com/api/auth/callback/google` y `https://estudiocristofaro.com/api/auth/callback/google`. Para desarrollo local, `http://localhost:3000/api/auth/callback/google`.
5. Copiá el ID y el secreto a `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en Easypanel y hacé **Deploy**.

Google solo confirma la identidad: si el email no está invitado, el acceso se rechaza igual.

### Agenda con Google Meet

- **Web**: `/agendar` (botones en el hero, el footer y al final del diagnóstico). La persona elige día y horario, deja sus datos y recibe la confirmación con el link de Meet, un archivo `.ics` y un link para reprogramar o cancelar sin iniciar sesión. Se crea o actualiza la consulta con origen "Agenda online".
- **Portal**: "Agendar una llamada" (inicio y menú) con el responsable del estudio y un motivo.
- **Backoffice**: `/admin/agenda` con la vista semanal (mis llamadas o todo el estudio) y *Mi disponibilidad*: horario semanal (hasta dos franjas por día), duración 15/30/45 min, margen entre llamadas, anticipación mínima, días bloqueados, si aparece en la web y un link fijo de videollamada para cuando no hay Google. Las próximas llamadas aparecen en el resumen y el historial en la ficha de la consulta y de la organización.
- **Mails**: confirmación (con `.ics`), aviso al estudio, reprogramación, cancelación y recordatorios 24 h y 1 h antes. Los recordatorios los manda la app sola cada 5 minutos; si preferís un cron externo, poné `AGENDA_REMINDERS=off` y llamá `POST /api/agenda/recordatorios` con `Authorization: Bearer <CRON_SECRET>`.
- **Sin Google** funciona igual: no se consulta la ocupación externa, la confirmación lleva el link fijo y el `.ics`.

#### Conectar Google Calendar

Es una conexión aparte del login (cada persona del estudio conecta SU calendario desde *Mi disponibilidad*):

1. En el mismo proyecto de Google Cloud del login: **APIs y servicios → Biblioteca → Google Calendar API → Habilitar**.
2. **Pantalla de consentimiento → Permisos (scopes)**: agregá `.../auth/calendar.events` y `.../auth/calendar.freebusy`. Son scopes sensibles: mientras la app no esté verificada por Google, cargá a las personas del estudio como **usuarios de prueba** (o pedí la verificación).
3. En el ID de cliente OAuth, sumá a **URIs de redireccionamiento autorizados**: `https://app.estudiocristofaro.com/api/agenda/google/callback` y `https://estudiocristofaro.com/api/agenda/google/callback`.
4. En Easypanel cargá `ENCRYPTION_KEY` (`openssl rand -base64 32`) y hacé **Deploy**. Los tokens se guardan cifrados con AES-256-GCM.
5. En `/admin/agenda` → *Mi disponibilidad* → **Conectar Google Calendar**. Desde ahí, los horarios ocupados en Google no se ofrecen y cada llamada se crea con Google Meet e invitación al cliente; reprogramar o cancelar actualiza el evento.

### Resetear la contraseña de alguien del estudio

Si una persona del estudio (admin o contador) pierde su contraseña, desde el servicio `web` → **Console**:

```bash
node dist/reset-password.mjs persona@estudiocristofaro.com
```

- Genera una contraseña temporal aleatoria y la muestra **una sola vez** en la consola. Pasásela por un canal seguro.
- Cierra todas las sesiones abiertas de esa persona.
- En el próximo ingreso la obliga a elegir una contraseña nueva antes de usar el backoffice.
- Solo funciona con usuarios del estudio; los clientes entran con Google o enlace por mail.
- No desactiva el segundo factor (2FA): después de la contraseña temporal pide el código de la app (o un código de respaldo) y recién ahí la nueva contraseña.
- Queda registrado en la auditoría.

En desarrollo: `npm run reset-password -- persona@estudiocristofaro.com`.

### 6. Healthcheck

`GET /api/health` devuelve `200 {"ok":true,"db":"ok"}` si la app y la base responden, y `503` si la base no contesta. La imagen ya trae un `HEALTHCHECK` con ese endpoint; en Easypanel podés usar la misma ruta para el monitoreo.

### 7. Backups del Postgres a S3

1. Creá un bucket en un almacenamiento compatible con S3 (AWS S3, Cloudflare R2, Backblaze B2, etc.) y unas credenciales con permiso de escritura solo sobre ese bucket.
2. En Easypanel → **Settings → Backups / Storage**: agregá el destino S3 (endpoint, región, bucket, access key y secret key).
3. En el servicio `db` → **Backups**: elegí ese destino, un horario (por ejemplo diario a las 3 a. m.) y cuántas copias conservar.
4. Probá una restauración al menos una vez: el backup es un dump de `pg_dump` que se restaura con `pg_restore` (o `psql` si es SQL plano) sobre una base vacía.

### 8. Conector de Tango

El conector se instala en la PC de la contadora donde corre Tango, no en Easypanel. Paso a paso en [`connector/README.md`](connector/README.md): Node 22, `config.json` bajado de **Integraciones**, `node index.mjs test`, `node index.mjs sync` y la tarea programada con `instalar-tarea.ps1`.

Para desarrollar sin Tango: `node connector/mock/server.mjs` levanta un simulador de la API Delta en `http://localhost:17000` (token `11111111-2222-3333-4444-555555555555`, empresas 1 y 2, 30 clientes).

### Actualizar

Push a `main` (con Auto Deploy) o **Deploy** a mano. Si el cambio trae migraciones nuevas en `/drizzle`, se aplican solas al arrancar el contenedor nuevo.

## Staging (app.estudiocristofaro.com)

Antes de reemplazar el sitio actual, la web nueva se publica como versión de prueba en `https://app.estudiocristofaro.com`, con la misma imagen y el mismo proceso de la sección anterior. Lo único que cambia son las variables:

```
SITE_URL=https://app.estudiocristofaro.com
BETTER_AUTH_URL=https://app.estudiocristofaro.com
SITE_NOINDEX=true
```

Con `SITE_NOINDEX=true` el staging no aparece en Google ni compite con el sitio actual:

- `robots.txt` responde `Disallow: /` para todos los buscadores y el sitemap sale vacío.
- Todas las páginas llevan `<meta name="robots" content="noindex, nofollow">`.
- Todas las respuestas llevan el header `X-Robots-Tag: noindex, nofollow` (también las imágenes y archivos de `public/`).
- Canonical, JSON-LD, imagen para compartir y links de los mails usan `SITE_URL`.

DNS: un registro **A** con nombre `app` apuntando a la IP del VPS, sin tocar `@`, `www` ni los MX (el sitio actual y el correo siguen como están). Verificá que propagó (por ejemplo en dnschecker.org) antes de agregar el dominio en Easypanel, así el certificado SSL sale bien de entrada.

Para revisar que el modo staging está activo:

```bash
curl -s https://app.estudiocristofaro.com/robots.txt          # Disallow: /
curl -sI https://app.estudiocristofaro.com/ | grep -i robots  # X-Robots-Tag: noindex, nofollow
```

## Pasaje a producción

Cuando el estudio apruebe el staging:

1. **DNS**: cambiá los registros **A** de `@` y `www` a la IP del VPS (los MX no se tocan). Conviene bajar antes el TTL a 300 para que el cambio se propague rápido.
2. **Easypanel → servicio `web` → Domains**: agregá `estudiocristofaro.com` (puerto 3000, HTTPS) y `www.estudiocristofaro.com` con redirección al dominio principal.
3. **Variables** (sin tocar código ni recompilar; alcanza con guardar y reiniciar):
   - `SITE_URL=https://estudiocristofaro.com`
   - `BETTER_AUTH_URL=https://estudiocristofaro.com`
   - `SITE_NOINDEX`: borrarla (o `false`).
4. **Redirigir el staging**: en Domains, cambiá `app.estudiocristofaro.com` a una redirección **301** hacia `https://estudiocristofaro.com` (conservando la ruta). Así cualquier link que haya circulado del staging termina en el sitio definitivo.
5. **Verificar**: `robots.txt` sin `Disallow: /` y con el sitemap del dominio principal, sin header `X-Robots-Tag`, login en `/admin` y una consulta de prueba. Después, dar de alta el sitio y el sitemap en Google Search Console.

Las sesiones del backoffice abiertas en `app.` no sirven en el dominio nuevo: hay que volver a iniciar sesión (no hace falta cambiar `BETTER_AUTH_SECRET`).

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
