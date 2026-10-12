# Avances

Resumen de cada fase al cerrarla: qué quedó, qué se probó y qué falta configurar. El detalle de lo pendiente está en `docs/pendientes-configuracion.md` (una sola lista por prioridad) y las decisiones en `docs/decisiones.md`.

F1 (núcleo Faro), F2 (IA, MCP y conexiones), el MVP personal y el esqueleto de navegación se cerraron antes de que existiera este registro; su estado está en `docs/faro-producto.md` §6. Donde una fase vieja dice «Red de estudios», hoy es la **Red Contable** (etapa 6 de principios).

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
- **Red de estudios** (hoy Red Contable): pestaña **Mapa** (SVG propio, por provincia) y **Agendar llamada** desde la ficha del estudio con su agenda pública.
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

## Principios · Etapa 2 · Principio madre y escudo de responsabilidad (octubre 2026)

**Qué quedó**
- **Textos:** el semáforo habla de hechos («Según lo que cargaste, facturaste el 82 % del tope…»), sin «Vas bien», «te toca» ni «te corresponde»; chequeos sin «Todo en orden»; simulación de pase a RI como dato; landings de Faro (/faro, Faro Personal, planes, onboarding) sin «sin ser contador» ni «te acompaña sin contador»; mails del calendario con el pie del escudo; «Esto no reemplaza el criterio de un contador» al pie de Facturación y en las sugerencias.
- **Vigía:** regla del escudo (§1 y §1.a) en los prompts del Vigía personal y del Asistente (estudio y autónomo); capa fija antes del modelo: tarea de matriculado → no la acompaña, explica y ofrece sumar un contador (auditado); pregunta de criterio → responde con datos y agrega el pie con el link a la Red. La herramienta del semáforo devuelve el aviso.
- **§1.b:** lista de tareas que requieren un matriculado (tabla `professional_tasks` sobre los valores de `src/modules/escudo/catalog.ts`), editable en **Faro Manager → Catálogo → Escudo**, marcada «a validar por un contador».
- **§1.c:** reglas de derivación (`derivation_rules`) con umbrales «a validar»: monotributo al 80 % o exclusión, primer empleado, facturación al exterior, más de una actividad, simulación de pase a RI, preguntas al Vigía con criterio profesional (y la changa, que usa la etapa 7). Sugerencias por persona (`derivation_suggestions`) en Inicio y Facturación, con «Ahora no» (vuelve a los días de la regla) y «Sumar un contador» → la Red con el contexto armado y el pedido de propuesta precargado.
- Ayuda: nuevo `primeros-pasos/faro-y-tu-contador`; actualizados `facturacion/semaforo-monotributo`, `facturacion/calendario-y-chequeos` y `vigia/vigia`.

**Qué se probó**
- `principios-servidor.mts 2` (30/30): textos del semáforo, detección de tareas y de preguntas de criterio, Faro Manager (alta, validación con matrícula, umbral, auditoría), sugerencias (descartar, no volver antes de tiempo, volver después, ajenas forzando el ID), Vigía con el proveedor de prueba: «¿estoy bien con ARCA?», «¿me van a multar?», «¿me conviene pasar a responsable inscripto?» y «certificación de ingresos», con el escudo en el prompt.
- `principios-navegador.mjs 2` (16/16, 390 px y escritorio, claro y oscuro): sugerencia en Inicio, «Ahora no», Red con contexto, derivación ajena sin datos, semáforo, chequeos, pie del escudo y Faro Manager → Escudo. Se arregló un scroll horizontal previo de Inicio a 390 px.
- Regresión: `npm test` (86), `copiloto.mts` (36/36).

**Qué falta configurar**
- Que un contador (Estudio Cristofaro) valide la lista de tareas y los umbrales en Faro Manager → Catálogo → Escudo (ver pendientes).

## Principios · Etapa 3 · Mis cajas, caja de negocio y sueldo del dueño (octubre 2026)

**Qué quedó**
- **Mis cajas** (`/cajas`, ítem nuevo del espacio Personal): todas las cajas juntas, cada una con su gente, su plata y su propósito. Caja **personal** = la Bitácora (movimientos, sobres, fijos y metas siguen igual); caja de **negocio** separada (`/cajas/<id>`), que se abre sola para los autónomos y con un toque para cualquiera con una actividad.
- Migraciones `0037_cajas` (tablas y datos), `0038_cajas_sugerencias` y `0039_cajas_claves`. Los gastos marcados «de mi actividad» pasaron a la caja de negocio sin perder nada (registro original en `raw`, el de la Bitácora borrado y vinculado, auditado).
- **Parece del negocio:** los gastos personales con licencias, software, hosting, oficina o librería aparecen en Mis cajas con «Mover al negocio» o «Es personal»; también desde el movimiento de la Bitácora.
- **Sueldo del dueño:** monto, frecuencia y fecha; se registra solo (tareas de la Bitácora) o con «Registrar sueldo». Es el único movimiento del negocio a lo personal: retiro en el negocio e ingreso en la Bitácora, unidos y no editables desde la Bitácora. Cifra sugerida a partir de los números del negocio, como dato (§1.a). **Aporte** de lo personal al negocio.
- **Cada caja es un mundo cerrado:** solo los integrantes ven y tocan una caja; entre cajas solo pasa plata por `box_transfers`.
- **Vigía:** «12000 de hosting para el negocio» propone la tarjeta en la caja de negocio; confirmar y deshacer funcionan sobre la caja.
- Ayuda: nuevo `bitacora/mis-cajas`; actualizado `bitacora/bitacora`. `faro-producto.md` §2.o: Mis cajas en el menú de Personal.

**Qué se probó**
- `principios-servidor.mts 3` (32/32): migración de datos (sin duplicar al correrla dos veces, sin restaurar lo movido), Mis cajas, una sola caja de negocio, aislamiento forzando IDs (ver, cargar, borrar, sueldo, mover), sugerencia de mover, sueldo (las dos cajas, no editable desde la Bitácora, borrado de los dos lados), aporte, sueldo automático una sola vez por fecha, cifra sugerida y Vigía.
- `principios-navegador.mjs 3` (16/16, 390 px y escritorio, claro y oscuro): Mis cajas, mover «Licencia Figma», cargar un ingreso, configurar y registrar el sueldo, verlo en la Bitácora como movimiento entre cajas, y 404 forzando el ID desde otro estudio y desde otra persona.
- Regresión: `npm test` (86), etapas 1 y 2, `copiloto.mts`.

**Qué falta configurar**
- Nada. Flotas no cambia en esta etapa.

## Principios · Etapa 4 · Registro compartido (octubre 2026)

**Qué quedó**
- **Cajas compartidas** con opciones ya armadas (`/cajas/nueva`): pareja, familia, amigos, negocio con otros y padres y abuelos (definida por el fin: puede sumarse cualquiera). Cada opción trae sus categorías, su desglose y su final por defecto; no se configura ni se le pone nombre.
- **Invitación** por enlace o WhatsApp (`/caja/<enlace>`, renovable); para entrar hay que tener cuenta (se crea ahí mismo, gratis).
- **Una carga, uno o más destinos:** desde la caja («si lo pagué yo, también en mi caja personal») o desde la Bitácora («También a <caja>»); si se divide, en la Bitácora va la parte propia. Nunca se carga dos veces.
- **Dos finales** que elige quien paga: «Solo registrar» (queda que puso ese monto, sin deuda) y «Dividir» (lógica de Grupos de gastos: quién le debe a quién).
- **Confirmación de pago:** lo que carga otra persona a tu nombre y tu parte de un gasto dividido no cuentan hasta que confirmás («Sí, lo pagué», «Ya la pagué»).
- **Desglose por caja:** quién puso qué, cuánto debe, qué falta confirmar, la diferencia contra lo parejo, «Están parejos», en qué se fue por categoría y **metas de ahorro** dentro de la caja con lo que puso cada uno.
- **Hogar** sigue igual y suma «Armar una caja de pareja» (sin mover datos: ver decisiones). **Grupos de gastos** sin cambios.
- **Vigía:** «pagué 3000 la cena con mi pareja» propone la tarjeta de la caja con **Solo registrar** y **Dividir**.
- Ayuda: nuevo `bitacora/cajas-compartidas`; actualizados `bitacora/mis-cajas` y `bitacora/hogar-compartido`.

**Qué se probó**
- `npm test` (91): núcleo del desglose (`src/modules/cajas/ledger.test.ts`) con la cena de $3.000 en los dos finales.
- `principios-servidor.mts 4` (34/34): opciones, enlace (falso y renovado), aislamiento de quien no es integrante (ver, desglose, cargar, enlace, confirmar, metas ajenas), cena con solo registrar ($3.000, también en la Bitácora) y con dividir ($1.500 pendiente hasta que confirme), confirmación de lo cargado por otro, metas, salir con deudas, padres y abuelos con cualquiera, Hogar → caja de pareja y el Vigía con los dos finales.
- `principios-navegador.mjs 4` (15/15): opciones, invitar y sumarse con cuenta, sin cuenta pide crearla, dividir → la pareja confirma → «Están parejos», carga desde la Bitácora a las dos cajas, 390 px y escritorio en claro y oscuro, 404 para quien no es integrante.
- Regresión: etapas 1 a 3, `gastos.mts` (33/33 con el simulador de cotizaciones).

**Qué falta configurar**
- Nada. SMTP sigue pendiente para los avisos por mail (los avisos en la app funcionan).

## Principios · Etapa 5 · Conexión con un contador (octubre 2026)

**Qué quedó**
- **Indicador de modo** en Personal (Inicio y Contador): Autogestión o Gestión profesional, con el estudio y su contacto.
- **Conexión, no copia** (`account_connections`, migración `0040`): el estudio accede con un permiso sobre la cuenta y trabaja sobre sus datos en vivo. Alcances: caja de negocio y lo fiscal siempre; cajas personales solo si la persona las activa (apagadas por defecto). Los acuerdos de Flotas vigentes y los nuevos pasan a este modelo.
- **Inicio de cualquiera de las dos partes:** «Conectar mi cuenta» en la ficha de la Red o invitación del estudio (Comercial → Conexiones).
- **Admisión:** resumen de lo autorizado, pedido de entrevista (agenda) o de información, aceptar o rechazar con motivo; después, **acuerdo de servicio** (el de Flotas) firmado por las dos partes y aceptación de políticas.
- **Cuenta conectada** en Organizaciones, con su ficha en vivo (mismo formato para cualquier estudio).
- **Perilla de autonomía** («Delegar y mirar» por defecto, o «Proponer y aprobar»), modificable; **«Lo que hizo tu contador»** con quién, qué, cuándo, antes y después, filtros y resumen semanal opcional.
- **Desconexión con mediación:** cualquiera inicia con motivo → En cierre (solo lectura 30 días) → checklist (honorarios en cero, pendientes entregados y constancia de los dos) → cerrada, sin acceso y con el registro del período; si hay diferencias, en disputa con canal de mensajes.
- **Calificaciones:** a los 30 días, cada 6 meses (salteables) y al cierre. Solo se guardan; el estudio ve las suyas. Lo público no cambia.
- **Vigía:** `consultar_contador` en el Vigía personal y `listar_cuentas_conectadas` en el del estudio. Todo auditado (`conexion.*`).
- Ayuda: nuevos `red-de-estudios/conectar-un-contador` (hoy `red-contable/conectar-un-contador`) y `organizaciones/cuentas-conectadas`.

**Qué se probó**
- `principios-servidor.mts 5` (46/46): estudio sin conexión no ve nada; otro estudio forzando el ID no ve ni opera; admisión con resumen de lo autorizado y sin cajas personales; entrevista, información, aceptar, rechazar con motivo; firmas (políticas, nombre) y activación con el acuerdo; datos en vivo sin copia; con alcance fiscal no ve las cajas personales (y sí al activarlas, y deja de verlas al apagarlas); delegar y mirar con antes y después; proponer y aprobar; cierre con solo lectura, disputa, checklist y constancia de los dos; conexión cerrada sin acceso y el dato en la cuenta de la persona; auditoría; encuestas a los 30 días, salteadas, a los 6 meses y al cierre; migración de Flotas.
- `principios-navegador.mjs 5` (27/27, 390 px y escritorio, claro y oscuro): el recorrido completo desde la Red hasta el cierre y la calificación, con aislamiento entre estudios (404).
- Regresión: etapas 1 a 4, `flotas.mts` (37/37, con la conexión del acuerdo), `npm test` (91).

**Qué falta configurar**
- SMTP para los avisos por mail (en la app ya llegan). Revisar con un abogado los textos de las políticas de la conexión (ver pendientes).

## Principios · Etapa 6 · Red Contable de doble mano (octubre 2026)

**Qué quedó**
- **Red Contable** en toda la interfaz y la ayuda; la ruta pública pasa a `/red-contable` y las viejas (`/red`, `/red/<estudio>`, `/ayuda/red-de-estudios/*`) redirigen.
- **«Disponible, busco contador»** (migración `0041`): personas, autónomos y empresas desde Personal → Contador; Flotas desde la Flota (Capitán). Eligen qué mostrar (tipo, rubro, tamaño, zona, qué necesitan y una nota sin datos personales); nunca nombre ni contacto.
- **Buscar clientes** (Comercial, estudios con ficha verificada): listado anónimo con filtros y «Contactar». La persona acepta o rechaza; recién al aceptar el estudio ve sus datos y empieza la admisión (etapa 5).
- Se mantienen el ranking neutral sin posiciones pagas, la matrícula verificada y las reseñas actuales. Sin comisión por clientes.
- Ayuda: `red-contable/buscar-un-estudio` y `red-contable/perfil-del-estudio`.

**Qué se probó**
- `principios-servidor.mts 6` (15/15): limpieza de la nota, apagado/encendido, listado anónimo, filtros, estudio sin ficha no busca, contacto único, aceptación ajena forzando el ID, admisión al aceptar, datos recién después, auditoría y Flotas (solo el Capitán, sin nombre).
- `principios-navegador.mjs 6` (13/13): redirecciones de rutas viejas, interruptor, listado anónimo, contactar, aceptar y ver los datos, 390 px y oscuro.
- Regresión: etapas 1 a 5, `red.mts` (15/15), `verificar-redirecciones.mts`.

**Qué falta configurar**
- Nada. Si se confirma el nombre definitivo de la Red (decisión abierta b), cambiar textos y la ruta pública.

## Principios · Etapa 7 · La changa en zona gris (octubre 2026)

**Qué quedó**
- Sin monotributo, la caja de negocio registra ingresos de una changa o freelance **sin facturar** (categoría «Changa o freelance»; el Vigía la reconoce: «cobré 50000 de una changa»).
- **«Esto ya es una actividad»:** la foto real en la caja de negocio, con lo cobrado sin facturar en los últimos 12 meses y en cuántos meses, y el dato de contexto de §13 marcado «a confirmar por un contador».
- Al superar el umbral configurable (regla `changa_actividad` de la etapa 2), la sugerencia de anotarse en el monotributo con un contador, que lleva a la Red Contable con el contexto armado.
- Ayuda: `bitacora/mis-cajas` (sección de la changa).

**Qué se probó**
- `principios-servidor.mts 7` (7/7): registro sin facturar, debajo del umbral sin sugerencia, foto real, sugerencia con el contexto de §13, umbral configurable y que con monotributo ya no es zona gris.
- `principios-navegador.mjs 7` (8/8): abrir la caja, cargar dos changas, la foto real, el contexto, la sugerencia y la Red con el contexto, en 390 px y oscuro.

**Qué falta configurar**
- Que un contador valide el umbral y el texto de §13 (Faro Manager → Escudo; ver pendientes).

## Principios · Etapa 8 · Tango en los dos sentidos (octubre 2026)

**Qué quedó**
- **Enlace con la API de Tango** (migración `0042`) en Configuración → Conexiones → Tango → Tango en los dos sentidos: URL, empresa, token y secreto cifrados; escritura prendida o apagada.
- **De Faro a Tango:** cada factura autorizada entra en una bandeja de salida y se escribe en Tango con el nombre estándar, con reintentos y sin duplicar.
- **De Tango a Faro:** webhooks firmados (`/api/integrations/tango/webhook/<enlace>`) o sondeo cada 15 minutos si la versión no los ofrece (`instrumentation.ts`, `TANGO_JOBS`). Cada comprobante guarda origen, ID externo, fecha de sincronización y registro original.
- **Diferencias para decidir:** si algo no coincide, queda en conflicto con las dos versiones; la persona elige Faro o Tango. Auditado.
- **Nombres estándar:** sugerencias automáticas de unificación con revisión humana y reglas manuales (cliente, cuenta, categoría); el original queda.
- **Archivos:** exportación CSV con nombres estándar; la importación por archivos y el conector local siguen igual.
- **Vigía:** herramienta `estado_sincronizacion_tango` (solo lectura).
- Simulador ampliado: `mocks/tango/server.mjs` (escritura, webhooks, versión sin webhooks y fallas).
- Ayuda: `conexiones/conexiones` (sección «Tango en los dos sentidos»).

**Qué se probó**
- `normalize.test.ts` (3/3).
- `principios-servidor.mts 8` (27/27) contra el simulador: enlace y token cifrado, versión sin webhooks, bandeja de salida con falla y reintento, sin duplicar, webhook firmado, firma inválida y enlace inexistente, conflicto sin pisar, aislamiento forzando IDs (otro estudio no ve, no resuelve, no aprueba ni exporta), quedarse con Faro reescribe en Tango sin tocar la factura, comprobante ya existente → conflicto, sondeo, sugerencias, aprobación con original guardado, CSV y enlace pausado.
- `principios-navegador.mjs 8` (13/13): enlace, versión sin webhooks, sincronizar, unificar nombres, conflicto, 390 px y oscuro, CSV, colaborador sin acceso y otro estudio sin datos.

**Qué falta configurar**
- Validar con la cuenta real de Tango qué se puede escribir, si hay webhooks, el costo y local vs nube (ver pendientes).


## Diseño · Etapas 3, 4 y 6 (octubre 2026)

**Qué quedó**
- **Etapa 3 (pantalla por pantalla):** Personal, Estudio, Organización, empleado, Faro Manager, landings y ayuda llevadas al sistema único.
  - Jerarquía: un título serif por página y bloques en sans de 18 px.
  - Estados vacíos que explican el próximo paso y textos largos que no rompen.
  - Montos grandes y negativos con `num`, sin desbordes a 390 px y contraste AA en las landings.
  - Antes y después en `docs/auditoria-diseno.md`; hojas de capturas en `docs/diseno/capturas/`.
- **Etapa 4:** sidebar con animación escalonada (motion, `layoutId` por ícono, 35 ms por ítem, transform y opacity, movimiento reducido = instantáneo). Video en `docs/diseno/sidebar.gif` y `sidebar.webm`.
- **Etapa 6:** Red Contable visible en todos los espacios.
  - **Estudio:** Comercial → «Buscar clientes» (segunda pestaña) con badge de candidatos nuevos que coinciden y dos vistas, Postulaciones (anónimas) y Estudios y contadores.
  - **Personal:** Contador → Red Contable y «Mi postulación».
  - **Organización:** Empresa → Red Contable (administrador o dirección).
  - **Flotas:** desde su ficha.

**Qué se probó**
- `recorrido.mjs`: 134 pantallas × 390 y 1.440 px con los seis perfiles de la demo, 0 hallazgos (desborde, texto chico, alturas, serif, errores de JS).
- `capturas.mjs`: 184 capturas en claro y oscuro.
- `impeccable detect` en las landings: de 39 a 25 hallazgos, todos excepciones decididas.
- `sidebar-video.mjs`: escalonado en los dos sentidos, clics sin bloquear, 60 fps sin grabar y movimiento reducido instantáneo.
- `diseno-red.mjs` 25/25 (vistas, badge, anonimato, postulación de persona, autónomo, empresa y Flota, aislamiento).
- `principios-servidor` con la etapa 9 nueva (aislamiento de la postulación de una empresa).

## Diseño · Etapas 0 a 2 y 5 (octubre 2026)

**Qué quedó**
- **Etapa 0 (herramientas):** Impeccable como skill del proyecto, `PRODUCT.md` y `DESIGN.md` (citado en CLAUDE.md).
- **Etapa 1 (diagnóstico):** `docs/auditoria-diseno.md`, con capturas, medidas y el detector de Impeccable.
- **Etapa 2 (sistema único):**
  - Escala tipográfica por roles y alturas de control con tokens.
  - Un radio, una sombra y dos anchos de contenido.
  - Placeholders AA y tablas que no desbordan en el celular.
  - Componentes en `@/components/ds`.
- **Etapa 5 (datos de demostración):**
  - `npm run demo:seed` / `demo:reset`, `dist/demo.mjs` y Faro Manager → Plataforma → Demo.
  - Universo completo marcado `is_demo` (ver `docs/demo.md`), con la franja «Demostración» en la app.
  - Ayuda: `primeros-pasos/demo`.

**Qué se probó**
- `demo-navegador.mjs` (33/33, dos corridas seguidas):
  - Carga y borrado desde el Faro Manager, con auditoría y sin contraseñas guardadas.
  - Los seis perfiles entran con usuario y contraseña, ven la franja y ningún dato real, sin scroll a 390 px.
  - Un cliente real sigue sin poder usar contraseña.
  - Al borrar no queda nada de la demo y los datos reales quedan intactos.
- Regresión con la demo cargada: `principios-navegador` 112/112, `principios-servidor` todo bien, `npm test` 94/94, `red.mts` y `flotas.mts` OK.

**Qué falta configurar**
- Cargar la demo en staging desde el Faro Manager (o `node dist/demo.mjs seed` en la consola de `web`) y guardar las contraseñas que muestra.

## Auditoría de octubre 2026 (12 de octubre)

**Qué quedó**
- **«Ver como…»** (Faro Manager → Plataforma → Demo): solo `faro_owner` con 2FA y solo sobre usuarios de la demo; sesión real de hasta 2 horas, franja «Viendo como…» con «Volver a mi usuario» y auditoría (`demo_impersonations`, migración `0044`).
- **La demo y lo real no se cruzan:** Red Contable, fichas, conexiones con contador, postulantes, invitaciones (organizaciones, grupos, Bitácora compartida, Flotas) y uniones por enlace (grupos y cajas) solo dentro del mismo mundo; el registro no acepta el dominio de la demo; borrar la demo se frena si encuentra usuarios reales adentro.
- **Seguridad:** 2FA del estudio exigido en todas las rutas con datos (API, descargas, exportaciones y facturas); cabeceras CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy y Permissions-Policy; mismo origen en las APIs que modifican datos; URLs elegidas por un tenant (IA, MCP externos, Tango) sin acceso a la red interna; webhooks de Mercado Pago, WhatsApp y Tango con tope de cuerpo y límite por IP, y Tango sin reenvíos (replay).
- **Enlace mágico** con la misma respuesta para cualquier mail («Si … tiene acceso, te llega un enlace»); una cuenta del estudio recibe en su casilla el aviso de que entra con contraseña.
- **Acceso asistido acotado:** no cambia equipo, credenciales de IA, Mercado Pago, MCP, conexiones ni plan; un usuario de la demo nunca lo usa.
- **Agenda:** mails, evento e ICS con el nombre del estudio que atiende; el emisor del 2FA es «Faro».
- **Portal:** tarjeta Sueldos en el Inicio para los roles con sueldos.
- **Tareas internas con turno** (`job_leases`, migración `0045`): cada tarea y su cron externo corren en una sola instancia a la vez; `JOBS=off` las apaga todas y `<TAREA>_JOBS=off`, una.
- **Backup:** `scripts/backup/` (base y `/data/uploads`, con verificación y retención) y restauración probada en local (`docs/backup.md`). 28 índices nuevos (migración `0046`).
- **Limpieza y rendimiento:** ESLint y knip sin errores, un solo formato de montos y fechas, `npm audit` sin altas ni críticas en producción, la app sin tamaños, alturas, radios ni colores a mano, y carga diferida del canvas de flujos y del Markdown de los chats.

**Qué se probó**
- `scripts/pruebas/ver-como.mjs`, `scripts/pruebas/auditoria-seguridad.mts` y `scripts/pruebas/tareas-internas.mts`.
- Restauración del backup en una base vacía con la demo cargada: mismas cantidades y archivos idénticos (`docs/backup.md`).

**Qué falta configurar**
- Instalar el backup con cron en el VPS, confirmar que Traefik no deja pasar un `X-Forwarded-For` del cliente y borrar las ramas remotas viejas (ver pendientes).

## §2.q · Etapa 1: Agente contable (12 de octubre)

**Qué quedó**
- **Vigía → Agente** (estudio y Autónomos Pro): nueva tarea (pedido libre o tareas frecuentes), en curso, historial, rutinas y memoria. Cada tarea tiene su pantalla con el plan, el avance en vivo, pausa, reanudación y cancelación, el informe (hallazgos por importancia, borradores en Propuestas para aprobar, tareas del equipo y costo) y la bitácora.
- **Tareas frecuentes:** cierre del mes, revisión del crédito fiscal (IVA), conciliación del extracto, clientes cerca del tope del monotributo y resumen mensual. **Otra tarea:** el modelo arma el plan y usa las herramientas registradas.
- **Cola en Postgres** (`agent_tasks`, tarea interna `agente`, `AGENT_JOBS`), con turno por fila; sobre una organización, la cartera o la cuenta personal, con los permisos de quien la pide.
- **Rutinas** mensuales, semanales o N días antes de un vencimiento, con resumen por la app, mail o WhatsApp.
- **Memoria** por organización, visible y editable.
- **Regla fiscal:** interruptores de automatización auditados y con pausa (`automation_switches`); lo sensible sin interruptor queda para aprobar.
- **Vigía → Agente:** herramientas `encargar_al_agente` y `ver_tareas_agente`.
- **Plan:** módulo `agent` y límite «Tareas del Agente por mes»; modelo del Agente por estudio y de la plataforma. Migración `0047`.
- **Demo:** Ferreyra & Asociados con 20 organizaciones, dos tareas terminadas, dos rutinas y criterios en la memoria.

**Qué se probó**
- `src/modules/agent/agent.test.ts` (interpretación del pedido, rutinas, hallazgos e informe).
- `scripts/pruebas/agente.mts` (50 verificaciones): plan y ejecución, borrador en Aprobaciones con origen Agente, pausa, reanudación y cancelación, interruptor activo y en pausa, tarea libre con el bucle de herramientas y el costo medido, rutinas mensual y antes del vencimiento (sin dispararse dos veces), memoria, tope del plan, encargo desde el Vigía y por MCP, aislamiento entre estudios forzando IDs y una revisión de IVA sobre la cartera de 20 organizaciones de la demo (9 hallazgos altos y 13 medios en 1,3 s).
- Pantallas del Agente a 390 y 1.440 px, en claro y en oscuro, sin desborde ni errores.

**Qué falta configurar**
- Elegir el modelo del Agente en Configuración → IA de cada estudio y en Faro Manager → Catálogo → IA (pendiente 17).

## §2.q · Etapa 2: lectura de compras de nivel superior (12 de octubre)

**Qué quedó**
- La lectura extrae cada **ítem** (descripción, código del proveedor, cantidad, precio unitario y alícuota) y cada **percepción, retención y otro tributo** por tipo (IVA, ingresos brutos, Ganancias, internos, otros) y jurisdicción; valida que los importes cierren con el total y los ítems con el neto. La planilla exporta las percepciones por tipo.
- **Aprendizaje por proveedor:** cuenta, centro de costo, concepto, tratamiento de percepciones y alícuota de los ítems quedan como regla del proveedor en esa organización y se proponen en el próximo comprobante, con «Aprendido de tus correcciones» y «Deshacer»; «Olvidar» borra la regla.
- **Precisión medida:** campos corregidos por comprobante y proveedor, al principio y en los últimos («Proveedores aprendidos»).
- **Carga masiva:** muchos archivos o un ZIP (hasta 500) en cola, con avance en la bandeja. Migración `0048`.

**Qué se probó**
- `src/modules/smart-docs/compras.test.ts` (tributos, ítems, totales y aprendizaje).
- `scripts/pruebas/lectura-compras.mts` (29 verificaciones): ítems y tributos por jurisdicción, la segunda factura del mismo proveedor ya viene corregida, deshacer, precisión que mejora, ZIP en cola, aislamiento entre estudios y entre organizaciones del mismo estudio.
- `lectura-navegador` (50) y `lectura-servidor` (14) siguen en verde; pantallas a 390 y 1.440 px en claro y oscuro.

**Qué falta configurar**
- Una casilla de mail entrante para recibir comprobantes por mail (pendientes).

## §2.q · Etapa 3: conciliación con tolerancias y ajustes (12 de octubre)

**Qué quedó**
- **Tolerancias por cuenta bancaria** (días y monto fijo o porcentaje), con las cuentas contables del ajuste; las sugerencias muestran puntaje y motivo y, fuera de la tolerancia, no se sugiere ni se concilia.
- **Uno con muchos y muchos con uno:** sugeridos cuando la contraparte está en el detalle, o armados a mano; deshacer el grupo entero.
- **Asiento de ajuste** por la diferencia (redondeo o gastos bancarios contra deudores o proveedores), en borrador para registrar o registrado solo con la automatización «conciliacion.ajuste». Primer pedazo del núcleo contable (`journal_entries`). Migración `0049` (crea las cuentas de los extractos ya importados).

**Qué se probó**
- `src/modules/bank-rec/core.test.ts` (tolerancias, grupos y asiento).
- `scripts/pruebas/conciliacion-tolerancias.mts` (27 verificaciones): sugerencia dentro de la tolerancia, fuera de fecha y de monto, asiento en borrador y registrado, automatización, uno con muchos, muchos con uno, deshacer con asiento anulado y aislamiento forzando IDs.
- `lectura-navegador`, `lectura-servidor` y `lectura-compras` siguen en verde.

## §2.q · Etapa 4: análisis del Libro IVA (12 de octubre)

**Qué quedó**
- **ARCA → Libro IVA** en la ficha de la organización: libros de compras y ventas del período con crédito o débito fiscal por proveedor o cliente, por condición frente al IVA y por alícuota, gráficos y comparación con los 3 períodos anteriores.
- **Anomalías explicadas:** concentración, monotributistas, CUIT con problemas en el padrón, CAE no encontrado (WSCDC), duplicados, fuera de período, importes atípicos, alícuotas según el rubro, IVA en facturas B o C; en ventas, rechazados, saltos de numeración y concentración en un cliente.
- **Marcas «a revisar»** con nota, filtro y «Resuelto»; **checklist** de lo que falta antes de presentar («Sin pendientes», nunca «está bien»). Migración `0050`.
- Herramienta `analizar_libro_iva` (Vigía, MCP y Agente): la revisión de IVA y el cierre del mes del Agente la usan, y queda como rutina.

**Qué se probó**
- `src/modules/iva/iva.test.ts` (crédito fiscal, libro del período, anomalías de compras y ventas).
- `scripts/pruebas/libro-iva.mts` (20 verificaciones): 7 tipos de anomalía en un período, resumen y comparación, marcas y checklist, ventas, el Vigía y el Agente, y aislamiento forzando IDs.
