# Faro · visión de producto

> Faro es la plataforma de gestión para estudios contables. Te guía hacia una mejor gestión: ordena la cartera de clientes, automatiza el trabajo repetitivo y conecta al estudio con sus clientes y con los empleados de esos clientes.
>
> Estudio Cristofaro es el primer estudio que usa Faro (cliente cero). Su web pública dice que trabaja con Faro.

Este documento manda sobre `docs/brief-producto.md` en todo lo que sea plataforma, niveles, planes y módulos. El brief sigue vigente para lo que el estudio ofrece a sus clientes (organizaciones).

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

**Núcleo** (en todos los planes): estudios, organizaciones, usuarios y roles, auditoría, portal del cliente, vencimientos, documentos, solicitudes, agenda y alertas por mail.

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
- **"Necesito un contador":** botón para pedir ayuda a un estudio de Faro (Estudio Cristofaro primero), lo que genera leads para los estudios.

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
8. **F8 · Cartera y tareas**, WhatsApp y marca blanca.
