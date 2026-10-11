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
