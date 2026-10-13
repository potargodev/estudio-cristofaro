# Faro · visión de producto

> Faro es la plataforma de gestión para estudios contables. Te guía hacia una mejor gestión: ordena la cartera de clientes, automatiza el trabajo repetitivo y conecta al estudio con sus clientes y con los empleados de esos clientes.
>
> Estudio Cristofaro es el primer estudio que usa Faro (cliente cero). Su web pública dice que trabaja con Faro.

Este documento manda sobre `docs/brief-producto.md` en todo lo que sea plataforma, niveles, planes y módulos. El brief sigue vigente para lo que el estudio ofrece a sus clientes (organizaciones).

## 0. Posicionamiento

> **Principios de producto:** ver `docs/principios-producto.md` (ley conceptual de Faro: qué hace y qué nunca hace, autogestión vs. gestión profesional, el dato es del usuario y cómo se conecta un contador). Manda sobre todo lo demás.

- **Faro es una herramienta, no un estudio contable.** Nunca se presenta como un estudio ni compite con los estudios: los potencia, los automatiza y los hace evolucionar.
- **Faro es para todos, no solo para estudios.** La puerta de entrada universal es **Bitácora**, gratis, para llevar tus finanzas personales. Desde ahí cada uno escala según quién es:
  - **Persona:** Bitácora gratis. Si necesita un contador, lo encuentra en la Red Contable (§2.i), con estudios confiables, calificados, puntuados y reseñados, y lo contrata desde ahí.
  - **Autónomo:** activa Faro Personal (facturación, ARCA, semáforo de monotributo).
  - **Contador o estudio:** gestiona su cartera con Faro y conecta a sus clientes y a los empleados de sus clientes.
- **Origen:** Faro fue creado por contadores (el equipo fundador de Estudio Cristofaro), lo que le da credibilidad profesional. En la landing se cuenta en "Quiénes somos" o "Nuestra historia", nunca como si Faro fuera un estudio. En la Red Contable, Estudio Cristofaro es uno más, sin prioridad.
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
- El Faro Manager no ve datos de clientes salvo en un acceso asistido explícito, temporal y auditado. En ese acceso no puede cambiar el equipo, las credenciales de IA, Mercado Pago, los accesos MCP, las conexiones ni el plan.
- Los datos de demostración (tenants y usuarios `is_demo`) son un mundo aparte: no se cruzan con estudios ni personas reales (`docs/demo.md`).
- El equipo del estudio entra con contraseña y 2FA obligatorio en todas las pantallas y rutas con datos; los miembros de una organización, con Google o enlace por mail y solo con invitación; personas y autónomos, con Google o enlace por mail. El enlace por mail responde lo mismo para cualquier dirección (no revela qué cuentas existen).
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
| `ai` | Vigía del estudio (Asistente IA y MCP) | Chat tipo Claude/ChatGPT con caja de contexto que opera sobre toda la plataforma; en la interfaz es el **Vigía** (pestaña Asistente, §2.o). Multi-proveedor (Anthropic, OpenAI, Google, OpenRouter, modelos locales compatibles con OpenAI). Clave propia del estudio, cifrada. Las acciones de escritura requieren aprobación humana. |
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
| `agent` | Agente contable | Recibe tareas de varios pasos (cierre, IVA, conciliación, tope del monotributo, resumen mensual u otra) y las resuelve en segundo plano con plan visible, informe, borradores en Aprobaciones, rutinas y memoria (§2.q). |

Cada módulo define: clave, nombre, descripción, plan mínimo, permisos por rol, ítems de navegación, eventos que emite (para Flujos), herramientas que expone (para el Vigía) y límites de uso.

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
- El Vigía (el asistente interno) usa exactamente el mismo registro de herramientas.

**Conexiones (hub de integraciones).** El estudio conecta sus herramientas contables y las opera desde Faro. Cada conector declara su vía:

| Vía | Cuándo | Ejemplos |
|---|---|---|
| API oficial | La herramienta tiene API pública | Hoy: Xubio (REST, Client ID/Secret, lectura) y Google Drive (beta); Google Calendar en la Agenda y Gmail en la Bitácora. Próximamente en el hub: Alegra, Colppy, Contabilium, Finnegans y Odoo |
| Conector local | La herramienta corre en la PC o servidor del estudio | Tango (API Delta, solo lectura). La escritura en Tango y sus webhooks van por el enlace con la API (principios §14) |
| MCP externo | Existe un servidor MCP de la herramienta | Faro actúa como cliente MCP y suma esas herramientas al Vigía (beta; por ejemplo, el MCP comunitario de Xubio, de solo lectura) |
| Archivos | No hay API | Holistor, Bejerman y otros de escritorio: importación de exportaciones con plantillas de mapeo |
| Web services oficiales | Organismos | ARCA (con certificado digital y delegación): funciona en la pestaña ARCA de la ficha y en Faro Personal; en el hub figura como próximamente. Mercado Pago, igual: funciona en Honorarios y Plan y facturación |

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
- **Vigía en modo simple:** explica cada obligación sin jerga y responde "¿qué tengo que hacer este mes?". Nunca presenta nada solo.
- **"Necesito un contador":** abre la Red Contable (§2.i) para elegir un estudio cercano y del rubro. Genera clientes para los estudios.

**Requisito técnico de ARCA:** para facturar en nombre de cada usuario, el usuario delega el servicio web de facturación electrónica a la CUIT de Faro en el Administrador de Relaciones de ARCA (así trabajan los facturadores en la nube). Esto requiere que la empresa que opera Faro tenga CUIT, certificado digital de producción y una homologación previa. Mientras tanto, se trabaja contra el simulador y el ambiente de homologación (ver `docs/pendientes-configuracion.md`).

**Planes de Faro Personal:**

| | **Gratis** | **Pro** |
|---|---|---|
| Facturación | 30 comprobantes/mes | Ilimitada, con logo y link de pago |
| Situación con ARCA y semáforo de monotributo | ✓ | ✓ |
| Calendario y alertas | Mail | Mail y WhatsApp |
| Ingresos y gastos | Básico | Con lectura inteligente de comprobantes |
| Vigía | Consultas | Consultas y acciones con aprobación |
| Pedir ayuda a un contador | ✓ | ✓ |
| Precio de referencia | Gratis | USD 9 / mes (prueba de 30 días) |

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
  - **Vigía:** "cargá que pagué $48.000 de la cena con Juan y Ana, dividido igual".
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
- Los estudios en el plan Avanzado pueden crear y compartir sus propias plantillas dentro del estudio.

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
  - El asesoramiento de inversión personalizado es una actividad regulada (CNV, idóneos registrados). Bitácora da educación e información general y, si la persona quiere asesoramiento, la deriva a un asesor matriculado. Los asesores se encuentran en la Red Contable (§2.i), con el filtro de asesoramiento financiero.

**Conexión con el resto de Faro:**
- **Gastos compartidos:** los gastos de grupos ya cuentan en Bitácora.
- **Hogar o pareja:** finanzas compartidas con permisos (Hogar) y cajas compartidas en **Mis cajas** (principios §17 y §18).
- **Si sos autónomo:** separa lo personal de lo profesional y pasa lo deducible a Faro Personal.

**Privacidad:**
- Bitácora es siempre personal. Ni el empleador, ni la organización, ni el estudio ven nada, salvo que la persona lo comparta explícitamente.
- Los datos financieros personales se cifran.

**Modelo:**
- Bitácora gratis (1 meta activa y 2 importaciones por mes; sobres, fijos, fugas, avisos y coach para todos) y Bitácora Plus, que es cualquier plan pago del tenant (Personas · Plus, Autónomos · Pro o un plan pago de estudio): sin esos límites y con las conexiones de Gmail y Mercado Pago.
- Las organizaciones y los estudios pueden regalar Bitácora Plus a sus empleados como beneficio.

## 2.i Red Contable (directorio de doble mano)

**Nombre provisorio** (principios §15 y decisión abierta (b)); antes se llamaba «Red de estudios» y las rutas viejas redirigen a `/red-contable`. Es un marketplace de doble mano: la persona busca estudio y el estudio busca clientes (principios §15).

Cuando un autónomo, una persona con Bitácora o una empresa busca un contador, Faro le muestra un directorio neutral de los estudios y contadores que usan Faro y aceptan clientes nuevos.

- **Ficha del estudio:** nombre, foto o logo, zona y modalidad (presencial, remoto o ambas), rubros en los que se especializa (de las plantillas de §2.f), servicios, matrícula verificada, idiomas, rango de honorarios orientativo, tiempo de respuesta real medido en Faro y reseñas de clientes verificados.
- **Búsqueda:** por cercanía (ubicación o barrio), rubro, servicio, modalidad y disponibilidad. Vista de lista y de mapa.
- **Contacto:** "Pedir propuesta", "Agendar una llamada" con la agenda del estudio o "Conectar mi cuenta". La conexión es por permiso, no por copia (principios §4 a §8): admisión, acuerdo firmado por los dos, el estudio trabaja sobre los datos en vivo y la persona puede cerrar la relación con mediación.
- **Buscar clientes (el estudio):** personas, autónomos, empresas y Flotas que activan **"Disponible, busco contador"** aparecen en un listado anónimo (Comercial → Buscar clientes). El estudio contacta; recién cuando la persona acepta ve sus datos y empieza la admisión.
- **Demo aparte:** los estudios y postulantes de la demo solo se ven y se contactan entre ellos; nunca se cruzan con estudios o personas reales.
- **Neutralidad:**
  - El orden se basa solo en criterios objetivos (cercanía, coincidencia de rubro, disponibilidad, tiempo de respuesta y reseñas).
  - Estudio Cristofaro aparece como uno más, sin prioridad.
  - Si en el futuro hay ubicaciones pagas, se muestran rotuladas como "Destacado".
- **Para los estudios:** aparecer en la Red es opcional (opt-in desde su panel) y está incluido en Profesional y Avanzado. Verificación de matrícula antes de publicarse.
- **Reseñas:** solo de clientes reales del estudio en Faro, con moderación y derecho a respuesta.

## 2.j Flotas (compra colectiva de servicios contables)

> Barcos independientes que navegan juntos, guiados por el mismo faro.

Una **Flota** es un grupo informal de 3 a 20 personas que se juntan para conseguir mejores condiciones con un estudio o contador de la Red. No reemplaza a los grupos de gastos compartidos (§2.e), que siguen libres y sin requisitos para cualquier usuario.

- **Creación:** cualquier usuario (Bitácora incluida) crea la Flota e invita. Cada miembro declara su perfil: monotributista, responsable inscripto, en relación de dependencia o sin actividad.
- **Pedido de propuesta grupal:** la Flota lo publica en la Red Contable (§2.i), con la cantidad de miembros por perfil y la zona (sin datos personales). Los estudios ofertan un precio por miembro según su perfil (por ejemplo: monotributo, RI y un paquete para empleados con deducciones de Ganancias y Bienes Personales), con lo que incluye y un mínimo de miembros.
- **Contratación individual:** cada miembro acepta o no la propuesta elegida. El vínculo y la facturación son entre el estudio y cada persona, con la tarifa grupal. Al aceptar, queda como organización del estudio (con consentimiento explícito).
- **La propuesta grupal define:** servicios incluidos por perfil, precio mensual por miembro y perfil, frecuencia de pago (mensual por adelantado), mínimo de miembros, preaviso de baja (máximo 30 días, sin penalidades) y qué pasa si se baja del mínimo.
- **Acuerdo individual:** cada tripulante que acepta firma digitalmente en Faro su propio "Acuerdo de servicio" con el estudio, con las condiciones de la propuesta. No hay contrato de la Flota ni pozo común.
- **Pagos (nadie paga ni debe por otro):**
  - Cada tripulante paga solo su abono, directamente al estudio.
  - En Faro, por suscripción de Mercado Pago con débito automático a la cuenta del estudio (hecho en F7; necesita que el estudio conecte su cuenta de Mercado Pago), o por el medio que acuerde con el estudio, que lo registra.
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
- **Para Faro:** activa la Red Contable y trae clientes nuevos a los estudios en Profesional y Avanzado.

## 2.h Mapa de roles y jerarquías

| Nivel | Tipo de cuenta | Roles | Ve y gestiona |
|---|---|---|---|
| Plataforma | Faro | faro_owner, faro_support | Tenants, planes, módulos, plantillas, métricas. Datos de clientes solo en acceso asistido (que no puede cambiar equipo, credenciales, Mercado Pago, MCP, conexiones ni plan). El faro_owner, además, «Ver como…» sobre usuarios de la demo. |
| Tenant | Estudio | dueño, contador, colaborador | Su cartera de organizaciones, su equipo, IA, MCP, conexiones y flujos |
| Tenant | Personal (autónomo) | titular | Su facturación, ARCA, su organización propia |
| Organización | Cliente de un estudio | administrador, dirección, administración, RRHH, consulta | Su empresa según el rol; sus empleados (RRHH) |
| Empleado | De una organización | empleado | Sus recibos, comunicaciones, rendiciones de gastos |
| Persona | Cualquier usuario | titular | Su Bitácora y sus grupos de gastos compartidos |
| Invitado | Sin cuenta | invitado | Solo el grupo de gastos al que fue invitado |
| Flota | Grupo informal de personas | capitán, tripulante | Nombre, perfil y estado de cada miembro frente a la propuesta grupal; nunca sus finanzas |

Una misma persona puede tener varias "puertas" a la vez (por ejemplo, contador en un estudio, empleado en otra organización y titular de su Bitácora). La app muestra un selector de espacio, y cada espacio tiene su propio aislamiento.

## 2.d Tipos de usuario y beneficios (para la landing de Faro)

| Tipo | Beneficio principal |
|---|---|
| Estudios contables | Más clientes con el mismo equipo: cartera ordenada, automatizaciones, IA y portal para los clientes. |
| Contadores independientes | Un estudio entero en una sola herramienta, sin depender de planillas. |
| Autónomos (Faro Personal) | Facturar, saber cuánto pagar y no pasarte de categoría, sin ser contador. |
| Empresas (clientes de un estudio) | Ver todo a la vista: vencimientos, pagos, documentos y un responsable que responde. |
| Empleados | Recibos y comunicaciones en el celular, con firma en un toque. |

## 2.k Nombres de planes (simples, sin metáforas)

| Para | Planes |
|---|---|
| Personas (Bitácora) | Gratis · Plus |
| Autónomos (Faro Personal) | Gratis · Pro |
| Estudios y contadores | Inicial · Profesional · Avanzado |

**Precios de referencia (editables desde el Faro Manager, base en USD con conversión a ARS configurable; el usuario ve el precio en pesos):**

| Plan | USD / mes |
|---|---|
| Personas · Gratis | 0 |
| Personas · Plus | 4 |
| Autónomos · Gratis | 0 |
| Autónomos · Pro | 9 |
| Estudios · Inicial (hasta 5 organizaciones, 1 usuario; límites a confirmar) | 0 (gratis) |
| Estudios · Profesional (hasta 40) | 119 |
| Estudios · Avanzado (hasta 120) | 249 |
| Organización extra (estudios) | 2 |

Prueba gratis de 30 días en los planes pagos. Pago anual: 2 meses de regalo. Son valores de referencia: el Faro Manager los ajusta sin tocar código (Catálogo → Planes y precios). **Inicial es gratis** (decisión de modelo de negocio, `docs/principios-producto.md` §20, ya aplicada en la app): es la puerta de entrada del contador independiente; para sumar más organizaciones o usuarios se pasa a Profesional.

Los nombres de producto que la gente usa se mantienen (Faro, Bitácora, Vigía, Mis cajas, Red Contable, Flotas, Grupos de gastos). «Red Contable» es provisorio y renombrar Bitácora, Vigía o Flotas es una decisión abierta (principios, decisiones (b) y (c)). Todo lo demás se nombra por lo que es.

## 2.l Onboarding guiado y Centro de ayuda

**Onboarding por perfil:** persona (Bitácora), autónomo, estudio o contador, miembro de una organización, empleado y capitán o tripulante de una Flota.
- Una checklist de primeros pasos con progreso, tours contextuales que señalan los elementos de la pantalla, estados vacíos que invitan a dar el siguiente paso y un "¿qué hago ahora?" con el Vigía.
- Se puede desactivar cuando se quiera. Queda siempre un botón visible arriba en el menú ("Guía") para volver a activarla o retomar un paso, y el progreso se guarda por usuario y por espacio.

**Centro de ayuda (base de conocimientos):**
- Visible siempre (ícono de ayuda en el menú y en cada pantalla, con el artículo relacionado).
- Explica el qué y el para qué de todo: cada módulo, cada rol, cada plan, los flujos más comunes paso a paso y preguntas frecuentes.
- Artículos en Markdown versionados en el repo (docs/ayuda), con buscador, capturas o videos cortos, y "¿te sirvió?".
- El Vigía responde usando estos artículos y cita el artículo de donde sacó la respuesta.
- Los artículos se actualizan en el mismo commit que cambia una función.

## 2.m Vigía (la puerta de entrada de la app)

La puerta de entrada de cada persona es **su Vigía**: un chat estilo WhatsApp con su agente, arriba del Inicio personal y en la barra superior de todos los espacios. Es la forma principal de cargar información en Faro.
- **Entradas:** texto, audio (mantener para hablar), foto, captura de pantalla, PDF. Desde el celular como app instalable (PWA).
- **Decantación:** el Vigía interpreta y lo convierte en registros del panel: gastos e ingresos de Bitácora, gastos de un grupo, recordatorios, documentos. Cada interpretación aparece como una tarjeta en el chat ("Gasto $3.500 · Kiosco · Comida · hoy") con **Confirmar**, **Editar** y **Deshacer**.
- **Aprobación:** lo personal de Bitácora puede registrarse en un toque (o solo, si el usuario lo activa, siempre con Deshacer). Todo lo que afecta a otras personas (un gasto en un grupo) o es fiscal, de pagos o una comunicación sensible requiere confirmación explícita.
- **Consultas:** "¿cuánto gasté en delivery este mes?", "¿cuánto le debo a Juan?" responden con datos reales del usuario y enlazan a la pantalla.
- **Origen:** cada registro creado por el Vigía guarda el mensaje original (texto, audio, imagen), la transcripción y la fecha, y se ve desde el registro.
- **Proveedor de IA:** para personas y autónomos, Faro pone el modelo (clave de la plataforma en Faro Manager, con límite de uso por plan). Los estudios pueden usar su propia clave (§2.b).
- **WhatsApp:** hecho en F9 contra el simulador; el número real de Faro depende de la verificación de Meta (ver `docs/pendientes-configuracion.md`).

## 2.n Mensajes (chat interno entre personas)

Un chat entre personas, distinto del Vigía (que es con el agente). Es un módulo de todos los espacios, con badge de no leídos.
- **Con quién:** solo entre personas que comparten un espacio: el mismo estudio; el estudio con los usuarios de sus organizaciones; la misma organización; el mismo grupo de gastos; la misma Flota. No hay búsqueda de usuarios de toda la plataforma. Se valida en el servidor en cada acción.
- **Conversaciones:** directas (1:1) y grupales elegidas entre los contactos. Cada grupo de gastos y cada Flota tienen su conversación automática (entran y salen con el grupo). Los estudios pueden crear canales internos del equipo, solo con personas del estudio.
- **Mensajes:** texto, emojis, adjuntos (por ruta autenticada), responder a un mensaje, editar o borrar los propios, leídos («Visto») y «escribiendo…».
- **Tiempo real:** SSE con LISTEN/NOTIFY de Postgres y sondeo de respaldo. Avisos en la app (campanita) y push web de la PWA. Cada conversación se puede silenciar.
- **Seguridad y moderación:** bloquear o reportar a una persona o un mensaje, con auditoría. Bloquear impide que te escriba y oculta sus mensajes en las conversaciones compartidas. El Faro Manager no ve los mensajes; solo la copia de un mensaje reportado, y puede dejarlo o borrarlo.
- **Visual:** distinto del Vigía (burbujas rosé propias, iniciales de cada persona y sin tarjetas de IA).

## 2.o Arquitectura de navegación (esqueleto de la app)

**Problema que resuelve:** el menú del estudio llegó a unos 25 ítems en 9 grupos, con trabajo diario, configuración, lo personal y la ayuda al mismo nivel. La app se siente gigante. Este esqueleto manda sobre cualquier pantalla o módulo nuevo.

**Reglas:**
1. **Un espacio a la vez.** El menú muestra solo lo del espacio activo (Personal, el estudio, una organización, Faro Manager). Se cambia con el selector de espacio, arriba del sidebar. Lo personal (Bitácora, Grupos) no aparece dentro del espacio del estudio ni de una organización.
2. **Máximo 7 ítems principales por espacio** (9 con todos los módulos del plan), en no más de 3 grupos. Un ítem entra al menú solo si se usa todas las semanas. Lo demás va como **pestaña** dentro de una sección, en **Configuración** o en el **menú de la cuenta**.
3. **Las secciones crecen hacia adentro, no hacia el menú:** un módulo nuevo suma una pestaña o una tarjeta en una sección existente antes que un ítem nuevo.
4. **Barra superior fija y igual en todos los espacios:** Vigía (botón destacado), Mensajes (con badge), avisos (campana), ayuda "?" y la cuenta (avatar).
   - Mensajes y los avisos son globales: siguen a la persona en cualquier espacio.
   - El "?" junta todo lo de ayuda: tour de esta pantalla, Primeros pasos, Centro de ayuda e interruptor de la Guía. La ayuda sale del sidebar.
   - El menú de la cuenta tiene: Mi cuenta, Plan y facturación, Accesos MCP, tema claro/oscuro, cambiar de espacio y Salir.
5. **Un solo Vigía.** Es la misma puerta en todos los espacios y sabe dónde estás. En Personal es el chat de tus finanzas. En el estudio es el asistente del estudio, con sus herramientas y su clave. Se abre como panel lateral desde la barra superior, sin perder la pantalla, o a pantalla completa en /vigia. En el estudio, el Vigía tiene las pestañas **Asistente**, **Agente** (el Agente contable, §2.q), **Propuestas para aprobar** (las Aprobaciones, con badge en el botón) y **Automatizaciones** (Flujos).
6. **Configuración es una sola entrada**, con pestañas: Equipo y usuarios, Plan y módulos, Conexiones, IA, Rubros y plantillas, Sitio web (solo el estudio con sitio propio), Seguridad y Avanzado (marca blanca y WhatsApp del estudio, plan Avanzado).
7. **Plantilla de pantalla única:** encabezado compacto (título de 28 a 32 px, una línea de contexto, una acción principal), pestañas debajo si la sección tiene varias vistas, y contenido. Los títulos gigantes quedan para las landings.
8. **Celular:** barra inferior con 3 accesos del espacio, el Vigía al centro como botón destacado y "Más" con el resto.

**Menú de cada espacio (como está hoy, con todos los módulos hechos):**

| Espacio | Menú principal | Pestañas y lugar de lo que hoy está suelto |
|---|---|---|
| **Personal** (persona y autónomo) | Inicio · Mis cajas · Bitácora · Grupos · Contador · Facturación (autónomo) | Mis cajas = todas las cajas (personal, negocio y compartidas, principios §17); la Bitácora es la caja personal. Contador = Mi contador (la conexión) + Red Contable (Estudios y contadores · Mi postulación) + Flotas + "mi estudio" si tiene uno. Inicio = resumen del mes con el Vigía arriba. Facturación (autónomo): comprobantes, ARCA, monotributo. |
| **Estudio** | **Operación:** Inicio · Organizaciones · Vencimientos · Solicitudes · Tareas (plan con Cartera y tareas). **Negocio:** Comercial · Honorarios (plan con Cobranza). Abajo, fijo: Configuración | Comercial = Consultas + Buscar clientes (Red Contable: postulaciones y estudios, con badge de candidatos nuevos) + Agenda + Conexiones (con contadores) + Perfil en la Red. Organizaciones = ficha con pestañas (Resumen, Vencimientos, Documentos, Solicitudes, ARCA, Conciliación, Sueldos y Conexiones); las cuentas conectadas por la Red tienen su propia ficha en vivo. Contenidos del sitio y Rubros → Configuración. Flujos → pestaña "Automatizaciones" del Vigía. Lectura inteligente → dentro de Documentos. Indicadores → pestaña de Inicio y de Resumen en la ficha; Consultas con IA → dentro de Solicitudes. |
| **Organización** (portal) | Inicio · Vencimientos · Documentos · Solicitudes · Empresa | Empresa = gastos de la empresa, estado de cuenta, rendiciones, Red Contable (administrador o dirección) y módulos activos (sueldos y empleados). El Inicio suma la tarjeta Sueldos para los roles que ven sueldos. Agendar llamada y Reseñar al estudio → Inicio (tarjeta del estudio). Mi equipo → menú de la cuenta. |
| **Empleado** (portal) | Inicio · Mis recibos · Rendiciones · Grupos | Todo lo demás, oculto. |
| **Faro Manager** | Resumen · Tenants · Catálogo · Red · Plataforma | Tenants = lista + pedidos de plan + suscripciones + alta manual. Catálogo = planes y precios, módulos, plantillas, IA de la plataforma, monotributo, índices y escudo. Plataforma = auditoría, opiniones de la ayuda, mensajes reportados, uso y costos de IA, ARCA, Mercado Pago, WhatsApp y Demo (cargar y borrar la demo y «Ver como…»). |

## 2.p Facturación avanzada y canales

Facturar desde Faro tiene que ser lo más rápido del mercado para un estudio con muchas CUIT y para un autónomo desde el celular, por cualquier canal. Toda integración es un **adaptador del núcleo** (§2.q, A0). **Faro no pide ni guarda la clave fiscal**: emite con el certificado de la CUIT operadora y la delegación en ARCA.

**Regla de automatización.** Lo que llega de un canal (lote, tienda, API, WhatsApp, recurrente) queda en **borrador** salvo que el titular o su contador activen el interruptor **«Facturar automáticamente»** de esa fuente: auditado, con **pausa** y con un **resumen diario** de lo emitido. Nada fiscal sale sin una persona o sin ese interruptor (§1).

- **B1 · Panel de facturación del estudio:** todas las CUIT de la cartera en una pantalla (lo emitido en el mes, borradores, rechazos, cola, semáforo de monotributo y Libro IVA), con filtros y acceso directo a emitir por cualquier CUIT.
- **B2 · Facturación en lote:** Excel, CSV, pegar desde una planilla o desde la app; validación fila por fila antes de emitir; **cola** con progreso en vivo, reintentos e **idempotencia** (una fila nunca se emite dos veces); miles de comprobantes; informe del lote, ZIP de PDF, envío por mail o WhatsApp y reintento de los fallidos.
- **B3 · Todos los comprobantes:** A, B, C, E y M; notas de crédito y débito; **Factura de Crédito Electrónica MiPyME**; exportación; recibos; **presupuestos → factura**; remitos; **recurrentes** con ajuste por IPC; PDF con CAE y QR; link de Mercado Pago; link público (A4); **autocompletar desde el padrón**.
- **B4 · Libro IVA ventas y compras** por CUIT en Excel y en el formato de **Libro IVA Digital** («a validar»), reportes y semáforo.
- **B5 · ARCA caído:** si el web service no responde, el comprobante entra a una **cola** con un número reservado seguro (nunca dos comprobantes con el mismo número), se emite solo cuando ARCA vuelve y avisa. Estado de ARCA en vivo (FEDummy) con historial, también en el Faro Manager.
- **B6 · WhatsApp (Cloud API) con el Vigía:** facturar por texto o audio, fotos de comprobantes al buzón o a la Bitácora, gastos, consultas y avisos; plantillas de Meta, **opt-out**; simulador en `mocks/whatsapp`. Verificación de Meta: prioridad alta en pendientes.
- **B7 · Integraciones de ventas** (Mercado Libre, Tiendanube, Empretienda, Shopify, WooCommerce, VTEX, Mercado Pago y tienda física): «**ventas para facturar**», mapeo de productos con IA, regla por venta o resumen diario, el interruptor y **notas de crédito automáticas** por devoluciones.
- **B8 · Buzón de comprobantes recibidos:** llegan por la app, WhatsApp, reenvío de mail y Mis Comprobantes de ARCA; lectura, validación de la **CUIT receptora**, CAE con WSCDC, duplicados y procedencia. En el estudio, pestaña **Buzón** con contador: computa, no computa o parcial, y aprobación en lote hacia el Libro IVA, la contabilidad y los sistemas conectados. «**Mis comprobantes enviados**» para el cliente y el cruce buzón ↔ rendición de gastos.
- **B9 · API pública** `/api/v1`: tokens por tenant con permisos (scopes), límite de pedidos, `Idempotency-Key`, **webhooks** salientes y documentación OpenAPI en `/api/v1/docs`. **Prueba gratis sin tarjeta.** Página pública **/estado**.
- **B10 · Velocidad:** emitir en menos de 15 segundos desde el celular (formulario de un paso, autocompletar, atajos de teclado, medido). Alta en 3 pasos: CUIT → delegación → factura de prueba en homologación.
- **B11 · Planes:** límites generosos en `plans.ts` y acá (§3); mensajes de /faro y /faro/precios sin nombrar competidores, con «**Faro no te pide tu clave fiscal**».

## 2.q Agente contable, IA contable, sueldos y stock

**Objetivo:** que un estudio con Faro trabaje mejor que con los sistemas contables líderes de Argentina en lo que más tiempo le lleva: cerrar meses, conciliar, controlar el IVA antes de presentar, liquidar sueldos y, para sus clientes pymes, llevar un stock simple. Foco: el mundo contable y sus clientes pymes. Todo respeta el principio madre (principios §1): **Faro muestra hechos y arma borradores; el contador decide.**

**Regla fiscal.** Lo que presenta, emite, paga o comunica algo sensible queda en **Propuestas para aprobar**, salvo que el titular o su contador hayan activado esa automatización. Cada automatización es un interruptor auditado (quién, cuándo, alcance) y con pausa.

### Agente contable (distinto del Vigía)
- El **Vigía** sigue siendo la carga rápida (texto, audio, foto). El **Agente contable** es un trabajador: recibe una **tarea** y la resuelve en varios pasos, en segundo plano.
  - Ejemplos: «cerrá octubre de Agencia Norte», «revisá el crédito fiscal de todos mis clientes antes del vencimiento», «conciliá el extracto de septiembre», «¿qué clientes están cerca del tope del monotributo?», «prepará el resumen mensual para todos los clientes», «liquidá sueldos de octubre de X», «armame el inventario al 31/12 de X».
- **Cómo trabaja:** arma un **plan visible** (pasos); ejecuta con las herramientas registradas de todos los módulos (el mismo registro del Vigía y del MCP), sobre la cola de Postgres del motor de flujos; muestra el avance en vivo; se puede pausar o cancelar.
- **Resultados concretos:** un informe con hallazgos y su importancia (alta, media, baja), borradores (facturas, asientos, mensajes, presentaciones, liquidaciones), comprobantes marcados para revisar y tareas creadas. Todo lo sensible va a Aprobaciones.
- **Rutinas:** tareas programadas, por ejemplo el cierre mensual de cada cliente el día 5, la revisión de IVA 3 días antes del vencimiento, el control semanal de la conciliación o las alertas de stock bajo, con un resumen por mail, WhatsApp y la app.
- **Alcance y permisos:** trabaja sobre una organización, sobre toda la cartera del estudio o sobre la cuenta personal (autónomo), siempre con los permisos de quien lo usa.
- **Memoria por organización:** recuerda los criterios del contador (cuenta por proveedor, tratamientos especiales) y los propone la próxima vez. La memoria se ve y se edita.
- **Pantalla «Agente»:** pestaña junto al Vigía en el estudio (§2.o, regla 5), con nueva tarea (y plantillas de tareas frecuentes), tareas en curso, historial (informe y acciones de cada una), rutinas y memoria.
- **Modelos:** uno potente para planificar y analizar, configurable por estudio (clave propia) y, para personas y autónomos, desde el Faro Manager. El costo se mide por tarea y tiene tope por plan.
- El nombre «Agente contable» es provisorio y vive en un solo lugar del código.

### Lectura de comprobantes de compra (nivel superior)
- Extrae cada **ítem** (descripción, código del proveedor, cantidad, precio unitario y alícuota) y cada **percepción y retención** por tipo y jurisdicción: IVA, IIBB de cada provincia (incluida CABA), Ganancias, impuestos internos y otros tributos. Valida que la suma cierre con el total.
- **Aprendizaje por proveedor:** lo que el usuario corrige (cuenta, centro de costo, tratamiento de percepciones, alícuotas, conceptos y producto propio vinculado) queda como regla del proveedor y se propone la próxima vez, con la marca «aprendido de tus correcciones» y la opción de deshacer.
- **Precisión medida:** cuántos campos se corrigen por proveedor y cómo mejora.
- **Carga masiva** de cientos de comprobantes (PDF, fotos, ZIP, mail y WhatsApp) con cola y progreso.

### Conciliación bancaria con tolerancias y ajustes
- Tolerancias de fecha (días) y de monto (fijo o porcentaje) por cuenta bancaria. Las sugerencias dentro del margen muestran puntaje y motivo.
- Una diferencia de importe genera el **asiento de ajuste** en una cuenta configurable (redondeo, comisiones, gastos bancarios), como borrador o automático según el interruptor.
- Conciliación de uno con muchos y de muchos con uno (un pago que cubre varias facturas).

### Análisis del Libro IVA antes de presentar
- Con un clic sobre el período: crédito fiscal por proveedor, por condición frente al IVA y por alícuota, con gráficos y comparación con períodos anteriores. Lo mismo para el Libro IVA ventas.
- **Anomalías explicadas:** concentración en un proveedor, alta proporción de monotributistas, CUIT inactivas o con problemas en el padrón, CAE inválidos (WSCDC), duplicados, comprobantes fuera de período, importes atípicos para el proveedor, alícuotas incoherentes con el rubro y crédito fiscal tomado de comprobantes B o C.
- Se marcan comprobantes «a revisar» con nota, se filtran y se resuelven; un checklist dice qué falta para «listo para presentar» (un dato para el contador, nunca una validación).
- Lo puede pedir el Agente («revisá el IVA de toda la cartera») y queda como rutina.

### Leyendas y requisitos de normativa
- Un motor de **leyendas obligatorias** en los comprobantes, por jurisdicción y régimen (por ejemplo, la condición y la alícuota de ingresos brutos en facturas a consumidor final y los regímenes de transparencia fiscal vigentes). Se configura una vez en el perfil fiscal y se imprime solo.
- Cada regla cita su fuente oficial (ARCA y organismos provinciales, en especial AGIP para CABA). Lo que no se pudo verificar queda **«a validar»** en Faro Manager → Catálogo → Escudo y en los pendientes.
- El Faro Manager mantiene el catálogo y avisa a los usuarios afectados cuando cambia una norma.

### Liquidación de sueldos (módulo de sueldos completo)
- **Convenios colectivos** predeterminados (al menos 25 de los más usados: Comercio, UOCRA, Gastronómicos, Sanidad, Camioneros, Seguridad, Bancarios y otros) con categorías, básicos, adicionales y conceptos. Escalas versionadas por vigencia y mantenidas desde el Faro Manager; lo no verificado queda «a validar». Convenio propio o fuera de convenio, editable.
- **Legajos y novedades** con importación masiva (Excel o CSV y desde el legajo de F5): horas, horas extra, ausencias, licencias, vacaciones, adelantos y embargos.
- **Liquidación** mensual, SAC, vacaciones y final, con aportes y contribuciones. Duplicar un período y reliquidar con registro de cambios.
- **Recibos en PDF** (reemplazan la carga manual de F5, que sigue disponible) y publicación con firma conforme o no conforme, como en F5.
- **Exportaciones:** Libro de Sueldos Digital (formato de ARCA), archivo para el F.931 y acreditaciones bancarias. Los diseños de registro no verificados quedan «a validar».
- **Reportes:** costo laboral por empleado y por área, acreditaciones, listado de empleados y variaciones entre períodos.
- El Agente puede «liquidar octubre de X»: arma la liquidación, marca lo raro y la deja para aprobar.

### Stock simple (módulo opcional «Stock», beneficio para las organizaciones)
- Lo **activa el estudio para sus organizaciones** (comercios, distribuidoras, tiendas online, gastronomía, talleres) desde la ficha → Plan y módulos; no es una herramienta del estudio. En el portal aparece en **Empresa → Stock** (§2.o). Planes Profesional y Avanzado. Para autónomos que venden productos: **Facturación → Stock**.
- **Alcance simple, sin producción, lotes ni logística:**
  - Productos: código, código de barras opcional, descripción, unidad, alícuota de IVA, costo y precio. Importación por Excel o CSV, alta desde comprobantes de compra e importación del catálogo de las tiendas conectadas.
  - Existencias por depósito (hasta 3). Ajustes manuales con motivo (rotura, faltante, conteo), auditados. Conteo físico desde el celular, con escaneo del código de barras.
  - Alertas de stock mínimo por la app, mail y WhatsApp.
  - Valuación al último costo y a costo promedio ponderado. Inventario valuado **a una fecha** (también pasada), exportable, para el cierre; el estudio lo ve desde la ficha de la organización. Costo de mercadería vendida estimado por período.
- **Movimientos automáticos:** suman las compras confirmadas en la lectura de comprobantes; restan las ventas facturadas en Faro y las de las tiendas conectadas (Mercado Libre, Tiendanube, Empretienda, Shopify, WooCommerce, VTEX, Mercado Pago y tienda física), que llegan por webhook o sondeo y son **idempotentes** (una venta nunca descuenta dos veces). Las devoluciones y cancelaciones reponen.
- **Mapeo** de productos de proveedores y de tiendas al producto propio por código o SKU, con sugerencias de la IA y aprendizaje de lo corregido. Una venta de un producto sin vincular queda en «Ventas sin vincular» y no descuenta a ciegas.
- **Sincronización hacia las tiendas (opcional y segura):** apagada por defecto; se activa a mano por tienda y solo para productos vinculados; Faro es la única fuente de verdad y publica la existencia disponible (con margen de seguridad) cuando cambia; si la tienda informa un stock distinto al esperado no se pisa nada y queda un **conflicto** para resolver; registro de cada publicación, reintentos y pausa por tienda.
- El Vigía y el Agente responden «¿cuánto me queda de X?», «¿qué está por debajo del mínimo?», «¿qué se vendió más este mes?» y «armame el inventario al 31/12 de X».
- Las integraciones con tiendas son del pedido de **facturación avanzada**; Stock trae la base (cuentas de tienda, órdenes idempotentes, catálogo y publicación) y la facturación avanzada la reutiliza.

**Módulos nuevos** (§2): `agent` (Agente contable, Avanzado; consultas en Profesional), `payroll_calc` (Liquidación de sueldos, Profesional y Avanzado) y `stock` (Stock, Profesional y Avanzado, se activa por organización). La lectura por ítem, la conciliación con tolerancias, el análisis del Libro IVA y las leyendas amplían `smart_docs`, `bank_rec` y `arca`.

### Ampliación de §2.q · núcleo, contabilidad y lo que faltaba (octubre 2026)

§2.q ya está construida. Esta ampliación la apoya sobre el **núcleo propio con adaptadores** (principios §22 y §22.a) y suma la contabilidad general, el ajuste por inflación, los reportes de cierre, el envío por WhatsApp y la recategorización de la cartera.

#### Núcleo propio y capa de adaptadores (A0)
- **Núcleo como fuente única:** organizaciones y CUIT, clientes y proveedores, plan de cuentas y asientos, comprobantes emitidos y recibidos (ítems, alícuotas, percepciones y retenciones), cobros y pagos, bancos y movimientos, empleados y liquidaciones, productos y stock. Pantallas, Vigía, Agente, flujos y reportes trabajan siempre sobre el núcleo.
- **Interfaz única de adaptador** (`src/modules/adapters`): cada sistema declara, por entidad, si **lee, crea, modifica, anula o recibe avisos**, y qué operaciones admite: **sincronizar, publicar, reconciliar y desconectar**. Un registro de adaptadores da el estado por organización.
- **Adaptadores sobre la interfaz:** Tango (API y conector local), Xubio, archivos de Tango, Holistor y Bejerman, Google Drive, Mercado Pago, las tiendas de §2.q y **Contabilium** (nuevo, contra un simulador; la API real queda en pendientes y los archivos son el respaldo). Cómo escribir uno nuevo: `docs/adaptadores.md`.
- **Fuente de verdad por organización y por área** (contabilidad, facturación, compras, sueldos y stock): Faro o un sistema conectado, **nunca los dos**. Las tiendas y Mercado Pago alimentan una parte sin ser dueños.
- **Pantalla «Sistemas conectados»** en la ficha (Conexiones): fuente de verdad por área; por sistema, su estado, qué espeja, qué escribe, la última sincronización y los conflictos; botones Conectar, Sincronizar, Publicar, Pausar y Desconectar.
- **Espejo normalizado** con origen, ID externo, fecha, estado de validación y registro original, idempotente por ID externo. La escritura de vuelta sigue las capacidades del adaptador; lo demás queda «solo en Faro». Los **conflictos** (los dos lados cambiaron lo mismo) no se pisan: decide una persona.
- **Desconectar no pierde nada.** Asistente **«Pasate a Faro»**: conectar → traer la historia → controlar los totales contra el sistema de origen → revisar → cambiar la fuente de verdad → desconectar.

#### Contabilidad general nativa (A1)
- Plan de cuentas por organización con **plantillas por rubro** y **mapeo** a las cuentas de cada sistema conectado.
- **Asientos automáticos** desde facturas emitidas, compras (con percepciones), sueldos, cobros y pagos, y conciliación (unificados con los asientos de ajuste de la conciliación). Asientos manuales y **modelos**. Cada asiento automático guarda su origen.
- **Libro diario, mayor, balance de sumas y saldos y estados contables** (situación patrimonial y resultados), exportables a Excel y PDF.
- **Bienes de uso y amortizaciones**; **cuentas corrientes** de clientes y proveedores con antigüedad de saldos; **moneda extranjera** con diferencias de cambio.
- **Cierre y reapertura** de ejercicio con **bloqueo de períodos** (reabrir queda auditado).
- Si la fuente de verdad contable es un sistema externo, se espeja y se publica por su adaptador.

#### Ajuste por inflación contable (A2)
- Moneda homogénea según las normas contables vigentes (FACPCE); método e índices verificados con fuentes o «a validar».
- **Índices** automáticos desde una fuente configurable en Faro Manager, con carga manual de respaldo.
- Partidas **monetarias y no monetarias** con sugerencia editable, **reexpresión**, **RECPAM** y asiento de ajuste como borrador.
- Reporte **nominal y homogéneo** uno al lado del otro, en un clic, y **papel de trabajo** exportable (partida, índice, coeficiente, valor reexpresado y asiento).
- El Agente puede «ajustá por inflación el ejercicio de X».

#### Reportes de cierre de sueldos y bancos (A3)
- Reportes de la liquidación en Excel y PDF (también pedibles al Agente): listado de empleados; conceptos totalizados por período, área y convenio; control de liquidación (bruto, descuentos, aportes, contribuciones y neto, con las diferencias contra el período anterior marcadas); acreditación con banco, CBU y monto; costo laboral.
- **Asiento de sueldos** automático.
- Conciliación: identifica los **impuestos bancarios** (débitos y créditos) y las **retenciones SIRCREB** para su cómputo.

#### Enviar cualquier comprobante por WhatsApp (A4)
- Botón **«Enviar por WhatsApp»** en facturas, notas, presupuestos, remitos, recibos de cobranza, órdenes de pago, estados de cuenta, recibos de sueldo y listas de precios, con el teléfono detectado y un **link de descarga público, revocable y con vencimiento**.
- Hoy con wa.me; con el número de Meta, el mismo botón manda por la API con plantilla y acuses (elección automática). Envío en lote y registro.

#### Recategorización del monotributo de toda la cartera (A5)
- Vista del estudio con todos los monotributistas: facturación de 12 meses, parámetros (con carga rápida de los faltantes), categoría actual y sugerida, si **sube, baja, se mantiene o queda excluido**, y la nueva cuota.
- Revisión en lote, marca **«recategorizado»** con comprobante y aviso por la app, mail y WhatsApp. Recordatorio y tareas automáticas, y como tarea y rutina del Agente. Escala de Faro Manager («a validar» si no está validada). **Decide el contador.**

## 2.r Modo de servicios y simuladores (probar sin riesgo)

Cada servicio externo (ARCA, Mercado Pago, WhatsApp, mails, tiendas, Tango, Xubio, Contabilium y bancos) funciona en **Real**, **Prueba** (el ambiente de prueba oficial: homologación de ARCA, credenciales de prueba de Mercado Pago, número de prueba de WhatsApp) o **Simulador** (dentro de Faro, sin salir a internet), por espacio y por organización. Lo elige el owner de Faro en Faro Manager → Plataforma → Integraciones, auditado. La demo usa el Simulador y nunca Real; un espacio real solo usa el Simulador en staging.

- **Simuladores** (`/simuladores`, del espacio): «el otro lado» de cada servicio (tirar ARCA, cortar una respuesta, pagar un link, mandar ventas de una tienda, cargar en Xubio, Contabilium o Tango, bajar un extracto, ver los mails que no salieron) y el **teléfono de prueba** para hablar con el Vigía por WhatsApp.
- **Marca:** «Modo demostración» o «Modo prueba» arriba de todas las pantallas y «SIN VALIDEZ FISCAL» en los PDF fuera de producción. Faro nunca pide ni guarda la clave fiscal, tampoco acá.
- **Guía de prueba** para la contadora (Faro Manager → Plataforma → Guía de prueba y `docs/guia-prueba-contadora.md`): 30 recorridos con estado y comentario.

## 3. Planes de Faro (para estudios)

| | **Inicial** | **Profesional** (recomendado) | **Avanzado** |
|---|---|---|---|
| Para quién | Contador independiente que arranca | Estudio chico en crecimiento | Estudio mediano que quiere automatizar |
| Precio de referencia | Gratis | USD 119 / mes | USD 249 / mes |
| Organizaciones incluidas | Hasta 10 | Hasta 60 | Hasta 250 |
| Organización extra | — (se pasa a Profesional) | USD 2 / mes | USD 2 / mes |
| Prueba gratis | No aplica (es gratis) | 30 días | 30 días |
| Red Contable (aparecer en el directorio y buscar clientes) | — | ✓ | ✓ |
| Usuarios del estudio | Hasta 2 | Hasta 10 | Hasta 50 |
| Núcleo | ✓ | ✓ | ✓ |
| Vigía (IA) | Con clave propia, consultas | Con clave propia, consultas y acciones | Acciones avanzadas y agentes |
| Flujos | 3 activos, plantillas | 25 flujos, plantillas | Ilimitados, editor libre |
| Agente contable (§2.q) | — | 200 tareas/mes | 2.000 tareas/mes |
| Recibos, legajo y comunicación interna | — | ✓ | ✓ |
| Lectura inteligente | 100 documentos/mes | 3.000 documentos/mes | 20.000 documentos/mes |
| Cartera y tareas, Tango, ARCA | Tango por archivos | ✓ | ✓ |
| Cobranza de honorarios | — | ✓ | ✓ |
| Conciliación bancaria, indicadores, WhatsApp | — | — | ✓ |
| Marca blanca | — | — | ✓ |
| Soporte | Comunidad y mail | Mail prioritario | Dedicado |

Límites generosos (§2.p, B11, octubre 2026): no se cobra por comprobante en los planes pagos, la prueba de Profesional y Avanzado no pide tarjeta y Faro no pide la clave fiscal. Los precios son de referencia y se editan desde el Faro Manager (USD con conversión a ARS configurable); pago anual con 2 meses de regalo. Los límites y los módulos de cada plan viven en configuración, no en el código de las pantallas. El Faro Manager puede habilitar un módulo fuera del plan a un estudio puntual (override con vencimiento opcional), y queda auditado.

## 4. Marca
- Nombre: **Faro**. Concepto: la luz que te guía hacia una mejor gestión.
- Logo inicial: el isotipo circular de Estudio Cristofaro + "FARO" en mayúsculas al lado, en Bodoni Moda 800 con tracking amplio.
  - Pendiente antes de vender a otros estudios: un isotipo propio de Faro, para que no lleve el sello de otro estudio.
- Colores: los de la marca (azul noche #1c2235, rosé #a57c6d y pizarra). El "dorado" de la marca es ese rosé (oro rosa, marrón clarito), con más presencia como "luz"; no se usa un amarillo.

## 5. Dominios
- Faro: dominio propio (pendiente de elegir, por ejemplo faro + .app/.com.ar), con la landing de Faro y la app en `app.<dominio>`.
- Estudio Cristofaro: estudiocristofaro.com es su web pública (un tenant de Faro con sitio propio).
- Mientras tanto, en staging: landing de Faro en `/faro` y app en `app.estudiocristofaro.com`. Ruteo por host preparado para separar dominios sin tocar código.

## 6. Hoja de ruta

**Estado al 12 de octubre de 2026:** todas las fases están hechas. Lo que depende de terceros (certificados, credenciales, verificaciones y SMTP) funciona contra simuladores y está ordenado por prioridad en `docs/pendientes-configuracion.md`. El detalle de cada cierre está en `docs/avances.md`.

**Orden de trabajo que se siguió (octubre 2026):** MVP personal → esqueleto de navegación (§2.o) → F3 ARCA + Faro Personal → F8 Bitácora completa → F6 Lectura inteligente → F7 Cobros → F5 Empleados → F4 Flujos → F9 → principios de producto (8 etapas, `docs/brechas-principios.md`) → pulido final de experiencia (Diseño, etapas 0 a 6, `docs/auditoria-diseno.md`) → auditoría de octubre 2026 (seguridad, limpieza, rendimiento y backup). Cada módulo nuevo entra respetando §2.o.

- **MVP personal** ✅ *hecho*: Vigía (§2.m) + Bitácora básica + Grupos de gastos, operativos de punta a punta en staging, y la landing de Faro en `app.estudiocristofaro.com/faro`.
- **Esqueleto de navegación** (§2.o) ✅ *hecho*.

1. **F1 · Núcleo Faro** ✅ *hecho*: marca, cuatro niveles, Faro Manager, planes, módulos y entitlements, alta de estudios (manual y autoregistro en Inicial), landing de Faro y mención de Faro en la web de Cristofaro. Falta lo de marca y dominio propios (§4 y §5).
2. **F2 · IA, MCP y Conexiones** ✅ *hecho*: IA multi-proveedor por estudio, Vigía con caja de contexto (pestaña Asistente), servidor MCP por estudio, bandeja de aprobaciones (Propuestas para aprobar) y hub de conexiones con Tango (conector local), Xubio (lectura), Google Drive (beta), MCP externo (beta) y archivos. Alegra, Colppy, Contabilium, Finnegans y Odoo figuran como próximamente.
3. **F3 · ARCA + Faro Personal** ✅ *hecha (contra el simulador; falta el certificado real)*: web services de ARCA, facturación con PDF personalizado, situación y semáforo de monotributo, calendario personal y planes Gratis y Pro.
4. **F4 · Flujos** ✅ *hecha*: canvas, motor de ejecución y plantillas, en la pestaña «Automatizaciones» del Vigía; lo sensible pasa por Aprobaciones dentro del flujo.
5. **F5 · Empleados** ✅ *hecha*: legajo, recibos masivos con firma, comunicación interna, novedades de personal tipificadas y el portal del empleado (Mis recibos).
6. **F6 · Lectura inteligente y conciliación bancaria** ✅ *hecha (contra simuladores; falta autorizar WSCDC en la CUIT de Faro y configurar un modelo con visión)*.
7. **F7 · Cobranza de honorarios y suscripciones de Faro** (Mercado Pago) ✅ *hecha (contra el simulador; faltan las credenciales y webhooks de producción de Faro y de cada estudio)*. Incluye débito individual de flotas y links de pago en facturas de Faro Personal.
8. **F8 · Bitácora** ✅ *hecha (contra simuladores; faltan la app de Mercado Pago, la verificación de Gmail y la serie del IPC)*: captura por audio, mails, Mercado Pago, coach y metas; sobres, fijos, fugas, valores reales, importación, hogar compartido y planes Gratis y Plus.
9. **F9 · Cartera y tareas, WhatsApp y marca blanca** ✅ *hecha (WhatsApp contra el simulador; faltan la verificación de Meta, el número real y el certificado de cada dominio propio)*. Incluye consultas laborales y fiscales con IA (con aprobación del estudio), indicadores del estudio y por organización, y mapa y agenda en la Red Contable (entonces «Red de estudios»).
10. **Principios de producto** ✅ *hechos (8 etapas)*: Inicial gratis, escudo de responsabilidad, Mis cajas y sueldo del dueño, registro compartido, conexión con un contador, Red Contable de doble mano, changa en zona gris y Tango en los dos sentidos. Quedan las validaciones de un contador y la revisión legal.
11. **Pulido final de experiencia (Diseño, etapas 0 a 6)** ✅ *hecho*: herramientas (Impeccable, `PRODUCT.md`, `DESIGN.md`), diagnóstico, sistema único (`@/components/ds`, roles de texto, alturas y radios por token), pantalla por pantalla, sidebar animado, datos de demostración y Red Contable visible en todos los espacios. El recorrido de 134 pantallas a 390 y 1.440 px terminó con 0 hallazgos.
12. **Auditoría de octubre 2026** ✅ *hecha*: «Ver como…» sobre la demo, la demo y lo real separados, cabeceras de seguridad, 2FA en todas las rutas con datos del estudio, enlace mágico sin enumerar, acceso asistido acotado, tareas internas con turno, backup probado y rendimiento.

**Lo que sigue** (principios §21): reunión con los contadores de Cristofaro, conectar su Tango real y probar con 2 o 3 clientes de confianza. Antes, lo marcado «Crítico» en `docs/pendientes-configuracion.md`.
