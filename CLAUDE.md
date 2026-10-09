# Estudio Cristofaro · reglas del proyecto

## Fuente de verdad del producto
- `docs/brief-producto.md`: brief funcional completo (organizaciones, roles, planes, módulos, IA, Tango, prioridades y criterios de aceptación).
- `docs/resumen-ejecutivo.md`: versión corta.
Ante cualquier duda de alcance o diseño funcional, esos documentos mandan. Si una tarea contradice el brief, avisá antes de implementarla.

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
- Agenda: `ENCRYPTION_KEY` (cifra los tokens de Google Calendar; no cambiarla) y, opcional, `CRON_SECRET`. Los recordatorios corren solos cada 5 minutos (instrumentation.ts).
- Acceso: el estudio entra con contraseña + 2FA obligatorio; los clientes, con Google o enlace por mail y solo con invitación.

## Gotchas
- No usar `loading.tsx` en layouts con formularios: con `redirect()` en server actions el router de Next queda colgado. Usar `<Suspense>` dentro de la página.
- Nada que no sea una action en archivos `"use server"` (cualquier función exportada queda expuesta como endpoint).

## Reglas no negociables
- Multi-tenant: toda query y toda action valida en el servidor el estudio y la organización del usuario. Nunca confiar en IDs que vengan del navegador. Probar el aislamiento forzando IDs.
- Archivos privados: solo se descargan por rutas autenticadas que verifican permisos.
- Toda acción sensible queda registrada en la auditoría (actor, fecha, organización, resultado).
- La IA propone, una persona aprueba: nada fiscal, de pagos ni comunicaciones sensibles se ejecuta sin aprobación.
- Datos que vienen de integraciones o archivos guardan fuente, fecha de sincronización, ID externo, estado de validación y registro original.
- Tango es una fuente intercambiable: todo tiene que funcionar también con importación de archivos.

## Estilo
- Textos de interfaz en español rioplatense (voseo), lenguaje simple para clientes y preciso para el estudio.
- Identidad de marca: azul noche #1c2235, rosé #a57c6d, pizarra; títulos en Forum (hasta tener la licencia de Belgan Aesthetic) y textos en Archivo.
- Mobile first. Respetar prefers-reduced-motion.

## Forma de trabajo
- Commits chicos por etapa, push a main. `npm run build` sin errores antes de cada push.
- Migraciones con drizzle-kit; nunca editar migraciones ya aplicadas.
- Al terminar una tarea: listar qué quedó, qué se probó y qué falta configurar.
