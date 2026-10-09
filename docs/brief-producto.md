# Brief funcional para desarrollo
## Plataforma de gestión contable inteligente — Estudio Cristofaro

## 1. Objetivo del producto

Construir una plataforma B2B multi-organización que conecte al Estudio Cristofaro con cada empresa cliente y centralice su operación contable, administrativa y documental.

El producto no debe sentirse como un sistema contable tradicional ni como una colección de formularios. Debe reducir carga manual, aprovechar información ya disponible en Tango y documentos, y pedir a las personas solamente validaciones, decisiones o datos que realmente falten.

La promesa para la empresa cliente es:

> Sabés qué está resuelto, qué tenés que pagar y qué viene después, con un responsable que responde y toda la información en un solo lugar.

La promesa para el estudio es:

> Administrar más organizaciones con procesos ordenados, menos carga repetida y mejor visibilidad del trabajo pendiente y la rentabilidad de cada cuenta.

## 2. Cliente objetivo inicial

Comenzar con un único segmento comercial:

- Empresas de servicios B2B de CABA y GBA.
- Entre 5 y 30 empleados aproximadamente.
- Gestionadas por sus dueños o socios.
- Sin un departamento administrativo-contable consolidado.
- Con información distribuida entre WhatsApp, correo, planillas y carpetas.
- Con necesidad recurrente de impuestos, vencimientos, documentación, sueldos y consultas.

Subsegmentos prioritarios:

1. Agencias de marketing, publicidad y comunicación.
2. Consultoras de negocios, recursos humanos o tecnología.
3. Empresas de software, desarrollo y soporte informático.
4. Estudios de arquitectura, ingeniería y diseño.

No priorizar inicialmente gastronomía, industria, grandes constructoras, importadores ni organizaciones altamente reguladas. Esos sectores agregan complejidad operativa antes de validar el modelo.

Objetivo de validación: incorporar entre 10 y 15 empresas similares antes de expandirse a otro segmento.

## 3. Modelo multi-organización

### 3.1 Jerarquía

- **Estudio:** administrador superior de la plataforma.
- **Organización:** empresa cliente con espacio, configuración y datos aislados.
- **Razón social o entidad:** uno o más CUIT asociados a una organización.
- **Miembros:** usuarios pertenecientes a la organización.

Una organización puede tener varias razones sociales, usuarios, módulos y responsables del estudio según su plan.

### 3.2 Aislamiento

- Ningún usuario puede consultar datos de otra organización.
- Todas las consultas y acciones deben validar la organización en el servidor.
- Descargar un archivo requiere sesión y permiso explícito.
- Toda acción relevante debe registrar actor, fecha, organización y resultado.

## 4. Alta y acceso de usuarios

### 4.1 Principio

No existe registro público. Toda persona entra mediante invitación.

### 4.2 Flujo inicial

1. El estudio crea la organización.
2. Carga o importa sus datos y CUIT.
3. Designa al primer **Administrador de la organización**.
4. El sistema envía una invitación a su correo.
5. La persona accede con Google o mediante enlace mágico.
6. El correo autenticado debe coincidir con el correo invitado.
7. La membresía se activa con el rol definido.
8. El administrador de la organización puede invitar al resto de su equipo.

El botón “Continuar con Google” autentica identidad, pero no habilita el registro libre. Si el correo no tiene una invitación vigente, se rechaza el acceso.

### 4.3 Métodos de acceso

- Google OAuth.
- Enlace mágico enviado al correo.
- Microsoft OAuth en una etapa posterior.
- Segundo factor obligatorio para usuarios del estudio y recomendable para roles sensibles del cliente.

### 4.4 Roles de la organización

- **Administrador:** administra miembros, roles y toda la información de la organización.
- **Dirección:** accede a reportes, indicadores e información sensible.
- **Administración:** gestiona documentos, vencimientos, pagos y solicitudes.
- **Recursos Humanos:** accede únicamente a empleados, sueldos y procesos laborales.
- **Consulta:** acceso de solo lectura a los módulos habilitados.

Reglas:

- Un administrador solo puede invitar usuarios a su organización.
- No puede otorgar permisos superiores a los propios.
- Los roles sensibles requieren confirmación del administrador o del estudio.
- El estudio puede asistir, revocar accesos y designar un nuevo administrador.
- Cada usuario debe usar una identidad individual; evitar cuentas compartidas.
- La cantidad de usuarios habilitados depende del plan contratado.

## 5. Planes comerciales

Cada organización contrata un único plan base. Puede sumar módulos existentes y servicios extraordinarios.

### 5.1 Negocio en Orden

Para pequeñas empresas que necesitan centralizar y ordenar su operación mensual.

Incluye:

- 1 razón social o CUIT.
- Hasta 5 usuarios.
- Responsable del estudio asignado.
- Calendario de obligaciones.
- Vencimientos, importes y enlaces de pago.
- Repositorio seguro de documentos.
- Carga y clasificación asistida.
- Solicitudes con seguimiento.
- Alertas automáticas.
- Resumen operativo mensual.
- Compromiso de primera respuesta en menos de 24 horas hábiles.
- Revisión trimestral.
- Activación de 1 módulo del catálogo.

Resultado: la empresa conoce qué está hecho, qué falta y qué vence.

### 5.2 Empresa en Control

Para PyMEs con más movimiento, empleados o varias personas involucradas en la administración.

Incluye todo lo anterior, más:

- Hasta 2 razones sociales o unidades vinculadas.
- Hasta 12 usuarios.
- Roles y permisos por área.
- Tablero mensual de situación.
- Reunión mensual.
- Seguimiento de documentación pendiente.
- Automatizaciones y recordatorios configurables.
- Indicadores operativos básicos.
- Atención prioritaria.
- Activación de hasta 3 módulos del catálogo.

Resultado: la dirección entiende la situación de la empresa sin reconstruirla desde correos y planillas.

### 5.3 Gestión Estratégica

Para organizaciones de mayor complejidad que necesitan información para decidir.

Incluye todo lo anterior, más:

- Hasta 5 razones sociales o unidades.
- Hasta 25 usuarios.
- Equipo de atención asignado.
- Informe mensual ejecutivo.
- Reunión mensual de dirección.
- Planificación fiscal y financiera.
- Proyecciones y alertas de desvíos.
- Indicadores personalizados.
- Automatizaciones avanzadas.
- Seguimiento quincenal de temas críticos.
- Activación de hasta 5 módulos del catálogo.

Resultado: la información contable ayuda a anticipar problemas y tomar decisiones.

### 5.4 Determinación del plan y precio

El diagnóstico debe evaluar:

- Cantidad de razones sociales y CUIT.
- Cantidad de empleados.
- Volumen mensual de comprobantes y movimientos.
- Impuestos y jurisdicciones.
- Cantidad de usuarios.
- Frecuencia de consultas.
- Nivel de reuniones y reportes requerido.
- Complejidad, riesgo y automatización necesaria.

Fórmula comercial recomendada:

> Abono base del plan + nivel de complejidad + módulos adicionales + servicios extraordinarios.

Cobrar además una implementación inicial por relevamiento, ordenamiento, migración, configuración de usuarios, módulos e integración con Tango.

## 6. Catálogo de módulos

Los módulos se desarrollan una sola vez, permanecen en el repositorio central y se habilitan por organización mediante configuración y permisos.

Catálogo inicial:

1. Sueldos y empleados.
2. Cuentas por cobrar.
3. Cuentas por pagar.
4. Flujo de fondos.
5. Documentación societaria.
6. Facturación y comprobantes.
7. Indicadores de gestión.
8. Solicitudes y novedades de personal.

### 6.1 Desarrollo personalizado

- Los planes incluyen activar y configurar módulos existentes, no construir módulos nuevos sin límite.
- Un módulo nuevo se releva y cotiza por separado.
- Si resuelve un problema común, puede incorporarse al catálogo general.
- Si es exclusivo de una organización, debe tener precio y mantenimiento propios.
- Cada módulo debe definir permisos, datos, eventos, automatizaciones y reportes.

## 7. Principios de experiencia de usuario

### 7.1 Capturar una vez

No solicitar un dato que ya exista en Tango, un documento, una integración o el historial.

### 7.2 Extraer, proponer y confirmar

Cuando una persona sube una constancia, factura, recibo o planilla, el sistema debe intentar extraer:

- CUIT y razón social.
- Tipo de documento.
- Fecha y período.
- Importe.
- Vencimiento.
- Categoría y organización correspondiente.

Luego debe mostrar una confirmación breve y permitir corregir excepciones.

### 7.3 Divulgación progresiva

- Mostrar primero lo importante.
- Evitar formularios extensos.
- Pedir información adicional solamente cuando sea necesaria.
- Priorizar bandejas de “requiere atención” sobre listados generales.
- Mantener lenguaje cotidiano para clientes y precisión técnica para el estudio.

### 7.4 Entrada en lenguaje natural

El usuario debe poder escribir mensajes como “incorporamos una empleada el lunes”. El sistema clasifica la intención, crea la solicitud adecuada y pide únicamente los datos faltantes.

## 8. Automatización e inteligencia artificial

Crear una capa de “asistente operativo del estudio”.

### 8.1 Automatizaciones

- Solicitar documentación faltante.
- Enviar recordatorios de vencimientos.
- Crear tareas recurrentes.
- Avisar cuando una solicitud necesita respuesta.
- Confirmar carga y disponibilidad de documentos.
- Escalar temas vencidos o críticos.
- Preparar y programar el resumen mensual.
- Detectar clientes sin actividad o seguimiento.

### 8.2 Asistencia con inteligencia artificial

- Clasificar documentos y solicitudes.
- Extraer datos de archivos.
- Resumir conversaciones y actividad mensual.
- Redactar borradores de respuesta.
- Generar borradores de informes.
- Detectar valores o movimientos inusuales.
- Recomendar tareas, módulos o cambios de plan.
- Identificar clientes que consumen más trabajo que el previsto.

### 8.3 Control humano

La inteligencia artificial no debe:

- Presentar impuestos.
- Confirmar cifras sensibles.
- Enviar asesoramiento profesional delicado.
- Ejecutar pagos.
- Modificar datos críticos sin aprobación.

Debe preparar propuestas para revisión. Los recordatorios rutinarios pueden enviarse automáticamente cuando exista una regla autorizada.

Toda salida asistida debe indicar su origen, permitir revisión y registrar quién la aprobó.

## 9. Integración con Tango

Tango es una fuente interna del estudio; no constituye la propuesta comercial para el cliente.

Objetivos:

- Evitar carga duplicada.
- Sincronizar empresas y clientes.
- Incorporar comprobantes, asientos u otros datos disponibles en etapas posteriores.
- Alimentar vencimientos, documentos, reportes y automatizaciones.
- Mostrar al cliente información traducida a lenguaje comprensible.

La plataforma debe seguir funcionando si Tango no está disponible, mediante importación de archivos y carga asistida. La arquitectura de fuentes debe ser intercambiable.

Cada dato sincronizado debe conservar:

- Fuente.
- Fecha de sincronización.
- Identificador externo.
- Estado de validación.
- Registro original cuando sea necesario para auditoría.

## 10. Ficha de organización en el backoffice

Debe reunir:

- Datos generales y CUIT vinculados.
- Plan contratado.
- Módulos activos.
- Usuarios, roles e invitaciones.
- Responsable y equipo del estudio.
- Integraciones y estado de sincronización.
- Vencimientos.
- Documentos.
- Solicitudes.
- Tareas recurrentes y pendientes.
- Automatizaciones activas.
- Línea de tiempo de actividad.
- Nivel de riesgo.
- Consumo operativo y rentabilidad estimada.
- Historial de cambios y aprobaciones.

## 11. Flujo de incorporación de una organización

1. Diagnóstico comercial.
2. Selección recomendada de plan y módulos.
3. Alta de organización.
4. Importación o lectura de constancias y documentación.
5. Confirmación de datos extraídos.
6. Vinculación de razones sociales y CUIT.
7. Conexión con Tango o fuente alternativa.
8. Revisión de pendientes y riesgos.
9. Designación del administrador de la organización.
10. Invitación de usuarios y asignación de roles.
11. Configuración de calendario y automatizaciones.
12. Presentación del espacio al cliente.
13. Inicio del ciclo mensual.

## 12. Prioridades de implementación

### Etapa 1 — Fundaciones

- Evolucionar “cliente” hacia “organización”.
- Permitir varias razones sociales por organización.
- Membresías con roles y permisos.
- Invitaciones administradas por la propia organización.
- Google OAuth y enlace mágico sin registro público.
- Plan contratado, límites y módulos habilitados.
- Responsable del estudio visible.
- Línea de tiempo y auditoría.

### Etapa 2 — Servicio operativo

- Onboarding guiado.
- Tareas recurrentes.
- Bandeja unificada de pendientes.
- Resumen mensual real dentro del portal.
- Reuniones y seguimientos.
- Medición del compromiso de respuesta.
- Catálogo y activación de módulos.

### Etapa 3 — Automatización

- Extracción de datos de documentos.
- Clasificación y solicitudes en lenguaje natural.
- Motor de reglas y recordatorios.
- Bandeja de aprobaciones.
- Borradores de respuestas e informes.
- Indicadores de consumo y rentabilidad.

### Etapa 4 — Profundización de Tango

- Ampliar la sincronización según la versión y APIs reales disponibles.
- Incorporar comprobantes y datos contables útiles.
- Conciliar información y marcar excepciones.
- Mantener importación por archivos como alternativa.

## 13. Criterios mínimos de aceptación

- Una organización no puede acceder a información de otra, incluso forzando identificadores o enlaces.
- El administrador de una organización puede invitar, revocar y cambiar roles de sus miembros.
- Un usuario no invitado no puede registrarse mediante Google.
- El correo autenticado debe coincidir con la invitación.
- Los permisos se validan en el servidor, no solamente en la interfaz.
- El estudio puede crear organizaciones, asignar planes, módulos y responsables.
- Los límites de usuarios, CUIT y módulos se aplican según el plan.
- Cada módulo puede habilitarse o deshabilitarse sin duplicar código.
- Los documentos se almacenan de forma privada y se descargan con autorización.
- Los datos importados muestran fuente y fecha de sincronización.
- Toda acción sensible queda registrada.
- Las sugerencias de IA requieren aprobación cuando afectan información profesional, pagos o comunicaciones sensibles.
- La experiencia móvil permite completar los recorridos principales sin fricción.

## 14. Resultado esperado del primer lanzamiento

El estudio debe poder incorporar una empresa de servicios, importar sus datos, asignarle un plan, activar módulos, designar un administrador y permitir que esa persona invite a su equipo. La empresa debe visualizar vencimientos, documentos, solicitudes y responsables sin completar información que el sistema pueda obtener de Tango o de los archivos aportados.

El primer lanzamiento no necesita automatizar toda la contabilidad. Debe demostrar tres ventajas concretas:

1. Menos carga manual.
2. Mayor visibilidad para el cliente.
3. Mejor control operativo para el estudio.
