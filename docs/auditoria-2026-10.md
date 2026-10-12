# Auditoría de octubre 2026

Revisión completa del proyecto (12 de octubre de 2026): ramas, cuentas personales, código, seguridad, datos y tareas internas, documentación y verificación. Punto de partida: `390c95d` (Diseño · Etapa 3). Todo se hizo en `main`, en commits chicos por etapa, con `npm run build` sin errores ni advertencias antes de cada push. Las decisiones están en `docs/decisiones.md` (sección «Auditoría de octubre 2026»).

## Resumen

- **Sin hallazgos críticos.** Ningún camino encontrado dejaba ver o cambiar datos de otro estudio forzando IDs: las acciones y rutas ya filtraban por estudio y organización.
- **8 altos, corregidos:** el 2FA se podía saltear en descargas, exportación y facturación; había SSRF hacia la red interna; la demo podía cruzarse con datos reales; las migraciones no arrancaban en una base vacía; y había dependencias con alertas críticas.
- **Medios y bajos:** corregidos salvo los que figuran en «Qué quedó y por qué».
- **Código:** ESLint, `tsc` y knip en cero; un solo lugar para formatos, validaciones, CSV, PDF y Markdown; la app sin medidas a mano.
- **Verificación:** regresión completa en verde sobre una base nueva, sin la demo y con la demo (ver «Verificación»).

## Hallazgos por gravedad

### Crítico

Ninguno.

### Alto (todos corregidos)

| # | Hallazgo | Corrección |
|---|---|---|
| A1 | **2FA salteable.** `getCurrentUser()` devolvía la sesión aunque faltara el segundo factor o la contraseña definitiva. Con solo la contraseña de alguien del estudio se podía exportar el estudio entero (`/api/cuenta/exportar`), bajar archivos (documentos, recibos, legajo, facturas, config de Tango) y facturar en ARCA. | `getSessionUser()` exige la seguridad completa y reemplaza a `getCurrentUser()` en todo lo que toca datos. `getCurrentUser()` queda solo en el flujo de ingreso. Facturación usa `requireTenant`. Prueba: `auditoria-seguridad.mts`. |
| A2 | **SSRF.** La URL de un proveedor de IA compatible, de un MCP externo o de la API de Tango la elige el tenant (incluso una cuenta personal gratis) y el servidor la llamaba, devolviendo parte de la respuesta. Así se podía llegar a `localhost`, a servicios de Docker o a `169.254.169.254`. | `safeFetch` (`src/lib/safe-fetch.ts`) bloquea loopback, redes privadas, link-local y CGNAT en cada conexión (también ante DNS rebinding) y no sigue redirecciones. Solo acepta `https`. Los errores ya no devuelven el texto del destino. Prueba unitaria en `src/lib/net.test.ts`. |
| A3 | **La demo se cruzaba con lo real (Red Contable).** Los estudios demo aparecían en la Red pública con matrícula «verificada» y reseñas inventadas. Un pedido de propuesta, una llamada o una conexión real podía caer en un estudio ficticio, legible por cualquiera con la clave de la demo. | La Red, las fichas, los pedidos y las conexiones muestran y aceptan solo el mundo de quien mira: los anónimos, lo real. Ver `src/lib/demo-world.ts`. |
| A4 | **La demo alcanzaba a personas reales.** Un estudio demo podía invitar a una cuenta real (y así saber si existe), contactar postulantes reales y, si aceptaban, ver su caja de negocio. Los estudios reales veían postulantes ficticios. | Invitaciones de contador, postulantes, grupos, Bitácora compartida, Flotas, organizaciones y uniones por enlace (grupos y cajas) solo dentro del mismo mundo. El registro rechaza el dominio de la demo. |
| A5 | **Migraciones.** En una base vacía, la `0012` fallaba («unsafe use of new value of enum»): el migrador corría todo en una transacción. Un ambiente nuevo (producción, restauración) no arrancaba. | `scripts/migrate.ts` aplica cada migración en su propia transacción, con la misma tabla de Drizzle, y toma un candado para que no migren dos instancias a la vez. Probado en una base vacía y en una restaurada. |
| A6 | **Dependencias.** `npm audit` daba 2 críticas y 10 altas. Entre las de producción: `fast-xml-parser` (ARCA), y `tar` y `canvas` por medio de `unpdf`. | `unpdf` 1.x (sin canvas ni tar), `fast-xml-parser` 5 (ARCA probado contra el simulador) y `postcss` 8.5.29 para Next. Lo que queda está en «Qué quedó». |
| A7 | **Acceso asistido demasiado amplio.** El soporte de Faro entra como dueño y podía cambiar la cuenta de Mercado Pago, el equipo, las claves de IA, MCP y las conexiones. | `requireOwnAccount` en esas acciones: el soporte opera, pero no toca llaves, plata ni personas. Además, el acceso asistido usa el rol de Faro ya filtrado (un usuario demo nunca lo tiene). |
| A8 | **Ramas.** Seis ramas sin mergear; una de ellas (`dreamy-pascal`) traía un segundo sistema de demo con un ingreso sin 2FA propio. | Se trajo lo valioso, rehecho sobre la demo oficial: «Ver como…» y la tarjeta Sueldos. Lo duplicado se descartó (ver «Ramas»). |

### Medio

| # | Hallazgo | Estado |
|---|---|---|
| M1 | No había cabeceras de seguridad: CSP, HSTS, `frame-ancestors`, nosniff, Referrer-Policy y Permissions-Policy. | Corregido en `next.config.ts`. |
| M2 | Los webhooks sin autenticar (Mercado Pago, WhatsApp, Tango) leían cuerpos sin tope, guardaban el cuerpo de los rechazados y no tenían límite por IP. | Corregido: tope leído por partes, límite por IP y sin guardar cuerpos rechazados. Tango ignora además los reenvíos (replay). |
| M3 | En Grupos, cualquier integrante podía renovar el link de un invitado y operar como él. | Corregido: solo quien administra el grupo o quien invitó a esa persona. |
| M4 | Acciones sensibles sin auditoría: alta, rol y baja de usuarios, Tango, vencimientos, respuestas a solicitudes y cambio de contraseña. | Corregido. |
| M5 | Borrar la demo podía llevarse usuarios reales (en cascada) y conversaciones directas con personas reales. | Corregido: se frena si encuentra usuarios reales adentro y solo borra conversaciones entre usuarios de la demo. |
| M6 | Una cuenta demo podía mandar mails de Faro a cualquier dirección (invitaciones). | Corregido con A4: desde la demo solo se invita a la demo. |
| M7 | Los mails, el evento y el ICS de la agenda decían siempre «Estudio Cristofaro», aunque la llamada fuera con otro estudio de la Red. El emisor del 2FA también. | Corregido: va el nombre del estudio que atiende; el emisor del 2FA pasa a «Faro». |
| M8 | Varias pantallas formateaban fechas sin zona horaria y mostraban la hora UTC del servidor (Tango, organizaciones, solicitudes, equipo, auditoría…). | Corregido: todo el formato sale de `src/lib/format.ts`, con la hora de Buenos Aires. |
| M9 | Con dos instancias, las tareas internas podían correr dos veces (avisos duplicados), y una vuelta lenta podía pisarse con la siguiente. | Corregido: turno en Postgres (`job_leases`) compartido con los cron externos, y apagado por variable. Prueba: `tareas-internas.mts`. |
| M10 | El backup de Easypanel no incluye `/data/uploads`, y no había restauración probada. | Corregido: `scripts/backup/` con restauración probada en local (`docs/backup.md`). Falta instalarlo en el VPS (pendiente 10). |
| M11 | Las cuatro rutas de cron comparaban `CRON_SECRET` de un modo que un header raro convertía en error 500. | Corregido: una sola comparación por digest. |

### Bajo

| # | Hallazgo | Estado |
|---|---|---|
| B1 | El enlace mágico respondía distinto según el mail, y así revelaba qué casillas son del estudio. | Corregido: misma respuesta siempre; la cuenta del estudio recibe un mail que le indica dónde entrar. |
| B2 | Inyección de fórmulas en los CSV de Bitácora y Tango. | Corregido: un solo `toCsv` con las fórmulas neutralizadas. |
| B3 | Push: se aceptaba cualquier URL `https` como servicio. | Corregido: solo los servicios de push de los navegadores. |
| B4 | AES-GCM descifraba sin fijar el largo de la etiqueta. | Corregido: etiqueta de 128 bits e IV de 96. |
| B5 | Un refresh token de MCP reutilizado no se detectaba. | Corregido: revoca el acceso y queda en la auditoría. |
| B6 | Las APIs con cookie no verificaban el origen, y la exportación de lectura marcaba los comprobantes en un GET. | Corregido: chequeo de mismo origen (`Sec-Fetch-Site`/`Origin`). |
| B7 | Redirecciones abiertas en «volver» (Bitácora y Conexiones). | Corregido: `internalPath` y una sola validación de rutas internas. |
| B8 | El estudio podía leer la descripción de un movimiento ajeno al proponer un cambio. | Corregido: solo movimientos de la caja de negocio de esa cuenta. |
| B9 | Un rol que no podía aprobar una propuesta sí podía rechazarla. | Corregido. |
| B10 | El «Disponible» de una Flota seguía en manos del Capitán anterior. | Corregido: pasa al Capitán actual. |
| B11 | El JSON-LD de las preguntas frecuentes no escapaba `</script>`. | Corregido (`JsonLd`). |
| B12 | El directorio de la Red consultaba el plan de cada estudio en serie (N+1). | Corregido: en paralelo. |
| B13 | Importación circular entre el registro de herramientas y el motor de flujos. | Corregido: el motor se carga al usarlo. Dos herramientas sin módulo dueño, también corregido. |
| B14 | Contraste en oscuro: texto azul noche sobre fondo azul noche en dos pastillas. | Corregido. |
| B15 | El token del webhook de Flujos se guarda en claro. | Queda (ver abajo). |

## Qué se corrigió además (limpieza)

- **Cuentas personales:** el owner por defecto pasa a `cristofaro.dev@gmail.com` en el seed, `.env.example` y el README. Los simuladores usan `example.com`. No se tocaron datos de la base.
- **Código muerto:**
  - Fuera 4 server actions sin uso. Eran endpoints expuestos.
  - Fuera las funciones, constantes y tipos sin uso.
  - Fuera el stub de Tango por archivos, que solo tiraba un error (lo cubre la importación de Conexiones).
  - Fuera un componente huérfano y las clases y tokens de CSS sin uso.
  - Quedó `knip.json` (`npm run knip`).
- **Duplicados unificados:**
  - Montos y fechas: `lib/format.ts`, ~80 formateadores.
  - UUID y email: `lib/ids.ts`, ~40 copias.
  - CSV: `lib/csv.ts`, 4 versiones.
  - PDF: `lib/text/extract.ts`, 3 copias de unpdf y un lector propio.
  - Rutas para volver: `lib/paths.ts`.
  - CRON_SECRET y webhooks: `lib/http.ts`.
  - Markdown de los chats: `ChatMarkdown`.
  - La tarjeta del portal pasa a ser la del sistema de diseño.
- **Diseño:** la app no tiene tamaños, alturas, radios ni colores a mano (159 archivos), y el título de pantalla tiene su rol (`text-page`).
- **Redirecciones:** sin cadenas (Tango y `/estudio/…` van directo al lugar nuevo). `scripts/verificar-enlaces.mts` controla que los enlaces de la app y de la ayuda abran sin 404 ni rutas viejas.
- **Rendimiento:**
  - El canvas de flujos y el Markdown de los chats se cargan diferidos: Vigía pasa de 268 a 225 kB y el editor de flujos de 213 a 159 kB.
  - 28 índices nuevos por estudio, organización y usuario.
  - Con la demo y 2.127 movimientos, Inicio, Bitácora, Mis cajas, Vigía y el Inicio del estudio responden en menos de 125 ms en el servidor.
- **Documentación:**
  - CLAUDE.md, README, DESIGN.md, PRODUCT.md, faro-producto, principios, avances, demo, resumen, brief, `.env.example` y 10 artículos de la ayuda, todos al día.
  - `pendientes-configuracion.md` es una sola lista de 27 ítems ordenada por prioridad.

## Ramas

Ninguna se pudo borrar del remoto desde la sesión: el proxy de git rechaza el borrado (403) y las herramientas de GitHub no lo permiten. **Hay que borrarlas desde GitHub** (pendiente 27). La rama local de trabajo sí se borró, y solo queda `main`.

| Rama | Qué se trajo | Qué se descartó |
|---|---|---|
| `claude/dreamy-pascal-arlb5c` | «Ver como…», rehecho: solo `faro_owner` con 2FA, solo usuarios `is_demo`, franja permanente, «Volver a mi usuario» y auditoría. También la tarjeta Sueldos del inicio del portal y las etiquetas de auditoría del acceso asistido. | El segundo sistema de datos demo (`FARO_ENV`, `dev-env`, `demo-guard`, tenants `demo-*`), el panel `/dev` con su vista previa, `docs/entorno-demo.md` y `docs/ux-arquitectura.md`. |
| `claude/faro-ia-mcp-conexiones-7v36d1` | Nada: es historia anterior a la reescritura de `main` y todo su contenido ya está en `main`. | Toda la rama. |
| `claudev/modest-dirac-yc6flk` | Nada (Fase 1 original, superada). | Toda la rama. |
| `claude/funny-carson-ynqn4h`, `claude/epic-cerf-qe07jc` | Nada: ya estaban en `main`. | Toda la rama. |
| `claude/brave-faraday-u9us2d` | Nada: era la rama de esta sesión, sin commits propios. | Borrada en local; en el remoto ya no estaba. |

## Qué quedó y por qué

- **Ramas remotas viejas:** sin permiso para borrarlas desde la sesión (pendiente 27).
- **`node-forge` 1.4.0:** queda una alerta alta sin parche publicado, sobre la verificación de firmas PKCS#1 v1.5. Faro lo usa solo para firmar el CMS del WSAA, así que ese camino no se usa.
- **Alertas en herramientas de desarrollo:** `eslint-config-next` (braces, micromatch, fast-glob) y `drizzle-kit` (esbuild). No hay versión corregida y no llegan a la imagen.
- **Token del webhook de Flujos en claro:** cambiarlo rompe las URLs que los estudios ya configuraron. El riesgo es bajo: son 144 bits aleatorios, y un webhook solo crea corridas, mientras lo sensible pasa por Aprobaciones.
- **Rebinding de DNS en un segundo salto:** `safeFetch` valida en cada conexión y no sigue redirecciones, así que no hay un hueco conocido. Solo se anota.
- **Límites por IP en memoria, por contenedor:** con una sola réplica alcanza. Hay que confirmar que Traefik no deja pasar un `X-Forwarded-For` mandado por el cliente (pendiente 11).
- **Historial de git:** commits viejos conservan la cuenta personal anterior. Reescribir `main` rompería los clones y el deploy de Easypanel.
- **Textos legales (`docs/legal`):** todavía dicen «Red de estudios». Se corrigen en la revisión legal (pendiente 9), porque cambiar un texto aceptado cambia su versión.
- **Límites de Inicial:** principios y faro-producto los marcan «a confirmar» (5 organizaciones y 1 usuario). El código ya los aplica; falta la decisión de producto.
- **Datos de la web de Cristofaro:** equipo y «Responsable» siguen con datos a completar por el estudio (pendiente 12).

## Verificación

- `npm run typecheck`, `npm run lint`, `npm run knip` y `npm test` (98 unitarias): en cero.
- `npm run build`: sin errores ni advertencias, con ESLint incluido.
- **Regresión completa** (`bash scripts/pruebas/regresion.sh`): se corre sobre una base nueva, con todos los simuladores y el servidor de producción.
  - **Sin la demo:** 38 pruebas de servidor y de navegador, en el orden de las fases, más los verificadores de redirecciones y de enlaces.
  - **Con la demo cargada:** demo en el navegador, «Ver como…», la auditoría de seguridad, la Red Contable, los principios y el recorrido de las 134 pantallas a 390 y 1.440 px, en claro y en oscuro (536 cargas), con desborde, tamaños, controles, contraste y errores HTTP y de JS.
  - El resultado está en «Resultado de la regresión final», abajo.
- **Línea de base:** la misma regresión sobre `390c95d` daba 18 pruebas con fallas, la mayoría pruebas desactualizadas o dependientes del orden y del entorno. Ver «Pruebas que se actualizaron».

### Pruebas que se actualizaron

- **`niveles`:** el Asistente ahora está dentro del Vigía y el equipo del estudio tiene espacio Personal (§2.o).
- **`planes`:** Flujos ya está construido y entra en Inicial. Además, la prueba deja el plan del estudio B como lo encontró.
- **`arca-navegador`:** el semáforo ya no dice «Vas bien» (principio madre).
- **`bitacora-navegador`:** el gasto de la actividad ahora se mueve a la caja de negocio (principios §10). La prueba también crea las categorías antes de cargar la historia.
- **`lectura-navegador`**, **`empleados-navegador`** y **`flujos-navegador`:** buscan cada elemento sin ambigüedad y esperan el canvas diferido.
- **`cobros-navegador`:** cierra el acuerdo que inserta a mano.
- **`principios-navegador`:** apaga la guía de recorrido de sus usuarios, que se abría sola según el tiempo y tapaba los botones (como ya hacía `capturas.mjs`).
- **El corredor:** pone la Red antes que Flotas, hace que el owner de Faro sea el admin del seed (como en staging), y mueve WhatsApp al 4090 (el 4080 es de Tango).

### Resultado de la regresión final

(se completa al terminar la corrida)

## Pendientes de terceros

La lista completa, con quién, dónde y cómo se verifica cada uno, está en `docs/pendientes-configuracion.md`. En orden:

1. **Crítico para la reunión con Cristofaro:**
   - SMTP (cPanel de Duplika).
   - IA de la plataforma en Faro Manager (clave de Gemini u otro proveedor, con visión).
   - Staging revisado y demo cargada.
2. **Alto:**
   - Tango real: escritura por API y webhooks con la cuenta del estudio.
   - ARCA: CUIT operadora, certificado de producción, homologación, WSCDC y delegaciones.
   - Mercado Pago de Faro y de cada estudio: credenciales y webhooks.
   - Validaciones del contador: escala de monotributo, plantillas de rubro, tareas que requieren matriculado, umbrales de derivación y dato de §13.
   - Revisión legal de los textos en borrador.
   - Instalar el backup con cron en el VPS.
   - Confirmar la IP real detrás de Traefik.
   - Contenido real de la web (equipo y datos del bloque «Responsable»).
   - WhatsApp de Faro: verificación de Meta, número real y plantillas.
3. **Medio:**
   - Verificación de Google para Gmail.
   - App de Mercado Pago para la Bitácora.
   - Serie del IPC.
   - IA de cada estudio.
   - Empleados.
   - Archivos de Tango y Xubio.
   - Factura de Faro por la suscripción.
   - Agenda pública en la Red.
4. **Bajo:**
   - Dominio e isotipo propios de Faro.
   - Dominio propio y WhatsApp propio de un estudio.
   - Tareas internas y cron externo.
   - Débitos viejos de Inicial.
   - Borrar las ramas remotas viejas desde GitHub.
