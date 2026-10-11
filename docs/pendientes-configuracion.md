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
