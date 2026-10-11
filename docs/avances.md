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

## F8 · Bitácora completa (octubre 2026)

**Qué quedó**
- Pestañas de la sección Bitácora (espacio Personal, §2.o): Movimientos · Sobres · Fijos · Metas · Importar · Conexiones · Hogar.
- **Sobres** por categoría con sugerencia por la mediana de los meses anteriores; **fijos y suscripciones** detectados por recurrencia (confirmar, descartar, «la uso / no la uso», alta manual) con aviso antes del vencimiento y de aumentos; **fugas** (gastos chicos y frecuentes, crecimiento contra el promedio); **metas** con ahorro semanal sugerido.
- **Valores reales**: ver el mes en pesos, ajustado por IPC (serie en Faro Manager → Catálogo → Índices) o en dólares MEP (cotización guardada a diario).
- **Resumen semanal** cada domingo (campanita y mail), con interruptor en Fijos; avisos descartables en Bitácora y en el Inicio personal.
- **Importación** de CSV y PDF con texto (y CSV de Mercado Pago) con vista previa, mapeo de columnas, duplicados marcados, categoría por comercio y «Deshacer» por lote.
- **Conexiones (Plus)**: Mercado Pago por OAuth (solo lectura, carga pagos y cobros sin duplicar) y Gmail solo lectura (propone servicios, suscripciones y resúmenes en «Para confirmar»). Tokens cifrados; simuladores en `mocks/mercadopago` (4070) y `mocks/google` (4030).
- **Coach** en el Vigía (`coach_finanzas`) con sus números reales, sin recomendaciones de inversión (CNV) y derivación a la Red con el servicio «Asesoramiento financiero».
- **Hogar**: compartir la Bitácora con otra persona (ver o ver y cargar), revocable por las dos y auditado.
- **Autónomos**: marcar un gasto como de la actividad y deducible y pasarlo a Faro Personal.
- **Planes**: Gratis (1 meta, 2 importaciones por mes) y Plus (planes pagos: sin límite y con conexiones).
- Todo movimiento importado o conectado guarda fuente, fecha de sincronización, ID externo, estado de validación y registro original. Módulo actualizado en el registro (eventos y herramientas). Cuatro artículos de ayuda nuevos y el de Bitácora actualizado.

**Qué se probó**
- `npm test` (52): detección de fijos, fugas, sobres sugeridos, ahorro semanal, valor real, CSV/PDF/Mercado Pago, mapeo y mails.
- `scripts/pruebas/bitacora-navegador.mjs` (44/44, 390 px): todo el recorrido con los simuladores, límites de Gratis, Plus, propuestas, profesional → Faro Personal, hogar con aislamiento y auditoría, e IDs forzados (importación, movimiento e invitación ajenos → 404).
- `scripts/pruebas/bitacora-servidor.mts` (15/15): cada función que recibe un ID del navegador probada con el usuario equivocado, y el resumen semanal.

**Qué falta configurar**
- Aplicación de Mercado Pago, verificación de Google para Gmail y la serie del IPC (ver pendientes).

## F6 · Lectura inteligente y conciliación bancaria (octubre 2026)

**Qué quedó**
- **Lectura inteligente** (`smart_docs`, `src/modules/smart-docs`): PDF y fotos leídos con un modelo con visión (el del estudio o la IA de la plataforma) con salida tipada y validada (CUIT, razón social, tipo, punto de venta y número, fecha, neto, no gravado, exento, IVA por alícuota, percepciones, total, CAE y vencimiento) y confianza por campo.
- Validaciones: dígito verificador del CUIT, formato y vigencia del CAE, suma de importes y, con el certificado de Faro, padrón y **constatación del CAE por WSCDC** (cliente nuevo en `src/modules/arca/wscdc.ts` y en el simulador).
- Bandeja **Para confirmar** con campos de baja confianza marcados, correcciones, cuenta sugerida por CUIT, aviso de **repetido** (huella o mismo archivo, que no vuelve a la IA) y confirmación que crea el gasto (organización o actividad) o el movimiento de Bitácora.
- Ubicaciones según §2.o: ficha → Documentos → Lectura inteligente (y «Leer con IA» en cada documento), Facturación → Recibidos (autónomo) y Bitácora → Importar → Tickets.
- **Exportación**: CSV, XLSX con una hoja por cuenta, archivo para Tango y planilla para Xubio. Descarga del archivo por ruta autenticada con alcance.
- **Límite por plan** (`smartDocsPerMonth` ahora se cuenta de verdad, también en Plan y facturación) y **costo de IA** por documento y del mes.
- **Conciliación bancaria** (`bank_rec`, `src/modules/bank-rec`): pestaña Conciliación de la ficha (dueños y contadores, Avanzado). Importa extractos CSV/PDF sin duplicar, clasifica (cobro, pago, comisión, impuesto, transferencia propia), sugiere cruces con facturas emitidas y comprobantes confirmados con puntaje y motivos, confirmación, «cruzar con otro», «sin factura», «ignorar», «deshacer», reglas guardables (por organización o para todo el estudio) y resumen: pagadas, pendientes, en tránsito, pagos sin factura, comisiones e impuestos.
- Vigía: `leer_comprobante` (escritura, deja para confirmar), `comprobantes_para_confirmar` y `estado_conciliacion` (lectura). Módulos `smart_docs` y `bank_rec` disponibles en el registro con eventos, herramientas y límites. Auditoría de cada lectura, confirmación, descarte, descarga, exportación, importación, conciliación y regla. Dos artículos de ayuda nuevos.

**Qué se probó**
- `npm test` (61): núcleo de lectura (esquema, validaciones, huella, cuentas, exportaciones) y de conciliación (clasificación, reglas, puntaje, sugerencias, resumen).
- `scripts/pruebas/lectura-navegador.mjs` (50/50, 390 px) contra los simuladores de IA y ARCA: lectura, validación ARCA, repetidos, mismo archivo sin IA, datos dudosos corregidos, archivo ilegible, exportaciones, «Leer con IA» desde Documentos, Faro Personal, Bitácora, límite del plan Inicial, conciliación completa con reglas y resumen, reimportación sin duplicar, aislamiento entre estudios, organizaciones, personas y por rol, y auditoría.
- `scripts/pruebas/lectura-servidor.mts` (14/14): herramientas del Vigía con roles y estudios, y cada función que recibe IDs probada con el estudio u organización equivocados.

**Qué falta configurar**
- Autorizar `wscdc` en la CUIT de Faro, configurar un modelo con visión y probar los archivos de Tango y Xubio en instalaciones reales (ver pendientes).
