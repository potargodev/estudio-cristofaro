# Pendientes de configuración

Lo que falta para que cada módulo funcione con los servicios reales. Cada uno ya funciona contra su simulador en `mocks/`.

## ARCA (F3)

**Qué falta:** certificado digital de la CUIT que opera Faro, en homologación y después en producción, y la homologación de facturación.
**Quién:** el equipo de Faro (owner), con la clave fiscal de la CUIT operadora.
**Paso a paso:**
1. Generar clave privada y CSR (ver la guía `docs/ayuda/facturacion/certificado-homologacion.md`).
2. Pedir el certificado de homologación en WSASS y autorizarlo para `wsfe` y `ws_sr_constancia_inscripcion`.
3. Cargar CUIT, certificado y clave en Faro Manager → Plataforma → ARCA → Homologación y tocar **Probar la conexión**.
4. Con una CUIT propia que delegue el servicio (Administrador de Relaciones), emitir comprobantes de prueba de los tipos A, B, C y notas.
5. Pedir el certificado de producción, cargarlo en Producción y cambiar el ambiente activo.
6. Comunicar a los usuarios la CUIT de Faro para la delegación (aparece en Facturación → Ajustes).

**Escala de monotributo:** la sembrada es la de febrero de 2025, **a validar**. Un contador (Estudio Cristofaro) tiene que cargar la escala vigente en Faro Manager → Catálogo → Monotributo, con su fuente, y marcarla «validada». Las cuotas mensuales (servicios y bienes) quedaron vacías.

**Calendario personal:** las fechas por terminación de CUIT son de referencia; conviene que un contador las revise contra el cronograma oficial del año.

**SMTP:** sin SMTP los mails de comprobantes y avisos no salen (se registran en el log); los comprobantes se pueden compartir por link.

## Bitácora (F8)

### Mercado Pago (conexión de la cuenta personal)
**Qué falta:** una aplicación de Mercado Pago de Faro con OAuth habilitado.
**Quién:** el equipo de Faro (owner), con una cuenta de Mercado Pago de la empresa.
**Paso a paso:**
1. Entrar a https://www.mercadopago.com.ar/developers/panel/app y crear la aplicación «Faro» (producto: pagos online / Checkout Pro; la misma sirve para F7).
2. En la configuración de OAuth, agregar la redirect `https://app.estudiocristofaro.com/api/bitacora/conexiones/mercadopago/callback`.
3. Cargar en Easypanel (servicio `web`) `MP_CLIENT_ID` y `MP_CLIENT_SECRET` (credenciales de producción). No cargar `MERCADOPAGO_API_URL` ni `MERCADOPAGO_AUTH_URL` (son del simulador).
4. Probar con una cuenta propia: Bitácora → Conexiones → Conectar Mercado Pago → Traer movimientos.

### Gmail (lectura de facturas y resúmenes)
**Qué falta:** habilitar la Gmail API en el proyecto de Google Cloud de Faro y pasar la **verificación de Google** para el scope restringido `gmail.readonly` (incluye evaluación de seguridad CASA por un tercero, con costo anual).
**Quién:** el equipo de Faro (owner del proyecto de Google Cloud).
**Paso a paso:**
1. Google Cloud Console → APIs y servicios → habilitar **Gmail API**.
2. Pantalla de consentimiento OAuth: agregar el scope `https://www.googleapis.com/auth/gmail.readonly`, la política de privacidad y el video de uso.
3. Agregar la redirect `https://app.estudiocristofaro.com/api/bitacora/conexiones/gmail/callback` al cliente OAuth existente (usa `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`).
4. Mientras no esté verificada, funciona solo con hasta 100 usuarios de prueba cargados en la pantalla de consentimiento.
5. Enviar a verificación y completar la evaluación CASA.

### Serie del IPC
**Qué falta:** cargar la serie mensual del IPC nivel general del INDEC (y actualizarla cada mes cuando se publica).
**Quién:** el equipo de Faro o el estudio.
**Paso a paso:** Faro Manager → Catálogo → Índices → pegar filas «AAAA-MM;valor» con la fuente. Sin serie, «Ajustado por inflación» muestra pesos corrientes y lo avisa.

### Resumen del domingo
Usa SMTP (pendiente general); sin SMTP queda en la campanita. Las tareas corren cada hora (`BITACORA_JOBS=off` las apaga).

## Lectura inteligente y conciliación (F6)

### Constatación de comprobantes en ARCA (WSCDC)
**Qué falta:** autorizar el servicio `wscdc` (Constatación de Comprobantes) para el certificado de la CUIT operadora de Faro, en homologación y en producción.
**Quién:** el equipo de Faro (owner), con la clave fiscal de la CUIT operadora.
**Paso a paso:**
1. En WSASS (homologación) o en el Administrador de Relaciones (producción), asociar el certificado de Faro al servicio **wscdc**.
2. No hace falta cargar nada nuevo en Faro: usa el mismo certificado de Faro Manager → Plataforma → ARCA.
3. Probar leyendo una factura real: en la revisión tiene que aparecer «CAE: válido · ARCA: autorizado».
Sin esto, la lectura funciona igual y valida el CUIT con el padrón y el CAE solo por formato y vencimiento.

### Modelo de IA con visión
**Qué falta:** un modelo con visión para la tarea «Extracción» (estudios: IA → Proveedores; personas y autónomos: Faro Manager → IA de la plataforma, por ejemplo Gemini Flash o GPT-4o mini) y su precio por millón de tokens para medir el costo.
**Quién:** cada estudio (su proveedor) y el equipo de Faro (la IA de la plataforma).

### Importación en Tango y Xubio
**Qué falta:** probar el archivo «Tango» en el asistente de importación de comprobantes de compras de una instalación real y ajustar el mapeo de columnas si hiciera falta; ídem la planilla en el importador de compras de Xubio.
**Quién:** Estudio Cristofaro (cliente cero) con su Tango.

## Cobros con Mercado Pago (F7)

### Cuenta de Mercado Pago de Faro (suscripciones de los planes) — prioridad alta
**Qué falta:** la aplicación de Mercado Pago de Faro en producción, con suscripciones (preapproval) y webhooks.
**Quién:** el equipo de Faro (owner).
**Paso a paso:**
1. En https://www.mercadopago.com.ar/developers/panel/app crear (o reusar) la aplicación «Faro» y activar las credenciales de producción.
2. En Webhooks configurar `https://app.estudiocristofaro.com/api/mercadopago/webhook?cuenta=faro` con los eventos «Pagos» y «Planes y suscripciones», y copiar la **clave secreta**.
3. En Faro Manager → Plataforma → Mercado Pago pegar el access token de producción y la clave secreta y tocar **Guardar y probar** (o cargar `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` en Easypanel).
4. Hacer una suscripción real de prueba con un tenant propio y verificar en «Últimos webhooks» que llegue «procesado».
5. Definir quién emite la factura de Faro por la suscripción (hoy el cobro no genera factura automática).

### Cuenta de Mercado Pago de cada estudio (honorarios y débitos de flotas)
**Qué falta:** que cada estudio conecte su cuenta.
**Quién:** el dueño de cada estudio (para Estudio Cristofaro, el cliente cero).
**Paso a paso:** Honorarios → Configuración → pegar el access token de su aplicación de Mercado Pago y la clave secreta de webhooks, y en Mercado Pago configurar la URL que muestra la pantalla (`…/api/mercadopago/webhook?cuenta=<id del estudio>`).

### Autónomos que cobran sus facturas
Igual que el estudio, desde Facturación → Ajustes → Cobrar tus facturas con Mercado Pago.

### SMTP
Los cobros, recordatorios y avisos de suscripción salen por mail: sin SMTP solo quedan en la campanita.

## Empleados (F5)

- **Activar el módulo por organización:** el estudio activa «Sueldos y empleados» en la ficha → Plan y módulos para que la organización lo vea en el portal (los empleados ven Mis recibos igual, porque se les publica desde el estudio).
- **Invitar a los empleados al portal** con el rol Empleado (Mi equipo): sin cuenta reciben los avisos por mail, pero para firmar necesitan entrar.
- **Validación legal de la firma:** revisar con el estudio (cliente cero) el texto de conformidad y, si alguna organización lo exige, registrar la plataforma ante la autoridad laboral de su jurisdicción.
- **SMTP:** los avisos de recibos y comunicados salen por mail.

## Flujos (F4)

- **Motor:** corre solo dentro del contenedor cada minuto (`FLOWS_JOBS`, no hace falta nada). Si se prefiere un cron externo, `POST /api/flujos/cron` con `Authorization: Bearer <CRON_SECRET>` (cargar `CRON_SECRET` en Easypanel); `?escaneo=1` también corre los eventos por tiempo.
- **Webhooks entrantes:** la URL de cada flujo aparece al activarlo; compartirla solo con el sistema que la usa (el token es la llave).
- **SMTP** para los mails de los flujos.

## WhatsApp (F9)

### Verificación de Meta y número de Faro — prioridad alta
**Qué falta:** cuenta de WhatsApp Business verificada por Meta, número de teléfono propio de Faro y plantillas aprobadas.
**Quién:** el equipo de Faro (owner), con el Business Manager de la empresa.
**Paso a paso:**
1. En https://business.facebook.com crear (o usar) el portfolio comercial de Faro y completar la **verificación de la empresa** (documentación legal y dominio).
2. En https://developers.facebook.com crear una app tipo «Empresa» y agregarle el producto **WhatsApp**; asociar la cuenta de WhatsApp Business (WABA) y registrar el número de Faro (no puede estar usado en la app de WhatsApp).
3. Crear un **usuario del sistema** con permisos `whatsapp_business_messaging` y `whatsapp_business_management` y generar un **token permanente**.
4. Crear y mandar a aprobar las plantillas (idioma español Argentina `es_AR`): `faro_codigo` (autenticación: «Tu código de Faro es {{1}}. Vence en 10 minutos.»), `faro_respuesta_solicitud` («Hola {{1}}: el estudio respondió tu solicitud «{{2}}». Entrá a tu portal para verla.») y `faro_aviso_general` («Hola {{1}}: {{2}}»), las dos últimas de utilidad.
5. En Faro Manager → Plataforma → WhatsApp cargar Phone number ID, WABA ID, número visible, token y **secreto de la app** (Configuración básica de la app) y tocar **Sincronizar plantillas**.
6. En la app de Meta → WhatsApp → Configuración: webhook `https://app.estudiocristofaro.com/api/whatsapp/webhook` con el token de verificación que muestra Faro Manager, suscripto a `messages`.
7. En Easypanel: `WHATSAPP_API_URL=https://graph.facebook.com/v21.0` (es el valor por defecto; en pruebas apunta al simulador).
8. Probar con un número propio: verificar desde el portal (Mi cuenta → WhatsApp), mandar un texto y una foto.

### Número propio de un estudio
**Quién:** el dueño del estudio (plan Avanzado). Los mismos pasos 1 a 4 en su propio Business Manager y la carga en Configuración → Avanzado → WhatsApp (el webhook y el token de verificación aparecen ahí).

## Marca blanca (F9)

### Dominio propio de cada estudio
**Qué falta:** que la app atienda el dominio del estudio con HTTPS.
**Quién:** el equipo de Faro, cuando un estudio verifica su dominio.
**Paso a paso:**
1. En Easypanel cargar `APP_HOSTS` con los hosts propios de la app separados por coma (`app.estudiocristofaro.com,estudiocristofaro.com,www.estudiocristofaro.com`). Sin esta variable, el ruteo por dominio propio queda apagado (la marca se ve igual en el portal).
2. Cuando el estudio vea «Verificado» en Configuración → Avanzado, agregar su dominio al servicio `web` en Easypanel (Domains) para que emita el certificado de Let's Encrypt.
3. Probar `https://<dominio>/`: tiene que mostrar el ingreso al portal con la marca del estudio y «Con tecnología de Faro».

**Mejora futura:** sesión completa en el dominio propio (hoy el cliente pide el enlace ahí y entra al portal en el dominio de Faro) y Google desde ese dominio (requiere una redirect por dominio en Google Cloud).

## Consultas con IA e Indicadores (F9)

- **Modelo de redacción:** cada estudio elige en Configuración → IA el modelo de la tarea «Redacción de borradores»; si no tiene proveedor, se usa la IA de la plataforma (Faro Manager → Catálogo → IA), que hay que configurar en producción.
- **Revisión de los textos:** conviene que un contador del estudio cliente cero revise las primeras respuestas aprobadas para ajustar el prompt (`src/modules/ai-consults/core.ts`).
- **Indicadores:** no requieren configuración; las ventas de una organización salen de lo facturado en ARCA desde Faro, así que conviene importar lo que facture por otro sistema.

## Red de estudios (F9)

- **Agenda pública:** para que aparezca «Agendar llamada» con horarios, el estudio tiene que activar su disponibilidad pública en Comercial → Agenda; si no, la ficha ofrece pedir propuesta.

## Escudo de responsabilidad (principios §1.b y §1.c)

**Qué falta:** que un contador matriculado valide la lista de tareas que requieren un matriculado y los umbrales del disparador de derivación (80 % del tope, primer empleado, comprobantes E, actividades, monto de la changa).
**Quién:** Estudio Cristofaro (cliente cero), con el owner de Faro.
**Paso a paso:** Faro Manager → Catálogo → **Escudo**. Revisar cada tarea (título y frases que la identifican) y cada regla (texto y umbral), y marcarlas «Validada por un contador» con nombre y matrícula. Hasta entonces se muestran «a validar».

## Conexión con un contador (principios §4 a §9)

**Qué falta:** revisar con un abogado y con Estudio Cristofaro el texto de las políticas que la persona acepta al conectar (`/legal/terminos` y el resumen de la pantalla del acuerdo) y el modelo de acuerdo de servicio (versión `conexion-2026-10`). Hasta entonces el acuerdo usa las condiciones que carga cada estudio (servicios, honorarios y preaviso).
**Quién:** owner de Faro con asesoría legal.

## Tango en los dos sentidos (principios §14)

**Qué falta:** probar el motor con una cuenta real de Tango. Hoy se probó contra el simulador `mocks/tango/server.mjs` (`node mocks/tango/server.mjs`, puerto 4080), que imita la API Delta (headers `ApiAuthorization` y `Company`, `?process=20412`). Validar con Axoft o el partner del estudio:
- **Qué se puede escribir por la API:** si `Create`/`Update` del proceso 20412 (comprobantes de venta) existen en la versión del estudio, qué campos son obligatorios (talonario, condición de venta, alícuotas, código de cliente en vez de razón social) y si se puede escribir un comprobante con CAE ya otorgado sin que Tango lo vuelva a numerar. Ajustar `toTango()` y `fieldsOf()` en `src/modules/tango-sync/server.ts` al formato real.
- **Webhooks:** si la versión del estudio (Delta local o Tango en la nube) los ofrece, cómo se registran, cómo firma (el simulador usa `X-Tango-Signature: sha256=<HMAC del cuerpo>`) y qué eventos manda. Si no hay webhooks, queda el sondeo cada 15 minutos (`TANGO_JOBS_MS`), que necesita algún filtro «modificado desde» en `/Api/Get` (el simulador usa `desde=<ISO>`).
- **Costo:** si la API (y la escritura) tiene costo de licencia o por llamada en el abono del estudio.
- **Local vs nube:** con Tango Delta local la API vive en la red del estudio y la plataforma no entra a esa red; para escribir hace falta exponerla por HTTPS (túnel o publicación) o sumar la escritura al conector local, que hoy solo lee. Con Tango en la nube alcanza la URL pública.
- Variables: `TANGO_JOBS=off` apaga la tarea periódica; `ENCRYPTION_KEY` cifra el token y el secreto (no cambiarla).
**Quién:** Estudio Cristofaro (cliente cero) con su partner de Tango.

