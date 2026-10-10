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
2. **F2 · Asistente IA:** multi-proveedor, caja de contexto y herramientas con aprobación.
3. **F3 · Flujos:** canvas, motor de ejecución y plantillas.
4. **F4 · Empleados:** legajo, recibos masivos con firma y comunicación interna.
5. **F5 · Lectura inteligente** y conciliación bancaria.
6. **F6 · ARCA**, cobranza de honorarios y suscripciones de Faro.
7. **F7 · Cartera y tareas**, WhatsApp y marca blanca.
