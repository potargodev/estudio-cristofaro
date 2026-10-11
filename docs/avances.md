# Avances

Resumen de cada fase al cerrarla: qué quedó, qué se probó y qué falta configurar. El detalle de lo pendiente está en `docs/pendientes-configuracion.md` y las decisiones en `docs/decisiones.md`.

## F3 · ARCA + Faro Personal (octubre 2026)

**Qué quedó**
- Cliente de ARCA por web services oficiales (`src/modules/arca`): WSAA con TRA firmado como CMS y ticket cacheado, WSFEv1 (FEDummy, FECompUltimoAutorizado, FECAESolicitar, FECompConsultar, FEParamGet*) y constancia de inscripción (getPersona_v2), con homologación y producción configurables.
- Simulador completo en `mocks/arca` (valida numeración, totales, IVA por letra, comprobante asociado, delegación y corte de red).
- Faro Manager: Plataforma → **ARCA** (certificado y clave cifrados por ambiente, ambiente activo y prueba de conexión) y Catálogo → **Monotributo** (escalas versionadas por vigencia).
- Personal → **Facturación** (autónomos): Comprobantes, Clientes y productos, Mi situación, Monotributo, Calendario, Chequeos y Ajustes. En el estudio, pestaña **ARCA** de la ficha de organización.
- Comprobantes A, B, C y E y notas de crédito y débito asociadas, puntos de venta traídos de ARCA, clientes y productos frecuentes, emisión idempotente con recuperación de CAE, PDF con logo, color, contacto, CAE y QR, envío por mail y link revocable.
- Semáforo de monotributo (12 meses, colores, recategorización enero/julio, exclusión, simulación de responsable inscripto), calendario personal con avisos por mail y campanita, y chequeos guiados con recordatorio.
- Límite de 10 comprobantes por mes en Gratis; Pro sin límite.
- Vigía: `preparar_factura` (sensible, va a Aprobaciones y emite al aprobar), `listar_comprobantes`, `situacion_monotributo`, `situacion_arca`.
- Auditoría de cada borrador, emisión, envío, link, consulta y cambio de configuración. Datos de ARCA con fuente, fecha, ID externo, validación y registro original.
- Ayuda: seis artículos nuevos en `docs/ayuda/facturacion`.

**Qué se probó**
- `npm test`: cálculos de totales e IVA, letras, CUIT, QR, semáforo, recategorización, simulación y calendario.
- `scripts/pruebas/arca-cliente.mts` (13/13): WSAA real con CMS, caché del ticket, CAE, rechazos, recuperación tras corte y constancia.
- `scripts/pruebas/arca-navegador.mjs` (18/18): flujo completo en el navegador (390 px), PDF, link público y revocación, nota de crédito, semáforo, calendario, aislamiento forzando IDs y límite del plan.
- `scripts/pruebas/arca-vigia.mts` (8/8): propuesta en Aprobaciones, emisión al aprobar y aislamiento entre estudios.

**Qué falta configurar**
- Certificado de homologación y de producción de la CUIT operadora, y validar la escala de monotributo vigente (ver pendientes).
