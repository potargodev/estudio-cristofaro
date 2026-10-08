# Estudio Cristofaro · Web + Backoffice (fase 1)

Next.js 15 (App Router) · Tailwind 4 · Supabase · Resend · Vercel

## Qué incluye

**Web pública**
- Home con la nueva propuesta de valor, selector "¿Qué tipo de contribuyente sos?", diferenciales, proceso, servicios y novedades.
- Landings por segmento: `/monotributistas`, `/pymes-y-sociedades`, `/empleadores`, `/emprendedores`.
- `/servicios` y una página por servicio (`/servicios/contable`, `impositivo`, `laboral`, `societario`).
- `/planes`, `/equipo`, `/novedades`, `/preguntas-frecuentes`, `/contacto`.
- `/diagnostico`: formulario de 4 pasos que crea una consulta en el backoffice.
- Botón flotante de WhatsApp, SEO por página, sitemap, robots, JSON-LD (AccountingService y FAQPage), imagen para compartir generada.
- Redirecciones de las URLs viejas (`/index.html`, `/features.html`, `/about.html`, `/faq.html`, `/contact.html`).
- Si Supabase todavía no está conectado, la web funciona igual con contenido de respaldo (`src/lib/content.ts`).

**Backoffice (`/admin`)**
- Login con Supabase Auth. Roles: admin y contador (cliente queda listo para la fase 2).
- Resumen: consultas del mes, sin contactar, conversión, clientes activos, abono total, próximas acciones y origen de consultas.
- Consultas: tablero kanban (Nuevas → Contactadas → Presupuesto enviado → Ganadas / Perdidas), búsqueda, ficha con seguimiento, responsable, próxima acción, notas, respuesta directa por WhatsApp o mail y botón **Convertir en cliente**.
- Clientes: listado con filtros, alta y edición (CUIT, régimen, categoría, servicios, abono).
- Contenidos: novedades, planes y preguntas frecuentes editables sin tocar código.
- Mails automáticos por consulta nueva (aviso al estudio + confirmación al interesado) con Resend.

**Preparado para la fase 2** (tablas creadas, sin pantallas todavía): `obligations` (vencimientos por cliente), `documents` (archivos en Storage), `client_users` (acceso de clientes al portal). Todo el modelo lleva `studio_id`, listo para multi-estudio.

## Puesta en marcha

1. **Instalar**
   ```bash
   npm install
   cp .env.example .env.local
   ```
2. **Supabase**: crear un proyecto, ir a *SQL Editor* y correr en orden:
   - `supabase/migrations/0001_init.sql`
   - `supabase/seed.sql`
3. Completar `.env.local` con `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (*Project Settings → API*).
4. **Primer usuario**: *Authentication → Users → Add user*. Copiar su UUID y correr el insert que está al final de `supabase/seed.sql`.
5. **Mails (opcional)**: crear cuenta en Resend, verificar el dominio y completar `RESEND_API_KEY`, `RESEND_FROM` y `STUDIO_NOTIFY_EMAIL`.
6. `npm run dev` → web en `http://localhost:3000`, backoffice en `/admin`.

## Deploy en Vercel

Importar el repo, cargar las mismas variables de entorno (con `NEXT_PUBLIC_SITE_URL=https://estudiocristofaro.com`) y apuntar el dominio.

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
