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

## F7 · Cobros (octubre 2026)

**Qué quedó**
- **Mercado Pago** (`src/modules/billing/mp.ts`): Checkout Pro (preferencias), suscripciones (preapproval), consulta de pagos; cuentas de Faro y de cada tenant cifradas (`mp_accounts`); simulador en `mocks/mercadopago` (ahora respeta `notification_url`).
- **Webhooks** (`/api/mercadopago/webhook`): firma x-signature con antigüedad máxima, consulta del pago a la API, idempotencia por pago (`mp_payments`), registro de cada evento (`webhook_events`) y despacho por `external_reference` validando la cuenta dueña. Auditoría de cada cambio.
- **Suscripciones de Faro** (`faro_subscriptions`): prueba de 30 días con el primer débito al terminar, mensual o anual (2 meses bonificados), subas inmediatas y bajas al final del período, cancelación al final del período, cobro fallido con 7 días de gracia, suspensión y reactivación pagando desde la pantalla de cuenta suspendida; personas y autónomos vuelven a Gratis. «Plan y facturación» con el panel de suscripción y pagos. Faro Manager: **Tenants → Suscripciones** (ingresos del mes, ingreso recurrente, altas, bajas, morosas, suspendidas) y **Plataforma → Mercado Pago** (cuenta y últimos webhooks).
- **Honorarios** (ítem del grupo Negocio, módulo `billing`): abonos por organización con ajuste por porcentaje o IPC, cargos del mes (solos el día 1 o a mano) y sueltos, envío del cobro con link de Mercado Pago (cuenta del estudio), recordatorios escalonados, marcar pagado o anular, y **factura del estudio por ARCA** reusando F3 (borrador para emitir con confirmación).
- **Portal → Empresa → Estado de cuenta** (con `finanzas.ver`): pendiente, vencido y pagado, con el botón Pagar.
- **Flotas**: débito automático individual de la cuota en la cuenta del estudio y pago del saldo o de la liquidación final, solo por lo propio; la baja corta el débito.
- **Faro Personal**: link de pago en las facturas autorizadas (PDF y mail) con la cuenta del autónomo; el webhook la marca pagada.
- Vigía: `estado_de_cuenta`, `cobros_pendientes` (lectura) y `enviar_cobro` (sensible → Aprobaciones). Tareas cada hora (`COBROS_JOBS`). Dos artículos de ayuda nuevos (categoría Cobros y honorarios) y tres actualizados.

**Qué se probó**
- `npm test` (68): firma de webhooks, referencias, estados de la suscripción, fechas y precios, ajuste de abonos, recordatorios y liquidación de flotas.
- `scripts/pruebas/cobros-navegador.mjs` (43/43, 390 px) contra el simulador: cuenta de Faro, suscripción completa (débito, pago, webhook repetido, rechazo, gracia, pago del saldo, cancelación), Faro Manager, honorarios (cuenta del estudio, abono con ajuste, cargos sin duplicar, envío, factura en ARCA, pago desde el portal), permisos del portal y del estudio, débito de una flota, link de pago de una factura personal, firma inválida y auditoría.
- `scripts/pruebas/cobros-servidor.mts` (19/19): suspensión por mora, gracia, cancelación al final del período, vuelta a Gratis, aviso de fin de prueba sin repetir, recordatorios escalonados sin repetir y apagables, herramientas del Vigía con Aprobaciones, aislamiento forzando IDs y webhooks cruzados o repetidos.

**Qué falta configurar**
- Credenciales y webhooks de producción de la cuenta de Faro y de cada estudio; SMTP (ver pendientes).

## F5 · Empleados (octubre 2026)

**Qué quedó**
- **Legajo** (`employees` ampliado, `employee_documents`, `employee_events`): datos (CUIL validado, DNI, puesto, área, ingreso, contratación, convenio), documentos, altas, bajas, cambios, licencias, horas extra y notas, con historial.
- **Recibos de sueldo** (`payslip_batches`, `payslips`): carga masiva de PDFs individuales (CUIL en el nombre o en el texto) o de un PDF único dividido por CUIL, asignación automática con revisión y asignación manual, publicación con aviso (campanita y mail), **firma conforme / no conforme** con constancia (fecha y hora, IP, dispositivo, user agent, hash del PDF verificado y sello), estado por empleado y recordatorios (manuales y a los 3, 7 y 14 días).
- **Mis recibos** para el empleado y su Inicio con recibos por firmar y comunicados.
- **Comunicación interna** (`announcements`, `announcement_reads`): a todos o por área, con adjuntos, aviso y confirmación de lectura por persona; el estudio puede enviarlos en nombre de la organización.
- **Novedades de personal** como solicitudes tipificadas (`requests.data`) y «Aplicar al legajo».
- Ubicación (§2.o): pestaña **Sueldos** de la ficha; en el portal, **Empresa → Sueldos y empleados**; empleado: **Inicio · Mis recibos · Rendiciones · Grupos**. Rutas autenticadas para recibos, documentos del legajo y adjuntos.
- Vigía: `listar_empleados`, `estado_recibos` (lectura), `recordar_firma_recibos` y `publicar_comunicado` (sensibles → Aprobaciones). Módulos `employees`, `payroll` y `comms` disponibles en el registro con eventos y herramientas. Tres artículos de ayuda (categoría Empleados y recibos).

**Qué se probó**
- `npm test` (72): CUIL, división por CUIL (con recibos de dos hojas), período, sello y recordatorios.
- `scripts/pruebas/empleados-navegador.mjs` (36/36, 390 px): legajo con CUIL inválido rechazado, alta, documento, PDF único dividido y asignado, publicación, firma con constancia, acceso al PDF propio y no al ajeno, recordatorio, comunicados por área con adjunto y confirmación, portal de la organización, novedad informada y aplicada, y aislamiento entre estudios, organizaciones y roles, con auditoría.
- `scripts/pruebas/empleados-servidor.mts` (17/17): recordatorio automático sin repetir, PDF alterado no se firma, no conforme sin motivo, IDs forzados entre organizaciones y estudios, y herramientas del Vigía con Aprobaciones.

**Qué falta configurar**
- Activar el módulo por organización, invitar a los empleados y validar el texto de conformidad (ver pendientes).

## F4 · Flujos (octubre 2026)

**Qué quedó**
- **Canvas** (@xyflow/react) en **Vigía → Automatizaciones** (§2.o): disparador (evento de un módulo, horario, webhook entrante o pedido al Vigía), condiciones con salidas «sí» y «no» (también con datos vivos), acciones (herramientas registradas —una vez o por cada organización—, aviso o mail al equipo, tarea, solicitud), pedir aprobación y esperar. Panel de edición, validación al guardar y al activar.
- **Motor** (`src/modules/flows/engine.ts`): cola en Postgres con `SKIP LOCKED`, reintentos (1, 5 y 30 minutos), idempotencia por corrida y por paso, registro de cada paso (`flow_steps`), pausa y reanudación, espera de aprobaciones (sigue si se aprueba, termina si se rechaza), recuperación de corridas trabadas y ruta de cron.
- **Eventos** emitidos por los módulos (factura emitida, documento leído y confirmado, solicitud creada, cargo generado y pagado, recibo firmado, extracto importado, alta y baja de empleado) y por tiempo (vencimiento en 3 días, monotributo al 80 %, recibos sin firmar a los 7 días).
- **Plantillas**: recordar vencimientos, pedir documentación faltante, avisar por recibo no firmado, resumen mensual al cliente, cobro con recordatorios y alerta de monotributo; con las herramientas nuevas `recordar_vencimiento`, `pedir_documentacion` y `enviar_resumen_mensual` (sensibles).
- **Vigía**: `proponer_flujo` (borrador desde una frase), `ejecutar_flujo`, `listar_flujos`. **Límite** de flujos activos por plan (contado de verdad). Webhook entrante con token, límite de pedidos e idempotencia. Tabla `tasks` lista para F9. Artículo de ayuda nuevo.

**Qué se probó**
- `npm test` (77): validación (ciclos, conexiones, herramientas), recorrido, condiciones, interpolación, horarios en hora de Buenos Aires, reintentos, plantillas válidas y frase → borrador.
- `scripts/pruebas/flujos-navegador.mjs` (29/29): frase → borrador → activo, plantilla de cobro de punta a punta (evento → Aprobaciones → espera → condición con dato vivo → rechazo), flujo armado en el canvas con webhook e idempotencia, pausa y reanudación, registro de corridas, aislamiento y permisos, y auditoría.
- `scripts/pruebas/flujos-servidor.mts` (20/20): reintentos y error final, error permanente, idempotencia por paso, eventos sin duplicados, tarea con organización ajena, escaneo de vencimientos, límite del plan, validación, aislamiento y herramientas del Vigía.

**Qué falta configurar**
- Opcional: cron externo con `CRON_SECRET`; SMTP (ver pendientes).

## F9 · Cartera y tareas, WhatsApp, marca blanca, consultas con IA, indicadores y Red (octubre 2026)

**Qué quedó**
- **Cartera y tareas** (módulo `crm`, ítem **Tareas** del grupo Operación): vistas de tabla, kanban y calendario, filtros por estado, responsable y organización, asignación al equipo con aviso, tareas recurrentes por cada vencimiento (3 días antes, a cargo del responsable de la organización) que se cierran solas, evento `tarea.creada` para Flujos y herramientas `listar_tareas` y `crear_tarea`.
- **Consultas laborales y fiscales con IA** (`ai_consults`): el cliente elige el tema al crear una consulta; la IA prepara el borrador después de responderle; el estudio lo edita y lo aprueba (o lo regenera o descarta) en Solicitudes, con el filtro «Respuestas de la IA para revisar». Auditoría de quién aprobó y si se editó; evento `consulta_ia.preparada`; herramientas `listar_consultas_ia`, `preparar_respuesta_consulta` y `enviar_respuesta_consulta` (sensible → Aprobaciones).
- **Indicadores** (`insights`, plan Avanzado): pestaña **Indicadores** en Inicio (organizaciones, honorarios cobrados y por cobrar, primera respuesta, tareas, facturación de los clientes, vencimientos a término y solicitudes) y **Resumen → Indicadores** en la ficha (ventas, gastos, resultado, próximos vencimientos, honorarios pendientes). Gráficos SVG con tabla para lectores de pantalla. Herramientas `indicadores_estudio` e `indicadores_organizacion`.
- **Marca blanca** (`white_label`, plan Avanzado, **Configuración → Avanzado**): nombre, colores con control de contraste y logo en el portal y en su ingreso, siempre con «Con tecnología de Faro»; dominio propio con verificación por TXT y ruteo por host en el middleware (`APP_HOSTS`, como `FARO_HOSTS`).
- **WhatsApp Business Cloud API** (`whatsapp`, simulador en `mocks/whatsapp`): número de Faro en **Faro Manager → Plataforma → WhatsApp** y, por estudio, número de Faro compartido o propio en **Configuración → Avanzado → WhatsApp**; plantillas sincronizadas con su estado; verificación del número del cliente con código (portal → Mi cuenta → WhatsApp) y baja de avisos; los avisos de vencimientos, documentos y respuestas también salen por WhatsApp; webhook firmado e idempotente: texto → solicitud, foto o PDF → Lectura inteligente o Documentos, número desconocido → se le explica cómo verificar; acuses de entrega y lectura. Cada mensaje guarda fuente, ID externo, fecha, validación de la firma y el original. Herramientas `listar_mensajes_whatsapp` y `enviar_whatsapp` (sensible → Aprobaciones). Evento `whatsapp.recibido`.
- **Red de estudios:** pestaña **Mapa** (SVG propio, por provincia) y **Agendar llamada** desde la ficha del estudio con su agenda pública.
- Migración `0034_f9_consultas_marca_whatsapp`; módulos `crm`, `ai_consults`, `insights`, `white_label` y `whatsapp` disponibles en el registro con plan, roles, ubicación, eventos y herramientas. Ayuda nueva: Tareas, Consultas con IA, Indicadores, Marca blanca y WhatsApp; actualizada: Buscar un estudio en la Red.

**Qué se probó**
- `npm test` (86): indicadores (meses, series, variaciones), marca blanca (dominios, hosts reservados, contraste) y WhatsApp (teléfonos argentinos, firma de Meta, webhook, plantillas y orden de acuses).
- `scripts/pruebas/f9-servidor.mts` (58/58): tareas por vencimiento sin duplicar y con cierre automático, plan, aislamiento de tareas, consultas (borrador, plan, aislamiento, Aprobaciones, auditoría, doble aprobación), indicadores (aislamiento y plan), marca blanca (plan, contraste, dominio reservado, TXT, marca por host), WhatsApp (cuenta de Faro, token cifrado, plan, código, verificación, avisos, firma inválida, idempotencia, conversación de la semana, registro original, número desconocido, acuses, Aprobaciones y aislamiento).
- `scripts/pruebas/f9-navegador.mjs` (37/37, 390 px y escritorio, claro y oscuro): mapa de la Red y llamada agendada de punta a punta, tareas en sus tres vistas, consulta del portal → borrador → aprobación → respuesta en el portal, indicadores y permisos, marca en el portal, ingreso por dominio propio (con `--host-resolver-rules`) y ruteo por host, WhatsApp del cliente, comprobante entrante por el simulador, pantallas de configuración y Faro Manager, plan Inicial bloqueado y sin errores de JavaScript.
- Regresión: `flujos-servidor.mts` (20/20; falló una vez por tiempos en la primera corrida y pasó en las dos siguientes) y `vigia-aislamiento.mjs`; verificación de menús (máximo 9 con todos los módulos).

**Qué falta configurar**
- Verificación de Meta, número y plantillas de WhatsApp de Faro (prioridad alta); `APP_HOSTS` y el dominio de cada estudio en Easypanel; modelo de redacción e IA de la plataforma; agenda pública de los estudios en la Red (ver pendientes).

## Principios · Etapa 1 · Plan Inicial gratis (octubre 2026)

**Qué quedó**
- `src/lib/faro/plans.ts`: Inicial con `priceUsd 0`, `free true`, sin prueba, sin organización extra, hasta 5 organizaciones y 1 usuario. Migración `0035_inicial_gratis` para `faro_plans` y los estudios en Inicial (con auditoría `plan.inicial_gratis`).
- Suscripciones: `normalizeFreeSubscriptions()` (al arrancar y cada hora) deja sin cobro ni débito cualquier suscripción en un plan gratis y lo audita (`suscripcion.plan_gratis`); los planes gratis no reciben avisos de fin de prueba; cancelar o terminar la prueba de un plan de estudio vuelve a Inicial.
- Plan y facturación: «Gratis, sin vencimiento» y «Sin débito (plan gratis)». Faro Manager → Planes: un plan gratis no muestra prueba ni organización extra y al guardarlo quedan en cero. `/precios`, `/faro`, el registro y la comparación de planes dicen que Inicial es gratis.
- Ayuda: `primeros-pasos/planes` y `primeros-pasos/registro`.

**Qué se probó**
- `scripts/pruebas/principios-servidor.mts 1` (15/15): plan en código y en la base, migración desde el estado viejo (prueba, suspendido por prueba, suspensión manual respetada), débito cancelado o pendiente de reintento sin duplicar la auditoría, sin avisos de prueba, alta de estudio sin prueba y límite de 5 organizaciones.
- `scripts/pruebas/principios-navegador.mjs 1` (11/11, 390 px y escritorio, claro y oscuro): /precios, /faro, registro, Plan y facturación y Faro Manager, sin scroll horizontal ni errores.
- `npm test` (86) y `npm run build`. Se ajustaron `cobros-servidor.mts` y `cobros-navegador.mjs` (la prueba de débito ahora usa Profesional → Avanzado).

**Qué falta configurar**
- Nada nuevo. Con la cuenta real de Mercado Pago, revisar en el Faro Manager → Auditoría que los débitos de Inicial quedaron cancelados (`debito_pendiente_de_cancelar` = false).
