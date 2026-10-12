# Faro · reglas del proyecto

El producto es **Faro**, la plataforma de gestión para estudios contables y autónomos. **Estudio Cristofaro es el tenant #1** (tipo estudio, cliente cero) y su web pública (estudiocristofaro.com) dice que trabaja con Faro.

## Fuente de verdad del producto
- `docs/faro-producto.md`: fuente de verdad de la PLATAFORMA (niveles, tenants, planes, módulos, IA/MCP/conexiones, Faro Personal, gastos compartidos, plantillas por industria, marca y hoja de ruta). Manda sobre el brief en todo eso.
- `docs/brief-producto.md`: brief funcional de lo que un estudio ofrece a sus organizaciones (roles de organización, portal, vencimientos, documentos, solicitudes).
- `docs/resumen-ejecutivo.md`: versión corta.
Ante cualquier duda de alcance o diseño funcional, esos documentos mandan. Si una tarea los contradice, avisá antes de implementarla.

## Stack y deploy
- Next.js 15 (App Router) · Tailwind 4 · shadcn/ui · motion · Postgres + Drizzle · Better Auth · Nodemailer (SMTP).
- Deploy: Docker en Easypanel (VPS Hostinger). Staging en https://app.estudiocristofaro.com. NO usar Vercel ni Supabase.
- El build nunca depende de la base de datos.

## Entorno
- Staging en Easypanel: proyecto `cristofaro`, servicios `web` (app, Dockerfile) y `db` (Postgres 16), VPS `srv1983285` (Hostinger).
- Deploy automático: cada push a `main` dispara el webhook de Easypanel y se despliega solo en staging. Las migraciones de `/drizzle` se aplican al arrancar el contenedor.
- La app escucha en el puerto 3000 y `0.0.0.0` (fijos en el Dockerfile). Healthcheck: `GET /api/health`.
- Volumen persistente `/data/uploads` montado en `web` (`UPLOADS_DIR`): ahí viven los archivos del portal; no están en el Postgres.
- Google OAuth configurado: `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` cargados en staging, redirect `https://app.estudiocristofaro.com/api/auth/callback/google`.
- SMTP pendiente: el mail del dominio está en el cPanel de Duplika (`mail.estudiocristofaro.com`). Hasta configurarlo, los mails no salen (se registran en el log).
- Reset de contraseña del estudio desde la consola de `web`: `node dist/reset-password.mjs <email>`.
- `ENCRYPTION_KEY` cifra los secretos guardados (tokens de Google, claves de IA, credenciales de conexiones, ARCA y Mercado Pago): no cambiarla.
- Tareas internas (instrumentation.ts): agenda, gastos, Vigía, flujos, ARCA, Bitácora, cobros, Tango, Agente contable y la cola de lectura. Cada una corre en una sola instancia a la vez (turno en `job_leases`) y se apaga con su variable en `off` (o todas con `JOBS=off`); el cron externo usa `CRON_SECRET` y el mismo turno. Lista en `.env.example`.
- Backup: `scripts/backup/` (pg_dump + `/data/uploads`) con cron en el VPS; restauración probada en `docs/backup.md`.
- Acceso: el estudio entra con contraseña + 2FA obligatorio; los clientes, con Google o enlace por mail y solo con invitación. Los usuarios de la demo (`is_demo`, `@demo.faro.local`) entran con contraseña y sin 2FA, solo a sus espacios de la demo; el owner de Faro puede «Ver como…» uno de ellos (Faro Manager → Plataforma → Demo).

## Gotchas
- No usar `loading.tsx` en layouts con formularios: con `redirect()` en server actions el router de Next queda colgado. Usar `<Suspense>` dentro de la página.
- Nada que no sea una action en archivos `"use server"` (cualquier función exportada queda expuesta como endpoint).
- Rutas, acciones y pantallas con datos usan `getSessionUser()` o los `require*` de `src/lib/auth.ts`, nunca `getCurrentUser()` (que no exige el 2FA ni la contraseña definitiva; queda para el flujo de ingreso).
- Una URL que elige un tenant (IA, MCP externo, Tango) se llama con `safeFetch` (`src/lib/safe-fetch.ts`): nunca hacia la red interna. `ALLOW_PRIVATE_URLS=true` solo en pruebas locales.
- La demo y lo real no se cruzan: todo punto donde dos personas o espacios se encuentran (invitaciones, Red Contable, conexiones, grupos, cajas, Flotas) valida el mundo con `src/lib/demo-world.ts`.
- Formatos, validaciones y CSV salen de un solo lugar: `src/lib/format.ts` (montos y fechas en hora de Buenos Aires), `src/lib/ids.ts` (UUID y email), `src/lib/csv.ts`, `src/lib/paths.ts` (rutas internas para volver).

## Reglas no negociables
- Multi-tenant: toda query y toda action valida en el servidor el estudio y la organización del usuario. Nunca confiar en IDs que vengan del navegador. Probar el aislamiento forzando IDs.
- Archivos privados: solo se descargan por rutas autenticadas que verifican permisos.
- Toda acción sensible queda registrada en la auditoría (actor, fecha, organización, resultado).
- El acceso asistido del equipo de Faro (soporte) no cambia equipo, credenciales, cobros, MCP, conexiones ni plan (`requireOwnAccount`).
- La IA propone, una persona aprueba: nada fiscal, de pagos ni comunicaciones sensibles se ejecuta sin aprobación.
- Datos que vienen de integraciones o archivos guardan fuente, fecha de sincronización, ID externo, estado de validación y registro original.
- Tango es una fuente intercambiable: todo tiene que funcionar también con importación de archivos.

## Estilo
- **Referencia de diseño: `DESIGN.md`** (tokens, escala tipográfica, alturas, radios, anchos, componentes y reglas). Toda pantalla se arma con `@/components/ds` y los roles de texto (`text-ui`, `text-title`…); nada de tamaños, alturas ni radios a mano. `PRODUCT.md` resume el producto para las herramientas de diseño (Impeccable en `.claude/skills/impeccable`). La auditoría está en `docs/auditoria-diseno.md`.
- Textos de interfaz en español rioplatense (voseo), lenguaje simple para clientes y preciso para el estudio.
- Identidad de marca: azul noche #1c2235, rosé #a57c6d (el "dorado" de la marca es este rosé / oro rosa, no un amarillo; los tokens `gold` apuntan a él), pizarra; títulos en Gilda Display (reemplazó a Forum en el rediseño, elegida por el cliente); números en Archivo tabular (clase `num`: tabular-nums y lining-nums, semibold) en la app y en las pantallas de producto de las landings; textos en Archivo.
- Logo de Faro: sello de Estudio Cristofaro + "FARO" en mayúsculas, Bodoni Moda 800 (next/font, `font-faro`) con tracking amplio (`FaroLogo`), en la app, /faro, el Faro Manager, los mails (`mailLayout` con marca "Faro") y los íconos de la PWA de Faro (`/faro.webmanifest`). El portal de una organización muestra la marca del estudio y "Con tecnología de Faro".
- App (backoffice, portal, panel personal, gastos, Faro Manager): clase `app-ui`, modo claro y oscuro (`data-theme` en `<html>`), barra lateral siempre oscura (`keep-dark` o `bg-night`), esquinas sutiles (`rounded-md` = 6 px en la app, 0 en la web) y fondo de página `bg-canvas` (no `bg-paper`, que es el claro fijo para texto sobre oscuro). La web pública sigue en la dirección "Precisión" (recta y oscura).
- Mobile first. Respetar prefers-reduced-motion.

## Forma de trabajo
- Commits chicos por etapa, push a main. `npm run build` sin errores ni advertencias antes de cada push (incluye ESLint); también `npm run typecheck`, `npm run lint`, `npm run knip` y `npm test`.
- Pruebas de punta a punta en `scripts/pruebas/` (README → «Pruebas»); `scripts/verificar-enlaces.mts` y `scripts/verificar-redirecciones.mts` contra un servidor corriendo.
- Migraciones con drizzle-kit; nunca editar migraciones ya aplicadas.
- Centro de ayuda: toda funcionalidad nueva o que cambia actualiza su artículo en `docs/ayuda/<categoria>/<slug>.md` (y la fecha `actualizado` del frontmatter) en el mismo commit. `npm run ayuda` valida el formato y compila el índice (corre solo antes de cada build).
- Al terminar una tarea: listar qué quedó, qué se probó y qué falta configurar.
