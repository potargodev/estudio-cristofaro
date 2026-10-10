# Faro · visión de producto

> Faro es la plataforma de gestión para estudios contables. Te guía hacia una mejor gestión: ordena la cartera de clientes, automatiza el trabajo repetitivo y conecta al estudio con sus clientes y con los empleados de esos clientes.
>
> Estudio Cristofaro es el primer estudio que usa Faro (cliente cero). Su web pública dice que trabaja con Faro.

Este documento manda sobre `docs/brief-producto.md` en todo lo que sea plataforma, niveles, planes y módulos. El brief sigue vigente para lo que el estudio ofrece a sus clientes (organizaciones).

## 0. Posicionamiento

- **Faro es una herramienta, no un estudio contable.** Nunca se presenta como un estudio ni compite con los estudios: los potencia, los automatiza y los hace evolucionar.
- **Faro es para todos, no solo para estudios.** La puerta de entrada universal es **Bitácora**, gratis, para llevar tus finanzas personales. Desde ahí cada uno escala según quién es:
  - **Persona:** Bitácora gratis. Si necesita un contador, lo encuentra en la Red de estudios Faro (§2.i), con estudios confiables, calificados, puntuados y reseñados, y lo contrata desde ahí.
  - **Autónomo:** activa Faro Personal (facturación, ARCA, semáforo de monotributo).
  - **Contador o estudio:** gestiona su cartera con Faro y conecta a sus clientes y a los empleados de sus clientes.
- **Origen:** Faro fue creado por contadores (el equipo fundador de Estudio Cristofaro), lo que le da credibilidad profesional. En la landing se cuenta en "Quiénes somos" o "Nuestra historia", nunca como si Faro fuera un estudio. En la Red de estudios, Estudio Cristofaro es uno más, sin prioridad.
- **Mensaje madre:** "Faro: tu gestión y tus finanzas, a la vista. Para personas, autónomos y estudios contables."

## 1. Niveles (multi-tenant de cuatro capas)

| Nivel | Quién | Qué hace |
|---|---|---|
| **Faro Manager** | El equipo de Faro (superadmin) | Crea y administra estudios, asigna planes, libera módulos, ve métricas de uso y facturación, da soporte (acceso asistido con auditoría). |
| **Estudio** (tenant) | Estudios contables y contadores independientes | Administra su cartera: crea organizaciones, asigna responsables, configura la IA, arma flujos y usa los módulos de su plan. |
| **Organización** | Las empresas clientes del estudio | Ven vencimientos, documentos y solicitudes; administran a sus miembros y a sus empleados. |
| **Empleado** | Personas que trabajan en una organización | Reciben y firman recibos de sueldo, ven comunicaciones internas y su legajo. |

Reglas:
- Aislamiento total entre estudios y, dentro de un estudio, entre organizaciones. Toda query valida el nivel en el servidor.
- El Faro Manager no ve datos de clientes salvo en un acceso asistido explícito, temporal y auditado.
- Roles por nivel:
  - Faro: owner, soporte.
  - Estudio: dueño, contador, colaborador.
  - Organización: administrador, dirección, administración, RRHH, consulta (ya implementados).
  - Empleado: empleado.

## 2. Núcleo y módulos

**Núcleo** (en todos los planes): estudios, organizaciones, usuarios y roles, auditoría, portal del cliente, vencimientos, documentos, solicitudes, agenda, alertas por mail y gastos compartidos (§2.e).

**Módulos** (registro en código, habilitados por plan y con override por estudio desde Faro Manager):

| Clave | Módulo | Qué resuelve |
|---|---|---|
| `ai` | Asistente IA | Chat tipo Claude/ChatGPT con caja de contexto que opera sobre toda la plataforma. Multi-proveedor (Anthropic, OpenAI, Google, OpenRouter, modelos locales compatibles con OpenAI). Clave propia del estudio, cifrada. Las acciones de escritura requieren aprobación humana. |
| `flows` | Flujos | Canvas visual tipo n8n/Make: disparadores, condiciones y acciones, con plantillas listas para usar. |
| `payroll` | Recibos de sueldo | Envío masivo de recibos a la nómina (cientos de empleados en pocos pasos), notificación y firma conforme / no conforme con registro. |
| `employees` | Legajo de empleados | La organización administra a sus empleados: datos, documentos, altas y bajas. |
| `comms` | Comunicación interna | La organización (o el estudio en su nombre) publica avisos y comunicados a sus empleados, con confirmación de lectura. |
| `smart_docs` | Lectura inteligente | Extrae datos de facturas PDF, fotos de tickets y extractos (CUIT, razón social, fecha, importes, alícuotas) a planillas por cuenta, con detección de duplicados y confirmación humana. |
| `bank_rec` | Conciliación bancaria | Cruza extractos con facturas: pagadas, pendientes, pagos sin factura, comisiones y pagos en tránsito. |
| `billing` | Cobranza de honorarios | Abonos del estudio a sus clientes, facturación, recordatorios de pago automáticos y cobro (Mercado Pago). |
| `crm` | Cartera y tareas | Vista tipo planilla con múltiples vistas (tabla, kanban, calendario) del trabajo por cliente, tareas recurrentes por obligación y delegación en el equipo. |
| `arca` | Integración ARCA | Constancia y padrón por CUIT, facturación electrónica, vencimientos según CUIT y links de pago (VEP). Siempre por los web services oficiales con certificado digital y delegación, nunca por scraping. |
| `tango` | Integración Tango | Conector y simulador (ya implementados) más importación de archivos. |
| `ai_consults` | Consultas laborales y fiscales con IA | Los clientes consultan; la IA prepara la respuesta y el estudio la revisa y aprueba antes de enviarla. |
| `insights` | Indicadores | Tableros financieros y de gestión por organización y del estudio. |
| `whatsapp` | WhatsApp | Avisos y recepción de comprobantes por WhatsApp Business API. |
| `white_label` | Marca blanca | Logo, colores y dominio propio del estudio en el portal de sus clientes. |

Cada módulo define: clave, nombre, descripción, plan mínimo, permisos por rol, ítems de navegación, eventos que emite (para Flujos), herramientas que expone (para el Asistente IA) y límites de uso.

## 2.b IA, MCP y conexiones (en todos los planes)

**IA configurable.** Todo estudio, en cualquier plan, puede configurar sus propias inteligencias artificiales:
- Proveedores: Anthropic, OpenAI, Google, OpenRouter, Azure OpenAI y modelos locales compatibles con OpenAI (Ollama, LM Studio).
- Claves propias cifradas, modelo por defecto y modelo por tarea (chat, extracción de documentos, redacción).
- Límites de gasto y registro de uso.
- Los planes cambian el alcance (qué puede hacer la IA), no la posibilidad de configurarla.

**Faro como servidor MCP.** Cada estudio puede crear desde su panel un acceso MCP para operar Faro desde Claude, ChatGPT u otros clientes MCP:
- Endpoint MCP remoto (Streamable HTTP) del estudio, con OAuth 2.1 o tokens de acceso con alcances (lectura / escritura por módulo y por organización), vencimiento y revocación.
- Las herramientas salen del registro de módulos: cada módulo expone las suyas, con los permisos del rol que creó el acceso.
- Toda llamada queda en la auditoría. Las acciones sensibles (fiscales, pagos, comunicaciones a clientes) no se ejecutan directo: crean una propuesta en la bandeja de aprobaciones.
- El Asistente IA interno usa exactamente el mismo registro de herramientas.

**Conexiones (hub de integraciones).** El estudio conecta sus herramientas contables y las opera desde Faro. Cada conector declara su vía:

| Vía | Cuándo | Ejemplos |
|---|---|---|
| API oficial | La herramienta tiene API pública | Xubio (REST, OAuth2 con Client ID/Secret, planes empresa y emprendedor), Alegra (REST), Colppy, Contabilium, Finnegans, Odoo (JSON-RPC), Mercado Pago, Google (Drive, Calendar, Gmail) |
| Conector local | La herramienta corre en la PC o servidor del estudio | Tango (API Delta, ya implementado) |
| MCP externo | Existe un servidor MCP de la herramienta | Faro actúa como cliente MCP y suma esas herramientas al Asistente (por ejemplo, el MCP comunitario de Xubio, de solo lectura) |
| Archivos | No hay API | Holistor, Bejerman y otros de escritorio: importación de exportaciones con plantillas de mapeo |
| Web services oficiales | Organismos | ARCA (con certificado digital y delegación) |

Reglas de las conexiones:
- Se configuran a nivel estudio y se mapean por organización: cada cliente puede tener su propia cuenta en la herramienta.
- Las credenciales van cifradas.
- Todo dato que entra guarda fuente, fecha, ID externo, estado de validación y registro original.
- Las escrituras hacia sistemas fiscales (crear comprobantes, presentar) siempre pasan por aprobación humana.
- La disponibilidad real de cada API (planes del proveedor, recursos) se verifica al implementar cada conector.

## 2.c Faro Personal (autónomos sin contador)

Para el monotributista o responsable inscripto que lleva sus números solo, ya sea porque arranca o porque desconfía de las malas experiencias con contadores. Faro le allana el camino: le dice qué tiene que hacer, cuándo y cuánto, en palabras simples.

**Tipo de cuenta:** un tenant de tipo `personal` (los estudios son tipo `studio`), con una sola razón social: la propia. Puede, cuando quiera, invitar a un estudio de Faro a acompañarlo (comparte sus datos con consentimiento explícito y revocable). Así un autónomo que crece se convierte en cliente de un estudio sin cambiar de herramienta.

**Funciones:**
- **Facturación electrónica con ARCA:** facturas A, B, C y E, notas de crédito y débito, por WSFE. El PDF lo genera Faro, así que se puede personalizar con logo, colores y datos de contacto, manteniendo todo lo obligatorio (CAE, vencimiento del CAE y código QR según la normativa vigente). Envío por mail o WhatsApp, link de pago (Mercado Pago) y clientes y productos frecuentes.
- **Mi situación con ARCA:** constancia de inscripción y datos del padrón (categoría, actividades, impuestos) por web service oficial.
- **Semáforo de monotributo:** facturación de los últimos 12 meses vs. el tope de la categoría, cuánto podés facturar sin pasarte, aviso de recategorización (enero y julio) con la categoría sugerida, alerta de exclusión y simulación de pase a responsable inscripto. Las escalas de categorías las mantiene el Faro Manager.
- **Lo que no tiene web service oficial** (deuda en cuenta corriente, multas, intimaciones): Faro no lo inventa. Ofrece chequeos guiados (qué revisar en ARCA, con el link directo y un paso a paso en lenguaje simple), la carga de lo que el usuario ve y recordatorios periódicos. Si ARCA habilita un servicio oficial, se integra.
- **Calendario personal:** vencimientos según CUIT y régimen (monotributo, IIBB, autónomos, IVA y Ganancias si es RI), con alertas por mail y WhatsApp y el importe cuando se puede calcular.
- **Ingresos y gastos:** registro simple, comprobantes de compra (con lectura inteligente) y un resumen mensual "cuánto entró, cuánto salió, cuánto es para impuestos".
- **Asistente IA en modo simple:** explica cada obligación sin jerga y responde "¿qué tengo que hacer este mes?". Nunca presenta nada solo.
- **"Necesito un contador":** abre la Red de estudios Faro (§2.i) para elegir un estudio cercano y del rubro. Genera clientes para los estudios.

**Requisito técnico de ARCA:** para facturar en nombre de cada usuario, el usuario delega el servicio web de facturación electrónica a la CUIT de Faro en el Administrador de Relaciones de ARCA (así trabajan los facturadores en la nube). Esto requiere que la empresa que opera Faro tenga CUIT, certificado digital de producción y una homologación previa. Mientras tanto, se trabaja en el ambiente de homologación.

**Planes de Faro Personal:**

| | **Destello** (gratis) | **Guía** |
|---|---|---|
| Facturación | 10 comprobantes/mes | Ilimitada, con logo y link de pago |
| Situación con ARCA y semáforo de monotributo | ✓ | ✓ |
| Calendario y alertas | Mail | Mail y WhatsApp |
| Ingresos y gastos | Básico | Con lectura inteligente de comprobantes |
| Asistente IA | Consultas | Consultas y acciones con aprobación |
| Pedir ayuda a un contador | ✓ | ✓ |
| Precio | Gratis | $[precio] / mes |

## 2.e Grupos de gastos (núcleo, para todos los tipos de usuario)

En la interfaz se llaman **Grupos de gastos**: libres, gratis y sin requisitos. No confundir con las Flotas (§2.j), que son para contratar un estudio en conjunto.

Inspirado en Splitwise, pero conectado con la contabilidad: lo que se reparte también queda registrado donde corresponde.

- **Grupos:** socios de una empresa, equipo de trabajo, oficina o cowork compartido, un proyecto, un viaje de trabajo o un grupo personal. Cualquier usuario de Faro (estudio, autónomo, organización o empleado) puede crear grupos e invitar por mail o link, incluso a personas sin cuenta, como invitados.
- **Gastos:** quién pagó (uno o varios), monto, fecha, categoría, comprobante adjunto (con lectura inteligente que completa los datos) y comentarios.
- **Formas de repartir:** en partes iguales, por porcentaje, por partes (por ejemplo 2:1), por montos exactos o por ítem del ticket.
- **Moneda:** pesos y dólares (u otras), con la cotización del día elegible (oficial, MEP o manual) y saldo convertido.
- **Saldos y deudas simplificadas:** quién le debe a quién, con el mínimo de transferencias posible.
- **Saldar:** registrar el pago, o pagar con link de Mercado Pago o con el alias o CVU del acreedor; confirmación de ambas partes.
- **Gastos recurrentes:** alquiler, servicios o suscripciones que se cargan solos cada mes.
- **Recordatorios amables** de saldos pendientes, configurables.
- **Mejoras sobre Splitwise:**
  - **Rendición de gastos de empleados:** el empleado paga, sube el ticket y la empresa aprueba y reintegra. Queda como gasto de la organización.
  - **Socios:** aportes y retiros entre socios, con el saldo de cada uno.
  - **Contabilidad:** un gasto marcado "de la empresa" o "deducible" pasa a los gastos de la organización o del autónomo, con su comprobante, y lo ve el estudio.
  - **Asistente IA:** "cargá que pagué $48.000 de la cena con Juan y Ana, dividido igual".
  - **Exportación** a planilla y resumen del grupo.

## 2.f Ecosistemas por industria (plantillas preconfiguradas)

Cuando un estudio, un contador o un autónomo se da de alta, y cada vez que se crea una organización, se elige uno o varios rubros. Faro precarga la configuración típica de esa industria antes de conectar nada. Todo queda editable, y el profesional decide qué aplica.

**Qué trae cada plantilla de rubro:**
- **Actividades sugeridas:** códigos de actividad de ARCA (CLAE/NAES) más comunes.
- **Perfil impositivo típico:** IVA (general, exento o alícuotas habituales), Ingresos Brutos (local o Convenio Multilateral), regímenes de retención y percepción frecuentes, y regímenes especiales o beneficios a revisar.
- **Laboral:** convenio colectivo habitual, categorías y conceptos típicos de liquidación.
- **Calendario de obligaciones** propio del rubro (además del general por CUIT).
- **Checklist de alta del cliente:** documentación a pedir.
- **Plan de cuentas modelo** con las cuentas específicas del rubro.
- **Categorías de ingresos y gastos** para la lectura inteligente y los gastos compartidos.
- **Tareas recurrentes** del estudio para ese cliente.
- **Flujos sugeridos** (plantillas de Flujos activables).
- **Indicadores clave** del rubro para el tablero.
- **Alertas y riesgos frecuentes** (por ejemplo, liquidación de divisas en exportación de servicios).

**Rubros iniciales:** servicios profesionales; agencias de marketing y comunicación; software y exportación de servicios; arquitectura, ingeniería y diseño; consultoras; comercio minorista; gastronomía; construcción; salud y profesionales médicos; transporte y logística; e-commerce; autónomos de oficios.

**Reglas:**
- Las plantillas son datos versionados: archivos en el repo, editables desde Faro Manager. No van en el código de las pantallas.
- Cada plantilla tiene un estado (borrador / validada por un profesional) y quién la validó. Las que estén en borrador se muestran como "sugerencia a revisar".
- Al aplicar una plantilla se guarda qué versión se aplicó. Si la plantilla se actualiza, el estudio ve las diferencias y elige qué incorporar; nunca se pisan sus cambios.
- El contenido técnico (alícuotas, convenios, regímenes) lo valida un contador antes de marcarlo como validado. Estudio Cristofaro es el primer validador.
- La IA puede proponer ajustes a una plantilla para un cliente puntual, siempre con aprobación.
- Los estudios en Horizonte pueden crear y compartir sus propias plantillas dentro del estudio.

## 2.g Bitácora (finanzas personales)

> "Tu plata, como un diario de viaje." La bitácora es el registro que lleva un barco de cada día de travesía; el faro le marca el rumbo.

Módulo de finanzas personales de Faro, disponible para cualquier persona: usuarios que solo quieren esto, autónomos, empleados de organizaciones y miembros de estudios. Además, es **la puerta de entrada de Faro**: una persona puede usar solo Bitácora y, si un día empieza a facturar, activar Faro Personal en la misma cuenta, y después sumar a un estudio. Una app, varias puertas: el inicio se adapta a lo que cada uno tiene activo.

**Principio rector: cero fricción.** Si hay que cargar a mano, la gente abandona. Bitácora se alimenta sola y solo pregunta cuando duda.

**Captura sin esfuerzo:**
- **Audio o texto al agente:** "me compré un alfajor en el kiosco" (desde la app, con un botón de mantener para hablar, o por WhatsApp o Telegram). El agente transcribe, detecta monto, comercio, categoría, fecha y medio de pago, y lo registra. Solo pregunta si algo es ambiguo.
- **Foto del ticket o la factura:** lectura inteligente.
- **Mails:** conexión con Gmail (o una dirección propia para reenviar) que detecta facturas de servicios (luz, gas, agua, internet, telefonía), suscripciones (streaming, apps) y resúmenes de tarjeta.
- **Mercado Pago:** conexión con la cuenta propia para leer los movimientos.
- **Bancos y tarjetas:** importación de resúmenes PDF o CSV. En la app de Android, lectura opcional de notificaciones de las apps bancarias. Cuando exista finanzas abiertas reguladas en Argentina, conexión directa.
- **Sueldo automático:** si la persona es empleada de una organización en Faro, su recibo de sueldo alimenta sus ingresos. Si no, lo carga una vez y se repite.
- **Gastos fijos y suscripciones:** se detectan solos (alquiler, expensas, servicios, plataformas), con aviso de vencimiento, de renovación y de aumentos de precio.

**Inteligencia:**
- **Tablero simple:** cuánto entró, cuánto salió, cuánto queda para el mes y en qué se fue, en pesos y en valores reales (ajustados por inflación), con opción en dólares (MEP).
- **Presupuesto automático** por categorías ("sobres") a partir de los primeros meses, ajustable.
- **Fugas:** detecta en qué y cuándo se desordena cada uno (delivery de noche, el fin de semana después de cobrar, suscripciones olvidadas) y avisa antes de que pase, no después.
- **Metas** (viaje, fondo de emergencia, un objetivo puntual) con ahorro sugerido por semana.
- **Resumen semanal de un minuto:** el domingo, por la app o WhatsApp, en texto o audio.
- **Coach de finanzas:** el agente de Bitácora explica, aconseja hábitos y compara alternativas generales para el ahorro (plazo fijo, fondos money market, dólar MEP) con fines educativos.
  - El asesoramiento de inversión personalizado es una actividad regulada (CNV, idóneos registrados). Bitácora da educación e información general y, si la persona quiere asesoramiento, la deriva a un asesor matriculado. Los asesores se encuentran en la Red de estudios Faro (§2.i), con el filtro de asesoramiento financiero.

**Conexión con el resto de Faro:**
- **Gastos compartidos:** los gastos de grupos ya cuentan en Bitácora.
- **Hogar o pareja:** finanzas compartidas con permisos.
- **Si sos autónomo:** separa lo personal de lo profesional y pasa lo deducible a Faro Personal.

**Privacidad:**
- Bitácora es siempre personal. Ni el empleador, ni la organización, ni el estudio ven nada, salvo que la persona lo comparta explícitamente.
- Los datos financieros personales se cifran.

**Modelo:**
- Bitácora gratis (captura por audio limitada al mes) y Bitácora Plus (captura ilimitada, WhatsApp, conexiones de mail y Mercado Pago, coach y metas).
- Las organizaciones y los estudios pueden regalar Bitácora Plus a sus empleados como beneficio.

## 2.i Red de estudios Faro (directorio)

Cuando un autónomo, una persona con Bitácora o una empresa busca un contador, Faro le muestra un directorio neutral de los estudios y contadores que usan Faro y aceptan clientes nuevos.

- **Ficha del estudio:** nombre, foto o logo, zona y modalidad (presencial, remoto o ambas), rubros en los que se especializa (de las plantillas de §2.f), servicios, matrícula verificada, idiomas, rango de honorarios orientativo, tiempo de respuesta real medido en Faro y reseñas de clientes verificados.
- **Búsqueda:** por cercanía (ubicación o barrio), rubro, servicio, modalidad y disponibilidad. Vista de lista y de mapa.
- **Contacto:** "Pedir propuesta" o "Agendar una llamada" con la agenda del estudio. Al aceptar, la persona comparte sus datos con consentimiento explícito y revocable, y pasa a ser organización del estudio sin migrar nada.
- **Neutralidad:**
  - El orden se basa solo en criterios objetivos (cercanía, coincidencia de rubro, disponibilidad, tiempo de respuesta y reseñas).
  - Estudio Cristofaro aparece como uno más, sin prioridad.
  - Si en el futuro hay ubicaciones pagas, se muestran rotuladas como "Destacado".
- **Para los estudios:** aparecer en la Red es opcional (opt-in desde su panel) y está incluido en Rumbo y Horizonte. Verificación de matrícula antes de publicarse.
- **Reseñas:** solo de clientes reales del estudio en Faro, con moderación y derecho a respuesta.

## 2.j Flotas (compra colectiva de servicios contables)

> Barcos independientes que navegan juntos, guiados por el mismo faro.

Una **Flota** es un grupo informal de 3 a 20 personas que se juntan para conseguir mejores condiciones con un estudio o contador de la Red. No reemplaza a los grupos de gastos compartidos (§2.e), que siguen libres y sin requisitos para cualquier usuario.

- **Creación:** cualquier usuario (Bitácora incluida) crea la Flota e invita. Cada miembro declara su perfil: monotributista, responsable inscripto, en relación de dependencia o sin actividad.
- **Pedido de propuesta grupal:** la Flota lo publica en la Red de estudios (§2.i), con la cantidad de miembros por perfil y la zona (sin datos personales). Los estudios ofertan un precio por miembro según su perfil (por ejemplo: monotributo, RI y un paquete para empleados con deducciones de Ganancias y Bienes Personales), con lo que incluye y un mínimo de miembros.
- **Contratación individual:** cada miembro acepta o no la propuesta elegida. El vínculo y la facturación son entre el estudio y cada persona, con la tarifa grupal. Al aceptar, queda como organización del estudio (con consentimiento explícito).
- **La propuesta grupal define:** servicios incluidos por perfil, precio mensual por miembro y perfil, frecuencia de pago (mensual por adelantado), mínimo de miembros, preaviso de baja (máximo 30 días, sin penalidades) y qué pasa si se baja del mínimo.
- **Acuerdo individual:** cada tripulante que acepta firma digitalmente en Faro su propio "Acuerdo de servicio" con el estudio, con las condiciones de la propuesta. No hay contrato de la Flota ni pozo común.
- **Pagos (nadie paga ni debe por otro):**
  - Cada tripulante paga solo su abono, directamente al estudio.
  - En Faro, por suscripción de Mercado Pago con débito automático a la cuenta del estudio (cuando esté la integración, F7), o por el medio que acuerde con el estudio, que lo registra.
  - Cada tripulante ve en "Mis servicios" su estado de cuenta con el estudio: al día, próximo vencimiento o pendiente.
- **Irse:**
  - **Salir de la Flota** no rescinde el acuerdo con el estudio: lo mantiene con la tarifa grupal hasta el próximo cambio de condiciones, o lo da de baja.
  - **Dar de baja el acuerdo:** se hace desde "Mis servicios", con el preaviso pactado. Antes de confirmar, Faro muestra la liquidación final: períodos pagados, si queda algo pendiente y la fecha de fin del servicio.
  - No se puede quedar debiendo sin saberlo: si hay un saldo pendiente, se muestra en la baja y se puede pagar ahí mismo.
- **Vigencia:** el precio grupal se mantiene mientras se cumpla el mínimo de miembros. Si no se cumple, el estudio avisa con 30 días de anticipación antes de pasar a su tarifa normal.
- **Informalidad explícita:** una Flota no es una sociedad ni una entidad legal, no implica actividad, patrimonio ni responsabilidad compartida, y nunca se la llama "sociedad". Cada miembro mantiene su CUIT, sus obligaciones y su responsabilidad. Se muestra un aviso claro al crearla y al unirse.
- **Gobierno de la Flota:**
  - **Capitán:** quien la crea. Invita y quita miembros, publica el pedido de propuesta, edita el nombre y puede transferir el rol. Si se va, el rol pasa al miembro más antiguo, o la Flota vota.
  - **Tripulantes:** el resto de los miembros. Pueden salir cuando quieran.
- **Espacio de la Flota (compartido por todos sus miembros):**
  - Nombre, imagen y descripción.
  - Lista de miembros con nombre, perfil y estado (invitado, activo, aceptó la propuesta).
  - Propuestas recibidas en una tabla comparativa, con votación no vinculante para elegir cuál considerar.
  - Conversación interna y línea de tiempo.
  - Todos ven quién pertenece a la Flota. Nadie ve las finanzas de nadie.
- **Nombres:** libres, pero sin palabras que sugieran un tipo legal ("S.A.", "Sociedad Anónima", "SRL", "SAS", "Sociedad", "Cooperativa", "Asociación civil", "Fundación" y similares). Si alguien las usa, la app las rechaza con una explicación amable. El nombre siempre se muestra con la etiqueta "Flota · grupo informal".
- **Privacidad:** los miembros solo ven el nombre, el perfil y el estado de cada uno respecto de la propuesta. Nunca sus finanzas.
- **Para el estudio:** un bloque de clientes con perfiles similares, ideal para estandarizar trabajo. Los estudios fijan libremente sus precios.
- **Para Faro:** activa la Red de estudios y trae clientes nuevos a los estudios en Rumbo y Horizonte.

## 2.h Mapa de roles y jerarquías

| Nivel | Tipo de cuenta | Roles | Ve y gestiona |
|---|---|---|---|
| Plataforma | Faro | faro_owner, faro_support | Tenants, planes, módulos, plantillas, métricas. Datos de clientes solo en acceso asistido. |
| Tenant | Estudio | dueño, contador, colaborador | Su cartera de organizaciones, su equipo, IA, MCP, conexiones y flujos |
| Tenant | Personal (autónomo) | titular | Su facturación, ARCA, su organización propia |
| Organización | Cliente de un estudio | administrador, dirección, administración, RRHH, consulta | Su empresa según el rol; sus empleados (RRHH) |
| Empleado | De una organización | empleado | Sus recibos, comunicaciones, rendiciones de gastos |
| Persona | Cualquier usuario | titular | Su Bitácora y sus grupos de gastos compartidos |
| Invitado | Sin cuenta | invitado | Solo el grupo de gastos al que fue invitado |
| Flota | Grupo informal de personas | creador, miembro | Nombre, perfil y estado de cada miembro frente a la propuesta grupal; nunca sus finanzas |

Una misma persona puede tener varias "puertas" a la vez (por ejemplo, contador en un estudio, empleado en otra organización y titular de su Bitácora). La app muestra un selector de espacio, y cada espacio tiene su propio aislamiento.

## 2.d Tipos de usuario y beneficios (para la landing de Faro)

| Tipo | Beneficio principal |
|---|---|
| Estudios contables | Más clientes con el mismo equipo: cartera ordenada, automatizaciones, IA y portal para los clientes. |
| Contadores independientes | Un estudio entero en una sola herramienta, sin depender de planillas. |
| Autónomos (Faro Personal) | Facturar, saber cuánto pagar y no pasarte de categoría, sin ser contador. |
| Empresas (clientes de un estudio) | Ver todo a la vista: vencimientos, pagos, documentos y un responsable que responde. |
| Empleados | Recibos y comunicaciones en el celular, con firma en un toque. |

## 3. Planes de Faro (para estudios)

| | **Señal** | **Rumbo** (recomendado) | **Horizonte** |
|---|---|---|---|
| Para quién | Contador independiente que arranca | Estudio chico en crecimiento | Estudio mediano que quiere automatizar |
| Precio | Gratis | $[precio] / mes | $[precio] / mes |
| Organizaciones | Hasta 5 | Hasta 60 | Ilimitadas |
| Usuarios del estudio | 1 | Hasta 5 | Hasta 25 |
| Núcleo | ✓ | ✓ | ✓ |
| Asistente IA | Con clave propia, consultas | Con clave propia, consultas y acciones | Acciones avanzadas y agentes |
| Flujos | 1 plantilla activa | 10 flujos, plantillas | Ilimitados, editor libre |
| Recibos, legajo y comunicación interna | — | ✓ | ✓ |
| Lectura inteligente | 30 documentos/mes | 1.000 documentos/mes | 10.000 documentos/mes |
| Cartera y tareas, Tango, ARCA | Tango por archivos | ✓ | ✓ |
| Cobranza de honorarios | — | ✓ | ✓ |
| Conciliación bancaria, indicadores, WhatsApp | — | — | ✓ |
| Marca blanca | — | — | ✓ |
| Soporte | Comunidad y mail | Mail prioritario | Dedicado |

Los límites y los módulos de cada plan viven en configuración, no en el código de las pantallas. El Faro Manager puede habilitar un módulo fuera del plan a un estudio puntual (override con vencimiento opcional), y queda auditado.

## 4. Marca
- Nombre: **Faro**. Concepto: la luz que te guía hacia una mejor gestión.
- Logo inicial: el isotipo circular de Estudio Cristofaro + "FARO" en mayúsculas al lado.
  - Pendiente antes de vender a otros estudios: un isotipo propio de Faro, para que no lleve el sello de otro estudio.
- Colores: los de la marca (azul noche, rosé, dorado #c8a465), con más presencia del dorado como "luz".

## 5. Dominios
- Faro: dominio propio (pendiente de elegir, por ejemplo faro + .app/.com.ar), con la landing de Faro y la app en `app.<dominio>`.
- Estudio Cristofaro: estudiocristofaro.com es su web pública (un tenant de Faro con sitio propio).
- Mientras tanto, en staging: landing de Faro en `/faro` y app en `app.estudiocristofaro.com`. Ruteo por host preparado para separar dominios sin tocar código.

## 6. Hoja de ruta
1. **F1 · Núcleo Faro:** marca, cuatro niveles, Faro Manager, planes, módulos y entitlements, alta de estudios (manual y autoregistro en Señal), landing de Faro y mención de Faro en la web de Cristofaro.
2. **F2 · IA, MCP y Conexiones:** configuración de IA multi-proveedor, Asistente con caja de contexto, servidor MCP por estudio, bandeja de aprobaciones, hub de conexiones (Xubio, Alegra y Google primero; Tango migrado al hub).
3. **F3 · ARCA + Faro Personal:** web services de ARCA (homologación primero), facturación con PDF personalizado, situación y semáforo de monotributo, calendario personal y planes Destello y Guía.
4. **F4 · Flujos:** canvas, motor de ejecución y plantillas.
5. **F5 · Empleados:** legajo, recibos masivos con firma y comunicación interna.
6. **F6 · Lectura inteligente** y conciliación bancaria.
7. **F7 · Cobranza** de honorarios y suscripciones de Faro (Mercado Pago).
8. **F8 · Bitácora** (finanzas personales): captura por audio, mails, Mercado Pago, coach y metas.
9. **F9 · Cartera y tareas**, WhatsApp y marca blanca.
