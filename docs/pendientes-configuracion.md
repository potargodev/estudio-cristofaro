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
