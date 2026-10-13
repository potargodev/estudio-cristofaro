# Cobertura de tareas contables

**Lista de referencia obligatoria.** Reúne todas las tareas que un estudio contable argentino hace con sus clientes. Nada se construye en Faro sin chequearlo contra esta lista, y cada vez que algo cambia de estado se actualiza acá en el mismo commit.

**Validación profesional.** La lista la armó el equipo de producto como punto de partida. La validación final la hace un contador matriculado (principio §1, `docs/principios-producto.md`). Los ítems **no contemplado** son los agujeros a llevar a la reunión con la contadora de Estudio Cristofaro, con una sola pregunta: *"¿qué tarea que hacés todos los meses con un cliente no está en esta lista?"*.

**Normativa cambiante.** Regímenes, formularios y aplicativos cambian seguido (ARCA, organismos provinciales, IGJ). Todo lo marcado "a validar" se confirma con fuente oficial antes de construirlo.

## Estados

| Estado | Qué significa |
|---|---|
| **Cubierto** | Ya funciona en Faro. |
| **Planificado (FA)** | En el pedido de **facturación avanzada** (panel con muchas CUIT, lotes, recurrentes, Libro IVA, ARCA en cola, WhatsApp, tiendas, buzón de comprobantes, API). |
| **Planificado (NU-n)** | En el pedido de **núcleo, adaptadores, contabilidad, Agente, sueldos y stock**, etapa *n* (0 a 11). |
| **No contemplado** | Falta decidir si entra. Llevar a la contadora. |
| **Fuera de alcance** | Requiere la firma o el criterio de un matriculado, o no corresponde a Faro (§1.b). Faro puede ordenar los datos y derivar, pero no hace la tarea. |

---

## 1. Impuestos nacionales (ARCA)

| Tarea | Estado | Dónde / nota |
|---|---|---|
| IVA: liquidación mensual (débito, crédito, saldo, saldo a favor) | **Cubierto** (parcial) | Posición de IVA del mes y los 3 anteriores por CUIT con semáforo (B4) y análisis antes de presentar. Falta arrastrar el saldo a favor entre períodos. La presentación la hace el contador. |
| IVA: libros IVA ventas y compras | **Cubierto** | Ficha de la organización → ARCA → Libro IVA (B4): libro de ventas y compras del período, por CUIT, en Excel y PDF con resumen por alícuota; análisis y anomalías antes de presentar. |
| IVA: Libro IVA Digital (exportación al formato de ARCA) | **Cubierto** (a validar) | Archivos de comprobantes y alícuotas de ventas y compras en un ZIP (B4), con los diseños de registro de la RG 4597 "a validar" contra el aplicativo vigente. La presentación la hace el contador. |
| IVA: regímenes de percepción sufridos (en compras) | **Planificado (NU-4)** | La lectura de comprobantes trae cada percepción. |
| IVA: saldos técnicos y de libre disponibilidad | **No contemplado** | Seguimiento de saldos a favor entre períodos. |
| Ganancias, personas humanas: DDJJ anual | **No contemplado** | Hoy solo hay datos sueltos (Bitácora, Facturación). Faltan la hoja de trabajo y el seguimiento. |
| Ganancias, sociedades: DDJJ anual | **No contemplado** | Depende de la contabilidad nativa (NU-1). |
| Ganancias: anticipos (cálculo y vencimientos) | **No contemplado** | El calendario muestra vencimientos, pero no calcula anticipos. |
| Ganancias: régimen cedular (rentas financieras, inmuebles) | **No contemplado** | |
| Ganancia Mínima Presunta | **No aplica** | Derogado para ejercicios iniciados desde 2019 (a validar). |
| Bienes Personales: DDJJ anual de personas humanas | **No contemplado** | |
| Bienes Personales: acciones y participaciones (responsable sustituto de sociedades) | **No contemplado** | |
| Régimen de información de participaciones societarias | **No contemplado** | |
| Monotributo: adhesión e inscripción | **Fuera de alcance** | Faro guía y deriva al contador (disparador §1.c). |
| Monotributo: semáforo y tope de la categoría | **Cubierto** | Faro Personal. Escala "a validar". |
| Monotributo: recategorización (enero y julio), por cliente | **Cubierto** | Faro Personal (aviso y categoría sugerida). |
| Monotributo: recategorización masiva de la cartera del estudio | **Cubierto** | Operación → Recategorización (A5): 12 meses, parámetros físicos, sube/baja/mantiene/excluido, cuota nueva, revisión en lote, comprobante, avisos por app/mail/WhatsApp, tareas y Agente. Escala "a validar"; decide el contador. |
| Monotributo: pago de la cuota y exclusiones | **Cubierto** (aviso) | Calendario y alerta de exclusión. El pago lo hace el contribuyente. |
| Monotributo: relación de dependencia más actividad independiente | **Cubierto** (aviso) | §13 de principios, "a validar". |
| Retenciones y percepciones practicadas (SICORE/SIRE): cálculo e informe | **No contemplado** | Para clientes que son agentes de retención. Ver también SIRADIG y Ganancias 4.ª categoría en §4. |
| Impuesto a los débitos y créditos bancarios: cómputo como pago a cuenta | **Cubierto** (parcial) | Débitos y créditos separados en la conciliación, asiento a pago a cuenta y estimación del 33 % computable "a validar" (A3). El cómputo en la DDJJ lo hace el contador. |
| Facturación electrónica (todos los tipos) | **Cubierto / Planificado (FA)** | Ver §6. |
| Domicilio Fiscal Electrónico y Ventanilla Electrónica: control de notificaciones | **No contemplado** | Muy habitual. Sin servicio oficial para leerlo: hoy solo se podría hacer con chequeos guiados y recordatorios. |
| Constancia de inscripción y padrón | **Cubierto** | Mi situación con ARCA. |
| Altas y bajas de impuestos, actividades y domicilios | **Fuera de alcance** | Trámite con clave fiscal del contribuyente o del contador. Faro puede registrar la tarea y el resultado. |
| Planes de pago (Mis Facilidades) y moratorias | **No contemplado** | Seguimiento de cuotas y vencimientos del plan. |
| Intimaciones, embargos y deuda en cuenta corriente | **Cubierto** (parcial) | Chequeos guiados y carga manual. No hay servicio oficial. |
| Certificado MiPyME (Registro de Empresas MiPyME) | **No contemplado** | Habitual en pymes: beneficios en IVA y FCE. |
| Exportaciones: facturación E y reintegros | **Planificado (FA)** | Factura E sí; reintegros, no contemplado. |

## 2. Impuestos provinciales y municipales

| Tarea | Estado | Dónde / nota |
|---|---|---|
| Ingresos Brutos local: DDJJ mensual y anual | **No contemplado** | CABA (AGIP), PBA (ARBA) y el resto. Hay percepciones leídas (NU-4), falta la liquidación. |
| Convenio Multilateral: CM03 mensual, CM05 anual, coeficientes unificados | **No contemplado** | Muy común en clientes que venden en varias provincias. Prioridad alta para la contadora. |
| Regímenes simplificados provinciales (monotributo unificado) | **No contemplado** | A validar por jurisdicción. |
| Percepciones y retenciones de IIBB sufridas | **Planificado (NU-4)** | Lectura por jurisdicción. |
| SIRCREB (retenciones bancarias de IIBB) | **Cubierto** (parcial) | Clasificadas en la conciliación, con asiento a su cuenta y reporte (A3). El cómputo en la DDJJ de IIBB lo hace el contador. |
| Agente de retención o percepción provincial: DDJJ | **No contemplado** | |
| Leyendas de IIBB en comprobantes (consumidor final) | **Planificado (NU-7)** | |
| Tasas municipales (seguridad e higiene y otras) | **No contemplado** | Varía por municipio. |
| Impuesto de sellos | **No contemplado** | En contratos de clientes. |

## 3. Registraciones contables

| Tarea | Estado | Dónde / nota |
|---|---|---|
| Plan de cuentas | **Cubierto** | Ficha → Contabilidad → Plan: plantilla por rubro (general, comercio, industria, gastronomía, agro), cuentas propias y mapeo a Tango/Xubio/Contabilium (A1). |
| Libro diario y asientos (automáticos y manuales) | **Cubierto** | Automáticos de facturas, compras con percepciones, sueldos, cobros, pagos e impuestos bancarios, con su origen; manuales y modelos; numeración sin huecos; Excel y PDF (A1). |
| Mayor y balance de sumas y saldos | **Cubierto** | Con Excel y PDF (A1). |
| Inventario y balances (libro) | **Planificado (NU-1, NU-9)** | El inventario de mercadería sale de Stock. |
| Estados contables (situación patrimonial, resultados, evolución del PN, flujo de efectivo, notas y anexos) | **Cubierto** (parcial) | Situación patrimonial y resultados, con control de cuadre, en Excel y PDF (A1). Faltan evolución del PN, flujo de efectivo, notas y anexos: **no contemplado**. |
| Cierre y reapertura de ejercicio | **Cubierto** | Refundición, cierre, apertura y bloqueo del período; reapertura con motivo, auditada (A1). |
| Ajuste por inflación contable (RT 6) | **Cubierto** | Índice FACPCE (Faro Manager, fuente configurable o carga manual; meses a mano por organización), clasificación monetaria editable, reexpresión, RECPAM, asiento en borrador, nominal vs homogéneo, papel de trabajo y tarea del Agente (A2). Método e índices "a validar" con la contadora. |
| Conciliaciones bancarias | **Cubierto / Planificado (NU-5)** | Existe; se suman tolerancias y asientos de ajuste. |
| Conciliación de cuentas de clientes y proveedores (cuentas corrientes) | **Cubierto** | Saldos y antigüedad de deudores y acreedores, en Excel y PDF (A1). |
| Bienes de uso y amortizaciones | **Cubierto** | Amortización lineal y asiento del período, sin repetir (A1). |
| Valuación de moneda extranjera y diferencias de cambio | **Cubierto** | Cuentas en dólares y asiento de diferencia de cambio en borrador (A1). |
| Previsiones (incobrables, contingencias) | **No contemplado** | |
| Sincronización con Tango, Xubio y Contabilium | **Cubierto** | Núcleo con adaptadores (A0): una fuente de verdad por área, espejo idempotente, escritura según capacidades, conflictos sin pisar y «Pasate a Faro» con control de totales. Contabilium contra simulador hasta tener credenciales. |
| Firma del balance y dictamen del auditor | **Fuera de alcance** | Matriculado (§1.b). Faro prepara la información. |

## 4. Sueldos y laboral

| Tarea | Estado | Dónde / nota |
|---|---|---|
| Legajo de empleados | **Cubierto** | F5. |
| Liquidación de haberes (mensual, quincenal, jornal) | **Cubierto** | Liquidación de sueldos (§2.q etapa 6): mensual por convenio, con novedades, re-liquidación y aprobación. |
| Convenios colectivos (escalas, categorías, adicionales) | **Cubierto** | Escalas versionadas en el Faro Manager, "a validar". |
| SAC, vacaciones, licencias, horas extra | **Cubierto** | §2.q etapa 6. |
| Liquidación final (renuncia, despido, indemnizaciones) | **Cubierto** | Criterio del contador en despidos. |
| Embargos y cuotas alimentarias sobre sueldos | **Cubierto** | Con el tope legal. |
| Recibos de sueldo con firma conforme o no conforme | **Cubierto** | F5. |
| Cargas sociales y F.931 | **Cubierto** | Archivo de importación para el F.931 (SICOSS), "a validar". |
| Libro de Sueldos Digital | **Cubierto** | Archivo LSD, "a validar". |
| Altas y bajas de empleados (Simplificación Registral / Mi Simplificación) | **No contemplado** | Habitual. El trámite es en ARCA; Faro puede guiar, recordar y guardar la constancia. |
| ART: alta, nómina y pago | **No contemplado** | |
| Seguro de vida obligatorio | **No contemplado** | |
| Aportes y contribuciones sindicales | **Cubierto** (parcial) | Dentro de los conceptos del convenio. |
| Ganancias 4.ª categoría: retenciones a empleados | **No contemplado** | Cálculo mensual y liquidación anual. |
| SIRADIG / F.572 (deducciones de los empleados) | **No contemplado** | Ligado al punto anterior. |
| Personal de casas particulares (servicio doméstico) | **No contemplado** | Régimen propio, muy común en personas humanas. |
| Novedades de personal hacia el estudio | **Cubierto** | Solicitudes tipificadas (F5). |
| Comunicación interna con empleados | **Cubierto** | F5. |
| Archivo para acreditaciones bancarias | **Cubierto** | Formato genérico (cada banco tiene el suyo, "a validar") y reporte de acreditación (A3). |
| Reportes de cierre de sueldos | **Cubierto** | Nómina, conceptos por período/área/convenio, control contra el período anterior, acreditación, costo laboral y asiento de sueldos en Excel y PDF y por el Agente (A3). |

## 5. Societario

| Tarea | Estado | Dónde / nota |
|---|---|---|
| Constitución de sociedades (SAS, SRL, SA) | **Fuera de alcance / No contemplado** | Trámite con escribano o abogado y el contador. Decidir si Faro acompaña con un checklist. |
| Libros societarios (actas, registro de acciones, asistencia) | **No contemplado** | Libros digitales en IGJ para algunos tipos. |
| Actas de asamblea y de directorio, reuniones de socios | **No contemplado** | Modelos y seguimiento. |
| Presentación de estados contables ante IGJ o la DPPJ provincial | **No contemplado** | |
| Designación y renovación de autoridades, cambios de sede | **No contemplado** | |
| Registro de beneficiarios finales | **No contemplado** | |

## 6. Facturación y comprobantes

| Tarea | Estado | Dónde / nota |
|---|---|---|
| Facturas A, B, C y E, notas de crédito y débito | **Cubierto** | F3. |
| Factura M | **Cubierto** | Con leyenda; régimen vigente «a validar» (B3). |
| Factura de Crédito Electrónica MiPyME (FCE) | **Cubierto** | A, B y C con CBU, transferencia y vencimiento; notas con marca de anulación (B3). La aceptación o el rechazo del cliente se ven en ARCA. |
| Recibos, presupuestos y remitos | **Cubierto** | No fiscales, con PDF y link; presupuesto → factura (B3). |
| Facturación recurrente y masiva por lote | **Cubierto** | Recurrentes con ajuste por IPC e interruptor «Facturar automáticamente» (B3). Lotes desde Excel, CSV o pegado, validación por fila, cola con progreso, reintentos e idempotencia, informe, ZIP y envío (B2). |
| Panel de facturación con muchas CUIT | **Cubierto** | Operación → Facturación (B1). |
| Alta de un cliente que empieza a facturar (CUIT, delegación, prueba) | **Cubierto** | Empezar a facturar en 3 pasos con factura de prueba en homologación (B10). |
| Puntos de venta y numeración desde ARCA | **Cubierto** | F3. |
| CAE y QR | **Cubierto** | F3. |
| Contingencia de ARCA caída (cola de emisión) | **Cubierto** | Cola con número previsto, emisión en orden al volver, aviso, estado de ARCA con historial (B5). |
| Comprobantes recibidos (lectura, validación y buzón de la empresa) | **Cubierto** | Operación → Buzón (B8): app, portal, WhatsApp, reenvío por mail, CSV de Mis Comprobantes de ARCA y rendiciones; CUIT receptora, CAE (WSCDC) y repetidos; computa / no computa / parcial y aprobación en lote; «Comprobantes enviados» para el cliente. |
| Constatación de CAE de terceros (WSCDC) | **Cubierto** | F6. |
| Consulta de padrón al facturar | **Cubierto** | «Completar con ARCA» en el formulario (B3). |
| Facturación de ventas de tiendas online | **Cubierto** | Facturación → Ventas de tiendas (B7): Mercado Libre, Tiendanube, Empretienda, Shopify, WooCommerce, VTEX, Mercado Pago y el local; por venta o resumen diario, borrador o emisión con el interruptor y nota de crédito en devoluciones. APIs reales «a validar» (simulador). |
| Envío de comprobantes por mail y WhatsApp | **Cubierto** | Mail; WhatsApp con link público que vence y se desactiva, en lote, por wa.me o por la API con acuses (A4). |
| Integrar la facturación con el sistema o la tienda del cliente (API) | **Cubierto** | API /api/v1 con tokens, Idempotency-Key, webhooks firmados y OpenAPI (B9); emite solo con el interruptor. |
| Facturar desde el celular por WhatsApp (texto o audio) | **Cubierto** | El Vigía por WhatsApp (B6): borrador y SÍ, o el interruptor «Facturar automáticamente». |
| Leyendas obligatorias | **Cubierto** | §2.q etapa 5. |

## 7. Vínculo con el cliente

| Tarea | Estado | Dónde / nota |
|---|---|---|
| Calendario de vencimientos por CUIT y avisos | **Cubierto** | Vencimientos (estudio) y calendario personal. |
| Pedido y recepción de documentación | **Cubierto** | Documentos y solicitudes. |
| Comunicaciones con el cliente | **Cubierto** | Mensajes, mail, avisos y WhatsApp: avisos y documentos (A4) y el Vigía por WhatsApp (B6): facturar por texto o audio con SÍ, gastos con ticket, consultas, BAJA/ALTA. |
| Honorarios: abonos, cobro, recordatorios y estado de cuenta | **Cubierto** | F7. |
| Factura del estudio por los honorarios | **Cubierto** | F7 con ARCA (F3). |
| Tareas y cartera del estudio | **Cubierto** | F9. |
| Resumen mensual al cliente | **Cubierto / Planificado (NU-3)** | Plantilla de flujo; el Agente lo amplía. |
| Consultas laborales y fiscales con borrador de IA | **Cubierto** | F9 (con aprobación del estudio). |
| Admisión, acuerdo y cierre del vínculo | **Cubierto** | Conexión con contador (§4 a §8 de principios). |
| Agenda de reuniones con el cliente | **Cubierto** | Agenda con Google Calendar y Meet (pendiente de configuración). |
| Indicadores y tableros por cliente | **Cubierto** | F9. |
| Firma de acuerdos de servicio | **Cubierto** | Flotas y conexión con contador. |

## 8. Otras tareas habituales

| Tarea | Estado | Dónde / nota |
|---|---|---|
| Certificaciones de ingresos y certificaciones contables | **Fuera de alcance** | Requieren matrícula y legalización del Consejo. Faro prepara los datos y deriva. |
| Informes para bancos (carpetas de crédito) | **No contemplado** | Armado de la carpeta con estados contables y DDJJ. |
| Trámites ante ARCA con clave fiscal | **Fuera de alcance** | Faro registra la tarea, guía y guarda la constancia. Nunca pide ni guarda la clave fiscal. |
| Delegación de servicios en ARCA (Administrador de Relaciones) | **Cubierto** (guía) | Asistente de delegación para facturar. |
| Inscripciones en registros especiales (importadores y exportadores, ROI, otros) | **No contemplado** | |
| Registro de operaciones inmobiliarias y alquileres | **No contemplado** | |
| Liquidación de impuestos de personas humanas de los dueños (Ganancias y Bienes Personales) | **No contemplado** | Ver §1. |
| Presupuesto y proyecciones financieras | **No contemplado** | Hay indicadores; no hay proyección. |
| Stock de clientes (inventario para el cierre) | **Planificado (NU-9)** | |
| Análisis con IA antes de presentar (IVA y anomalías) | **Planificado (NU-6)** | |
| Agente que resuelve tareas en varios pasos | **Planificado (NU-3)** | |

---

## Agujeros para la reunión con la contadora (no contemplado)

Ordenados por cuánto aparecen en la práctica de un estudio de pymes (estimación a confirmar):

1. **Ingresos Brutos y Convenio Multilateral** (CM03, CM05 y coeficientes), SIRCREB, y agentes de retención y percepción provinciales.
2. **Altas y bajas de empleados** (Simplificación Registral), **ART**, **Ganancias 4.ª categoría** y **SIRADIG**.
3. **DDJJ anuales de Ganancias y Bienes Personales**, de personas humanas y de sociedades, con sus anticipos.
4. **Domicilio Fiscal Electrónico**: control de notificaciones.
5. **Planes de pago y moratorias**.
6. **Retenciones y percepciones practicadas** (SICORE/SIRE) para clientes que son agentes.
7. **Personal de casas particulares**.
8. **Contabilidad completa del cierre**: previsiones y estados contables completos con notas y anexos (bienes de uso, cuentas corrientes y moneda extranjera ya están, A1).
9. **Certificado MiPyME**.
10. **Societario**: libros, actas, IGJ, beneficiarios finales.
11. **Tasas municipales e impuesto de sellos**.
12. **Informes para bancos** y **proyecciones financieras**.

Con la respuesta de la contadora, cada ítem pasa a **planificado** (con su pedido) o a **fuera de alcance**, y se actualiza esta lista.
