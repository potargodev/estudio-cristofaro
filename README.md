# Estudio Cristofaro · Web + Backoffice (fase 1)

Next.js 15 (App Router) · Tailwind 4 · Postgres + Drizzle · Better Auth · Nodemailer (SMTP) · Docker / Easypanel

## Qué incluye

**Web pública**
- Home con la nueva propuesta de valor, selector "¿Qué tipo de contribuyente sos?", diferenciales, proceso, servicios y novedades.
- Landings por segmento: `/monotributistas`, `/pymes-y-sociedades`, `/empleadores`, `/emprendedores`.
- `/servicios` y una página por servicio (`/servicios/contable`, `impositivo`, `laboral`, `societario`).
- `/planes`, `/equipo`, `/novedades`, `/preguntas-frecuentes`, `/contacto`.
- `/diagnostico`: formulario de 4 pasos que crea una consulta en el backoffice.
- Botón flotante de WhatsApp, SEO por página, sitemap, robots, JSON-LD (AccountingService y FAQPage), imagen para compartir generada.
- Redirecciones de las URLs viejas (`/index.html`, `/features.html`, `/about.html`, `/faq.html`, `/contact.html`).
- Si la base no está configurada o no responde, la web funciona igual con contenido de respaldo (`src/lib/content.ts`). El build nunca necesita la base.
- Formulario de consultas con honeypot y límite de 5 envíos cada 10 minutos por IP.

**Backoffice (`/admin`)**
- Login con email y contraseña (Better Auth), sin registro público. Roles: admin y contador (cliente queda listo para la fase 2).
- Resumen: consultas del mes, sin contactar, conversión, clientes activos, abono total, próximas acciones y origen de consultas.
- Consultas: tablero kanban (Nuevas → Contactadas → Presupuesto enviado → Ganadas / Perdidas), búsqueda, ficha con seguimiento, responsable, próxima acción, notas, respuesta directa por WhatsApp o mail y botón **Convertir en cliente**.
- Clientes: listado con filtros, alta y edición (CUIT, régimen, categoría, servicios, abono).
- Contenidos: novedades, planes y preguntas frecuentes editables sin tocar código.
- Usuarios (solo admin): alta de contadores con contraseña inicial, cambio de rol y desactivación.
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

## Contenido real pendiente

- Equipo: nombres, matrícula, foto y bio (`src/lib/content.ts` → `team`).
- Testimonios reales con autorización (`testimonials`; la sección aparece sola cuando hay al menos uno).
- Montos de los planes: desde el backoffice → Contenidos → Planes.
- Horario y dirección de la oficina (`src/lib/site.ts`).
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
