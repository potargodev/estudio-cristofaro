# Pendientes de configuración

Todo lo que falta para que Faro funcione con los servicios reales, en **una sola lista ordenada por prioridad**. Lo construido ya funciona contra los simuladores de `mocks/` (ver `docs/avances.md`). Cada ítem dice qué falta, quién lo hace (**Cristofaro**, **Faro** o un **proveedor**), dónde se carga y cómo se verifica.

Actualizado el 12 de octubre de 2026.

| Prioridad | Ítems |
|---|---|
| **Crítico para la reunión con Cristofaro** | 1 SMTP · 2 IA de la plataforma · 3 Staging revisado y demo cargada |
| **Alto** | 4 Tango real · 5 ARCA · 6 Mercado Pago de Faro · 7 Mercado Pago del estudio · 8 Validaciones del contador · 9 Revisión legal · 10 Backup en el VPS · 11 IP real detrás del proxy · 12 Contenido real de la web · 13 WhatsApp de Faro |
| **Medio** | 14 Verificación de Google · 15 Mercado Pago para la Bitácora · 16 Serie del IPC · 17 IA de cada estudio · 18 Empleados · 19 Archivos de Tango y Xubio · 20 Factura de Faro por la suscripción · 21 Agenda pública en la Red |
| **Bajo** | 22 Dominio e isotipo de Faro · 23 Dominio propio de un estudio · 24 WhatsApp propio de un estudio · 25 Tareas internas y cron externo · 26 Débitos viejos de Inicial · 27 Ramas remotas viejas |

---

## Crítico para la reunión con Cristofaro

### 1. SMTP (mails de la plataforma)
- **Qué falta:** configurar el envío de mails. Sin SMTP los mails **no salen: solo se registran en el log** (`[mail] SMTP sin configurar: no se envió…`). Afecta enlaces de ingreso, invitaciones, avisos de vencimientos, comprobantes, recibos, cobros, flujos, la agenda y el resumen del domingo. En la app (campanita) los avisos llegan igual.
- **Quién:** Cristofaro da la casilla y su contraseña (el mail del dominio está en el cPanel de **Duplika**); Faro la carga.
- **Dónde:** crear la casilla (por ejemplo `avisos@estudiocristofaro.com`) en el cPanel de Duplika. En Easypanel, servicio `web`: `SMTP_HOST=mail.estudiocristofaro.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM` (la misma casilla que `SMTP_USER`, por ejemplo `Faro <avisos@estudiocristofaro.com>`). Revisar SPF y DKIM del dominio en el cPanel para que no caigan en spam.
- **Cómo se verifica:** pedir un enlace en `/ingresar` con un mail con acceso: tiene que llegar en un minuto y el log de `web` ya no muestra «SMTP sin configurar». Probar también una invitación al portal y que no caiga en spam en Gmail.

### 2. IA de la plataforma (clave de Gemini u otro proveedor)
- **Qué falta:** la clave y el modelo de la IA que Faro pone para personas y autónomos (Vigía personal, lectura de tickets, audio, coach) y para los estudios que no cargaron la suya (borradores de Consultas con IA). Tiene que tener un modelo **con visión** para la tarea «Extracción» y su precio por millón de tokens para medir el costo.
- **Quién:** Faro (owner), con una cuenta del proveedor (por ejemplo Google AI Studio para Gemini Flash).
- **Dónde:** Faro Manager → Catálogo → **IA de la plataforma** (proveedor, clave, modelo por tarea, audio nativo de Gemini o transcripción, precios).
- **Cómo se verifica:** con un usuario personal, mandarle al Vigía «gasté 3500 en el kiosco» y un audio; leer la foto de un ticket en Bitácora → Importar → Tickets; ver el costo en Faro Manager → Plataforma → Uso y costos de IA.

### 3. Staging revisado y demo cargada
- **Qué falta:** recorrer staging de punta a punta antes de mostrarlo y cargar la demo para la reunión (los datos reales de Cristofaro no se tocan).
- **Quién:** Faro.
- **Dónde:** Faro Manager → Plataforma → **Demo** → Cargar la demo (o `node dist/demo.mjs seed` en la consola de `web`). Guardar las contraseñas: se muestran una sola vez. Desde ahí, **Ver como…** entra como cualquier usuario de la demo sin contraseña (solo `faro_owner` con 2FA).
- **Cómo se verifica:** `GET /api/health` responde bien; la franja «Demostración» aparece en los seis perfiles; «Ver como…» muestra la franja «Viendo como…» y «Volver a mi usuario» devuelve a la cuenta propia; las dos cosas quedan en Faro Manager → Plataforma → Auditoría. Ver `docs/demo.md`.

## Alto

### 4. Tango real del estudio
- **Qué falta:** probar con la cuenta real de Tango de Cristofaro lo que hoy funciona contra `mocks/tango/server.mjs`. Es el paso 2 del primer paso al mercado (principios §21). Validar con Axoft o el partner del estudio:
  - **Escritura por API:** si `Create`/`Update` del proceso 20412 (comprobantes de venta) existen en su versión, qué campos son obligatorios (talonario, condición de venta, alícuotas, código de cliente) y si acepta un comprobante con CAE ya otorgado sin renumerarlo. Ajustar `toTango()` y `fieldsOf()` en `src/modules/tango-sync/server.ts`.
  - **Webhooks:** si su versión los ofrece, cómo se registran, cómo firma (el simulador usa `X-Tango-Signature: sha256=<HMAC>`) y qué eventos manda. Si no hay, queda el sondeo cada 15 minutos, que necesita un filtro «modificado desde» en `/Api/Get`.
  - **Costo** de la API y de la escritura en su abono.
  - **Local o nube:** con Tango Delta local la API vive en la red del estudio; para escribir hay que exponerla por HTTPS o sumar la escritura al conector local (hoy solo lee).
- **Quién:** Cristofaro con su partner de Tango; Faro ajusta el código.
- **Dónde:** Configuración → Conexiones → Tango (conector local) y Tango → **Tango en los dos sentidos** (URL, empresa, token y secreto).
- **Cómo se verifica:** una factura autorizada en Faro aparece en Tango con el nombre estándar y sin duplicar; un comprobante cargado en Tango llega a Faro (webhook o sondeo) con origen e ID externo; una diferencia queda «en conflicto» para que decida una persona.

### 5. ARCA (facturación, padrón y constatación)
- **Qué falta:** la **CUIT de la empresa que opera Faro**, su certificado de homologación y de producción, la **homologación** de facturación, autorizar **WSCDC** y que cada usuario **delegue** el servicio a esa CUIT.
- **Quién:** Faro (owner) con la clave fiscal de la CUIT operadora; cada autónomo o estudio hace su delegación.
- **Paso a paso:**
  1. Generar clave privada y CSR (guía `docs/ayuda/facturacion/certificado-homologacion.md`).
  2. Pedir el certificado de homologación en WSASS y autorizarlo para `wsfe`, `ws_sr_constancia_inscripcion` y `wscdc`.
  3. Cargar CUIT, certificado y clave en Faro Manager → Plataforma → **ARCA** → Homologación y tocar **Probar la conexión**.
  4. Con una CUIT propia que delegue el servicio (Administrador de Relaciones), emitir comprobantes de prueba A, B, C y notas.
  5. Pedir el certificado de producción, asociarlo a `wsfe`, padrón y `wscdc`, cargarlo en Producción y cambiar el ambiente activo.
  6. Comunicar la CUIT de Faro para la delegación (aparece en Facturación → Ajustes).
- **Cómo se verifica:** «Probar la conexión» en verde; una factura real con CAE y QR; al leer una factura recibida, la revisión dice «CAE: válido · ARCA: autorizado». Sin WSCDC la lectura funciona igual, pero valida el CAE solo por formato y vencimiento.

### 6. Mercado Pago de Faro (suscripciones de los planes)
- **Qué falta:** la aplicación «Faro» en producción, con suscripciones (preapproval) y webhooks.
- **Quién:** Faro (owner), con la cuenta de Mercado Pago de la empresa.
- **Paso a paso:**
  1. En https://www.mercadopago.com.ar/developers/panel/app crear la aplicación «Faro» (sirve también para el ítem 15) y activar las credenciales de producción.
  2. En Webhooks, `https://app.estudiocristofaro.com/api/mercadopago/webhook?cuenta=faro` con los eventos «Pagos» y «Planes y suscripciones»; copiar la clave secreta.
  3. En Faro Manager → Plataforma → **Mercado Pago**, pegar el access token y la clave secreta y tocar **Guardar y probar** (o `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` en Easypanel).
- **Cómo se verifica:** una suscripción real de prueba con un tenant propio; en «Últimos webhooks» el evento llega «procesado» y el tenant pasa al plan pago. Mientras no esté, el botón de los planes es «Quiero mejorar mi plan».

### 7. Mercado Pago de cada estudio (honorarios y débitos de Flotas)
- **Qué falta:** que cada estudio conecte su cuenta. Primero, Estudio Cristofaro. Lo mismo vale para los autónomos que cobran sus facturas.
- **Quién:** el dueño de cada estudio (Cristofaro); cada autónomo.
- **Dónde:** Honorarios → Configuración (access token y clave secreta de webhooks; la URL que muestra la pantalla va en los webhooks de su aplicación de Mercado Pago). Autónomos: Facturación → Ajustes → Cobrar tus facturas con Mercado Pago.
- **Cómo se verifica:** mandar un cobro de honorarios a una organización propia, pagarlo desde el portal (Empresa → Estado de cuenta) y verlo marcado pagado.

### 8. Validaciones del contador
- **Qué falta:** que un contador matriculado (Estudio Cristofaro, cliente cero) valide lo que hoy se muestra «a validar»:
  - **Escala de monotributo:** la sembrada es la de febrero de 2025; cargar la vigente con su fuente y las cuotas mensuales (hoy vacías). Faro Manager → Catálogo → **Monotributo**.
  - **Plantillas de rubro:** contenido técnico (alícuotas, convenios, regímenes) y marcarlas validadas. Faro Manager → Catálogo → **Plantillas**.
  - **Tareas que requieren matriculado** (principios §1.b) y **umbrales de derivación** (§1.c: 80 % del tope, primer empleado, comprobantes E, varias actividades, monto de la changa). Faro Manager → Catálogo → **Escudo**, con nombre y matrícula.
  - **Dato de contexto de §13** (relación de dependencia + monotributo) y el texto de la changa. También en Escudo.
  - **Calendario personal:** fechas por terminación de CUIT contra el cronograma oficial del año.
  - **Consultas con IA:** revisar las primeras respuestas aprobadas para ajustar el prompt (`src/modules/ai-consults/core.ts`).
- **Quién:** Cristofaro, con Faro.
- **Cómo se verifica:** en cada pantalla el rótulo pasa de «a validar» a «Validada por un contador» con nombre y matrícula; el semáforo usa la escala nueva.

### 9. Revisión legal de los textos en borrador
- **Qué falta:** que un abogado (y Cristofaro) revise `docs/legal/terminos.md`, `privacidad.md`, `flotas.md` y `red-de-estudios.md` (todos «borrador»), las políticas que la persona acepta al conectar un contador y el modelo de acuerdo (versión `conexion-2026-10`), el texto de conformidad de los recibos (y si alguna organización exige registrar la plataforma ante la autoridad laboral) y el escudo de responsabilidad. Los textos legales todavía dicen «Red de estudios»: pasar a «Red Contable».
- **Quién:** Faro (owner) con asesoría legal; Cristofaro.
- **Cómo se verifica:** la versión de cada texto deja de decir «borrador» y `/legal/terminos` muestra la final.

### 10. Backup en el VPS
- **Qué falta:** instalar los scripts de `scripts/backup/` con cron en el VPS `srv1983285` y una copia fuera del servidor. La restauración se probó en local; el backup de Easypanel a S3 no incluye `/data/uploads`.
- **Quién:** Faro.
- **Dónde:** VPS de Hostinger, siguiendo `docs/backup.md` (`/etc/faro-backup.env`, cron diario a las 3:17 y `rclone` o el backup de Hostinger).
- **Cómo se verifica:** `sudo /opt/faro-backup/backup.sh` termina con `[backup] … base, … archivos`; al otro día hay un par nuevo en `/var/backups/faro`; repetir la prueba de restauración en el VPS y una vez por trimestre.

### 11. IP real detrás del proxy (X-Forwarded-For)
- **Qué falta:** confirmar que Traefik (Easypanel) **reemplaza** el `X-Forwarded-For` que manda el cliente en vez de sumarle uno. Los límites por IP (ingreso, webhooks, formularios) y la auditoría toman el primer valor de ese header: si el proxy deja pasar el del cliente, alguien puede saltarse los límites inventando una IP.
- **Quién:** Faro.
- **Dónde:** configuración de Traefik en Easypanel (`forwardedHeaders` / `trustedIPs` del entrypoint).
- **Cómo se verifica:** `curl -H "X-Forwarded-For: 1.2.3.4" https://app.estudiocristofaro.com/...` sobre una acción auditada: en Faro Manager → Plataforma → Auditoría tiene que figurar la IP real, no `1.2.3.4`.

### 12. Contenido real de la web de Cristofaro
- **Qué falta:** el equipo real (`src/lib/content.ts` tiene tres «Nombre Apellido» con matrícula y bio para completar), los datos del bloque **Responsable** de la home (`src/lib/home.ts`: 25 años y 180 empresas, a confirmar) y los precios de los planes del estudio (sin precio muestra «Consultá el precio»).
- **Quién:** Cristofaro da los datos; Faro los carga.
- **Dónde:** el equipo y los números, en esos archivos; los precios, en Configuración → Sitio web → Planes.
- **Cómo se verifica:** estudiocristofaro.com sin «Nombre Apellido» ni «Completar con…».

### 13. WhatsApp de Faro (Meta)
- **Qué falta:** cuenta de WhatsApp Business **verificada por Meta**, el **número real** de Faro y las **plantillas** aprobadas. Meta tarda: conviene arrancarla ya.
- **Quién:** Faro (owner), con el Business Manager de la empresa; Meta aprueba.
- **Paso a paso:**
  1. En https://business.facebook.com, completar la verificación de la empresa (documentación legal y dominio).
  2. En https://developers.facebook.com, app tipo «Empresa» con el producto WhatsApp; asociar la WABA y registrar el número (no puede estar usado en la app de WhatsApp).
  3. Usuario del sistema con `whatsapp_business_messaging` y `whatsapp_business_management` y token permanente.
  4. Plantillas en `es_AR`: `faro_codigo` (autenticación: «Tu código de Faro es {{1}}. Vence en 10 minutos.»), `faro_respuesta_solicitud` («Hola {{1}}: el estudio respondió tu solicitud «{{2}}». Entrá a tu portal para verla.») y `faro_aviso_general` («Hola {{1}}: {{2}}»).
  5. Faro Manager → Plataforma → **WhatsApp**: Phone number ID, WABA ID, número, token y secreto de la app; **Sincronizar plantillas**.
  6. Webhook `https://app.estudiocristofaro.com/api/whatsapp/webhook` con el token de verificación que muestra Faro Manager, suscripto a `messages`. `WHATSAPP_API_URL=https://graph.facebook.com/v21.0` (valor por defecto).
- **Cómo se verifica:** verificar un número propio desde el portal (Mi cuenta → WhatsApp), mandar un texto (crea una solicitud) y una foto (entra a Documentos o Lectura inteligente).

## Medio

### 14. Verificación de la app de Google
- **Qué falta:** el ingreso con Google ya está cargado (`GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, redirect `/api/auth/callback/google`). Falta la **verificación de Google** para los permisos que piden más que el ingreso:
  - **Gmail** (Bitácora Plus): scope restringido `gmail.readonly`, con evaluación de seguridad CASA de un tercero (costo anual). Habilitar la Gmail API y sumar la redirect `/api/bitacora/conexiones/gmail/callback`.
  - **Calendar** (Comercial → Agenda): `calendar.events` y `calendar.freebusy` (sensibles), redirect `/api/agenda/google/callback`.
  - **Drive** (conector en beta): scope `drive` (restringido), redirect `/api/conexiones/google-drive/callback`.
- **Quién:** Faro (owner del proyecto de Google Cloud); Google verifica.
- **Dónde:** Google Cloud Console → pantalla de consentimiento (scopes, política de privacidad, video de uso) y el cliente OAuth existente.
- **Cómo se verifica:** sin verificación, cada uno funciona solo con hasta 100 usuarios de prueba y con el aviso de «app no verificada». Verificada, una cuenta cualquiera conecta Gmail y aparecen propuestas en «Para confirmar».

### 15. Mercado Pago para la Bitácora (OAuth)
- **Qué falta:** OAuth en la aplicación «Faro» de Mercado Pago para que una persona conecte su cuenta (solo lectura).
- **Quién:** Faro (owner).
- **Dónde:** en la aplicación, redirect `https://app.estudiocristofaro.com/api/bitacora/conexiones/mercadopago/callback`; en Easypanel, `MP_CLIENT_ID` y `MP_CLIENT_SECRET` de producción (no cargar `MERCADOPAGO_API_URL` ni `MERCADOPAGO_AUTH_URL`, que son del simulador).
- **Cómo se verifica:** Bitácora → Conexiones → Conectar Mercado Pago → Traer movimientos, sin duplicar.

### 16. Serie del IPC
- **Qué falta:** la serie mensual del IPC nivel general del INDEC, y actualizarla cada mes.
- **Quién:** Faro (o el estudio).
- **Dónde:** Faro Manager → Catálogo → **Índices** (filas «AAAA-MM;valor» con la fuente).
- **Cómo se verifica:** «Ajustado por inflación» en la Bitácora deja de avisar que muestra pesos corrientes; los abonos con ajuste por IPC usan el último valor.

### 17. IA de cada estudio
- **Qué falta:** que cada estudio cargue su proveedor y elija los modelos de «Extracción» (con visión), «Redacción de borradores» y «Agente contable» (un modelo potente para planificar y analizar: las tareas libres del Agente lo necesitan; las tareas del catálogo funcionan sin modelo). Si no lo hace, se usa la IA de la plataforma (ítem 2), salvo para el Agente del estudio, que usa la clave del estudio. Para personas y autónomos, el modelo del Agente se elige en Faro Manager → Catálogo → IA → «Modelo del Agente contable».
- **Quién:** el dueño de cada estudio (Cristofaro primero).
- **Dónde:** Configuración → **IA** (proveedor, clave cifrada, modelo por tarea y límite de gasto).
- **Cómo se verifica:** «Probar la conexión» en verde y el gasto en la pestaña Uso.

### 18. Empleados y recibos
- **Qué falta:** activar «Sueldos y empleados» en cada organización que lo use e invitar a sus empleados con el rol Empleado (sin cuenta reciben los avisos, pero para firmar tienen que entrar).
- **Quién:** el estudio y cada organización.
- **Dónde:** ficha de la organización → Resumen → Plan y módulos; Miembros del portal.
- **Cómo se verifica:** el empleado ve sus recibos en Mis recibos y puede firmarlos; la organización ve la tarjeta Sueldos en su Inicio.

### 19. Archivos de Tango y Xubio
- **Qué falta:** probar el archivo «Tango» de la Lectura inteligente en el asistente de importación de compras de una instalación real, y la planilla en el importador de Xubio; ajustar el mapeo si hace falta.
- **Quién:** Cristofaro con su Tango (y Xubio si lo usa).
- **Cómo se verifica:** la importación entra sin errores ni columnas corridas.

### 20. Factura de Faro por la suscripción
- **Qué falta:** definir quién emite la factura de Faro cuando cobra un plan (hoy el cobro no genera factura automática).
- **Quién:** Faro (owner), con su contador.
- **Cómo se verifica:** cada pago de suscripción tiene su factura.

### 21. Agenda pública en la Red Contable
- **Qué falta:** que cada estudio active su disponibilidad pública para que su ficha ofrezca «Agendar llamada» (si no, ofrece pedir propuesta).
- **Quién:** cada estudio.
- **Dónde:** Comercial → Agenda.
- **Cómo se verifica:** la ficha pública en `/red-contable/<estudio>` muestra horarios.

## Bajo

### 22. Dominio e isotipo propios de Faro
- **Qué falta:** elegir el dominio de Faro (por ejemplo faro + .app o .com.ar) con la landing en la raíz y la app en `app.<dominio>`, y un isotipo propio antes de vender a otros estudios (hoy el logo lleva el sello de Estudio Cristofaro).
- **Quién:** Faro decide; un diseñador hace el isotipo.
- **Dónde:** el dominio en el registrador y en Easypanel (Domains), con `FARO_HOSTS` en el servicio `web` (el ruteo por host ya está; Google OAuth necesita la redirect nueva).
- **Cómo se verifica:** el dominio nuevo muestra la landing de Faro en `/` y la app entra con Google.

### 23. Dominio propio de un estudio (marca blanca)
- **Qué falta:** cuando un estudio en Avanzado verifica su dominio, que la app lo atienda con HTTPS.
- **Quién:** Faro.
- **Dónde:** Easypanel: `APP_HOSTS` con los hosts propios de la app separados por coma (`app.estudiocristofaro.com,estudiocristofaro.com,www.estudiocristofaro.com`) y el dominio del estudio en Domains del servicio `web` (Let's Encrypt).
- **Cómo se verifica:** `https://<dominio>/` muestra el ingreso al portal con la marca del estudio y «Con tecnología de Faro». Mejora futura: sesión completa en el dominio propio y Google desde ese dominio.

### 24. WhatsApp propio de un estudio
- **Quién:** el dueño del estudio (plan Avanzado), con los pasos 1 a 4 del ítem 13 en su Business Manager.
- **Dónde:** Configuración → Avanzado → WhatsApp (ahí aparecen el webhook y el token de verificación).

### 25. Tareas internas y cron externo
- **Qué falta:** nada para que anden: corren solas dentro del contenedor con un turno en la base (una sola instancia a la vez). Opcional: `CRON_SECRET` para un cron externo (`POST /api/flujos/cron` con `Authorization: Bearer <CRON_SECRET>`), `JOBS=off` en una réplica que solo atienda pedidos o `<TAREA>_JOBS=off` para apagar una (`GASTOS_JOBS`, `COPILOT_JOBS`, `ARCA_JOBS`, `BITACORA_JOBS`, `COBROS_JOBS`, `FLOWS_JOBS`, `TANGO_JOBS`). `ENCRYPTION_KEY` cifra tokens y credenciales: no cambiarla.
- **Quién:** Faro, solo si se agregan réplicas.

### 26. Débitos viejos del plan Inicial
- **Qué falta:** con la cuenta real de Mercado Pago, revisar que no quedó ningún débito de Inicial (que ahora es gratis).
- **Quién:** Faro.
- **Dónde:** Faro Manager → Plataforma → Auditoría (`suscripcion.plan_gratis`, con `debito_pendiente_de_cancelar` en false).

### 27. Ramas remotas viejas en GitHub
- **Qué falta:** borrar `claude/dreamy-pascal-arlb5c`, `claude/epic-cerf-qe07jc`, `claude/faro-ia-mcp-conexiones-7v36d1`, `claude/funny-carson-ynqn4h` y `claudev/modest-dirac-yc6flk`. Su contenido útil ya está en `main` (`docs/decisiones.md`); la sesión de trabajo no tiene permiso para borrar ramas.
- **Quién:** Faro (owner del repo).
- **Dónde:** GitHub → Branches.
- **Cómo se verifica:** solo queda `main` (y las ramas de trabajo activas).
