// Registro de módulos de Faro (docs/faro-producto.md §2, §2.b, §2.e y §2.f).
// Cada módulo define clave, nombre, descripción, ícono, plan mínimo, permisos
// por rol, navegación, eventos que emite (para Flujos), herramientas que
// expone (Asistente y MCP: cada herramienta del registro de src/modules/tools
// pertenece a exactamente un módulo) y límites. Los módulos de núcleo están en
// todos los planes; el resto se habilita por plan (src/lib/faro/plans.ts y la
// tabla faro_plans) con override por tenant (tenant_modules) desde el Faro
// Manager. Archivo sin "server-only": lo usan la landing y la interfaz.

export type FaroModuleKey =
  | "core"
  | "connections"
  | "industries"
  | "ai"
  | "flows"
  | "payroll"
  | "employees"
  | "comms"
  | "smart_docs"
  | "bank_rec"
  | "billing"
  | "crm"
  | "arca"
  | "tango"
  | "tango_files"
  | "ai_consults"
  | "insights"
  | "whatsapp"
  | "white_label"
  | "shared_expenses"
  | "personal_invoicing"
  | "flotas"
  | "red_estudios"
  | "bitacora";

export type ModuleStatus = "disponible" | "beta" | "proximamente";
export type StudioRoleKey = "dueno" | "contador" | "colaborador" | "titular";

/** usar: lo opera; configurar: además lo configura (claves, conexiones, reglas) */
export type ModulePermission = "usar" | "configurar";

export interface FaroModule {
  key: FaroModuleKey;
  name: string;
  /** Nombre de ícono de lucide-react */
  icon: string;
  /** Núcleo: siempre activo, en todos los planes */
  core?: boolean;
  description: string;
  status: ModuleStatus;
  /** Plan mínimo de estudio (o de Faro Personal) que lo incluye */
  minPlan: { studio?: string; personal?: string; persona?: string };
  /** Quiénes lo usan; los dueños del tenant (dueno, titular) además lo configuran */
  roles: StudioRoleKey[];
  nav: { href: string; label: string }[];
  events: string[];
  tools: string[];
  /** Clave de límite del plan que lo acota (PlanLimits) */
  limit?: "smartDocsPerMonth" | "flows" | "invoicesPerMonth";
}

const ALL_STAFF: StudioRoleKey[] = ["dueno", "contador", "colaborador"];

export const FARO_MODULES: FaroModule[] = [
  {
    key: "core",
    name: "Núcleo",
    icon: "Building2",
    core: true,
    description: "Organizaciones, usuarios y roles, portal del cliente, vencimientos, documentos, solicitudes, agenda, consultas y auditoría.",
    status: "disponible",
    minPlan: { studio: "inicial" },
    roles: ALL_STAFF,
    nav: [
      { href: "/admin/organizaciones", label: "Organizaciones" },
      { href: "/admin/vencimientos", label: "Vencimientos" },
      { href: "/admin/solicitudes", label: "Solicitudes" },
    ],
    events: ["organizacion.creada", "vencimiento.creado", "documento.subido", "solicitud.creada", "solicitud.respondida", "reserva.creada"],
    tools: [
      "buscar_organizaciones",
      "ver_organizacion",
      "listar_vencimientos",
      "crear_vencimiento",
      "listar_documentos",
      "leer_documento",
      "listar_solicitudes",
      "ver_solicitud",
      "crear_solicitud",
      "responder_solicitud",
      "ver_agenda",
      "proponer_horarios",
      "listar_consultas",
      "mover_consulta",
      "resumen_estudio",
    ],
  },
  {
    key: "connections",
    name: "Conexiones",
    icon: "PlugZap",
    core: true,
    description: "Hub de integraciones: API oficiales (Xubio, Google), conector local (Tango), MCP externos y archivos, con datos trazables.",
    status: "disponible",
    minPlan: { studio: "inicial", personal: "autonomo_gratis" },
    roles: ["dueno", "contador", "colaborador", "titular"],
    nav: [{ href: "/admin/configuracion/conexiones", label: "Conexiones" }],
    events: ["conexion.sincronizada"],
    tools: ["listar_registros_externos", "resumen_comprobantes"],
  },
  {
    key: "industries",
    name: "Ecosistemas por industria",
    icon: "Factory",
    core: true,
    description: "Plantillas de rubro con actividades, perfil impositivo, laboral, calendario, checklist, plan de cuentas, categorías y tareas.",
    status: "disponible",
    minPlan: { studio: "inicial", personal: "autonomo_gratis" },
    roles: ["dueno", "contador", "titular"],
    nav: [],
    events: ["plantilla.aplicada"],
    tools: ["listar_rubros", "obligaciones_tipicas_rubro", "vista_previa_plantilla_rubro", "aplicar_plantilla_rubro"],
  },
  {
    key: "ai",
    name: "Asistente IA y MCP",
    icon: "Bot",
    core: true,
    description: "Chat con contexto que opera sobre toda la plataforma, con la IA y la clave propia del estudio. Las acciones sensibles pasan por aprobación.",
    status: "disponible",
    minPlan: { studio: "inicial", personal: "autonomo_gratis" , persona: "persona_gratis" },
    roles: [...ALL_STAFF, "titular"],
    nav: [
      { href: "/admin/vigia?tab=asistente", label: "Vigía · Asistente" },
      { href: "/admin/vigia?tab=propuestas", label: "Propuestas para aprobar" },
      { href: "/admin/mcp", label: "Accesos MCP" },
    ],
    events: ["aprobacion.propuesta", "aprobacion.resuelta"],
    tools: ["buscar_ayuda", "leer_articulo_ayuda"],
  },
  {
    key: "shared_expenses",
    name: "Grupos de gastos",
    icon: "Wallet",
    core: true,
    description: "Grupos, gastos divididos, saldos y deudas simplificadas, conectados con la contabilidad.",
    status: "disponible",
    minPlan: { studio: "inicial", personal: "autonomo_gratis" , persona: "persona_gratis" },
    roles: [...ALL_STAFF, "titular"],
    nav: [{ href: "/grupos", label: "Grupos de gastos" }],
    events: ["gasto.creado", "pago.registrado"],
    tools: ["listar_grupos_gastos", "crear_gasto", "dividir_gasto", "consultar_saldos", "registrar_pago"],
  },
  {
    key: "flows",
    name: "Flujos",
    icon: "Workflow",
    description: "Canvas visual con disparadores (eventos de los módulos, horario, webhook o pedido al Vigía), condiciones y acciones (herramientas, avisos, mails, tareas, solicitudes, aprobaciones y esperas), con motor en cola, reintentos y registro de cada corrida. Plantillas listas.",
    status: "disponible",
    minPlan: { studio: "inicial" },
    roles: ["dueno", "contador"],
    // §2.o: pestaña «Automatizaciones» del Vigía
    nav: [{ href: "/admin/vigia?tab=automatizaciones", label: "Vigía → Automatizaciones" }],
    events: [],
    tools: ["listar_flujos", "ejecutar_flujo", "proponer_flujo", "continuar_flujo", "recordar_vencimiento", "pedir_documentacion", "enviar_resumen_mensual"],
    limit: "flows",
  },
  {
    key: "payroll",
    name: "Recibos de sueldo",
    icon: "FileSignature",
    description: "Carga masiva de recibos (un PDF por empleado o uno único dividido por CUIL), asignación automática con revisión, publicación con aviso y firma conforme / no conforme con constancia (fecha, hora, IP, dispositivo y hash). Recordatorios a quien no firmó.",
    status: "disponible",
    minPlan: { studio: "profesional" },
    roles: ALL_STAFF,
    // §2.o: pestaña Sueldos de la ficha; portal: Empresa → Sueldos y empleados; empleado: Mis recibos
    nav: [{ href: "/admin/organizaciones", label: "Organización → Sueldos → Recibos" }, { href: "/portal/recibos", label: "Mis recibos (empleado)" }],
    events: ["recibo.publicado", "recibo.firmado", "recibo.no_conforme", "recibo.sin_firmar"],
    tools: ["estado_recibos", "recordar_firma_recibos"],
  },
  {
    key: "employees",
    name: "Legajo de empleados",
    icon: "IdCard",
    description: "Legajo de cada empleado (datos, documentos, altas, bajas e historial) y novedades de personal (altas, bajas, licencias y horas extra) como solicitudes tipificadas al estudio.",
    status: "disponible",
    minPlan: { studio: "profesional" },
    roles: ALL_STAFF,
    nav: [{ href: "/admin/organizaciones", label: "Organización → Sueldos → Legajo" }],
    events: ["empleado.alta", "empleado.baja", "novedad.informada"],
    tools: ["listar_empleados"],
  },
  {
    key: "comms",
    name: "Comunicación interna",
    icon: "Megaphone",
    description: "Comunicados de la organización (o del estudio en su nombre) a todos o por área, con adjuntos, aviso en la campanita y por mail, y confirmación de lectura.",
    status: "disponible",
    minPlan: { studio: "profesional" },
    roles: ALL_STAFF,
    nav: [{ href: "/admin/organizaciones", label: "Organización → Sueldos → Comunicados" }],
    events: ["comunicado.enviado", "comunicado.leido"],
    tools: ["publicar_comunicado"],
  },
  {
    key: "smart_docs",
    name: "Lectura inteligente",
    icon: "ScanText",
    description: "Lee facturas, tickets y extractos con IA (CUIT, comprobante, fecha, importes, IVA, percepciones y CAE), valida contra ARCA, detecta duplicados y deja todo en «Para confirmar». Exporta a planilla por cuenta (CSV/XLSX), Tango y Xubio.",
    status: "disponible",
    minPlan: { studio: "inicial", personal: "autonomo_pro" },
    roles: [...ALL_STAFF, "titular"],
    // §2.o: dentro de Documentos (ficha de la organización), Facturación → Recibidos (autónomo) y Bitácora → Importar → Tickets
    nav: [{ href: "/admin/organizaciones", label: "Organización → Documentos → Lectura inteligente" }, { href: "/facturacion/recibidos", label: "Facturación → Recibidos" }, { href: "/bitacora/tickets", label: "Bitácora → Tickets" }],
    events: ["documento.leido", "documento.confirmado", "documento.duplicado"],
    tools: ["leer_comprobante", "comprobantes_para_confirmar"],
    limit: "smartDocsPerMonth",
  },
  {
    key: "bank_rec",
    name: "Conciliación bancaria",
    icon: "Landmark",
    description: "Importa extractos y los cruza con facturas: pagadas, pendientes, pagos sin factura, comisiones e impuestos bancarios y pagos en tránsito. Sugerencias con confirmación humana y reglas guardables.",
    status: "disponible",
    minPlan: { studio: "avanzado" },
    roles: ["dueno", "contador"],
    // §2.o: pestaña Conciliación de la ficha de la organización
    nav: [{ href: "/admin/organizaciones", label: "Organización → Conciliación" }],
    events: ["conciliacion.extracto_importado", "conciliacion.movimiento_conciliado", "conciliacion.pago_sin_factura"],
    tools: ["estado_conciliacion"],
  },
  {
    key: "billing",
    name: "Cobranza de honorarios",
    icon: "HandCoins",
    description: "Abonos por organización con ajuste periódico (porcentaje o IPC), factura del estudio por ARCA, link de pago de Mercado Pago, recordatorios escalonados y estado de cuenta en el portal.",
    status: "disponible",
    minPlan: { studio: "profesional" },
    roles: ["dueno", "contador"],
    // §2.o: ítem Honorarios del grupo Negocio; en el portal, Empresa → Estado de cuenta
    nav: [{ href: "/admin/honorarios", label: "Honorarios" }],
    events: ["honorarios.cargo_generado", "honorarios.pagado", "honorarios.vencido", "suscripcion.pago_fallido"],
    tools: ["estado_de_cuenta", "cobros_pendientes", "enviar_cobro"],
  },
  {
    key: "crm",
    name: "Cartera y tareas",
    icon: "KanbanSquare",
    description: "Tareas del equipo por cliente en tabla, kanban y calendario, con responsables, estados y vencimientos; las de cada vencimiento se generan y se cierran solas.",
    status: "disponible",
    minPlan: { studio: "profesional" },
    roles: ALL_STAFF,
    // §2.o: ítem Tareas del grupo Operación
    nav: [{ href: "/admin/tareas", label: "Tareas" }],
    events: ["tarea.creada"],
    tools: ["listar_tareas", "crear_tarea"],
  },
  {
    key: "arca",
    name: "Integración ARCA",
    icon: "ShieldCheck",
    description: "Constancia de inscripción, facturación electrónica (WSFEv1), semáforo de monotributo y calendario según CUIT, por web services oficiales con certificado y delegación.",
    status: "disponible",
    minPlan: { studio: "profesional", personal: "autonomo_gratis" },
    roles: [...ALL_STAFF, "titular"],
    // §2.o: en el estudio es la pestaña ARCA de la ficha de organización; en Personal, Facturación
    nav: [
      { href: "/admin/organizaciones", label: "Organizaciones → ARCA" },
      { href: "/facturacion", label: "Facturación" },
    ],
    events: ["factura.emitida", "factura.rechazada", "arca.padron_consultado", "monotributo.cerca_del_tope"],
    tools: ["preparar_factura", "listar_comprobantes", "situacion_monotributo", "situacion_arca"],
    limit: "invoicesPerMonth",
  },
  {
    key: "tango",
    name: "Integración Tango (conector local)",
    icon: "Plug",
    description: "Conector instalado en la PC de Tango que sincroniza por la API Delta.",
    status: "disponible",
    minPlan: { studio: "profesional" },
    roles: ["dueno"],
    nav: [{ href: "/admin/configuracion/conexiones/tango", label: "Tango" }],
    events: ["tango.sincronizado"],
    tools: [],
  },
  {
    key: "tango_files",
    name: "Tango por archivos",
    icon: "FileSpreadsheet",
    description: "Importación de exportaciones de Tango y otros sistemas con plantillas de mapeo.",
    status: "disponible",
    minPlan: { studio: "inicial" },
    roles: ["dueno"],
    nav: [{ href: "/admin/configuracion/conexiones/archivos", label: "Archivos" }],
    events: [],
    tools: [],
  },
  {
    key: "ai_consults",
    name: "Consultas laborales y fiscales con IA",
    icon: "MessagesSquare",
    description: "Los clientes hacen consultas laborales o impositivas desde el portal; la IA prepara la respuesta y una persona del estudio la revisa y la aprueba antes de enviarla.",
    status: "disponible",
    minPlan: { studio: "profesional" },
    roles: ALL_STAFF,
    // §2.o: dentro de Solicitudes (filtro "Respuestas de la IA para revisar"); en el portal, al crear una solicitud
    nav: [{ href: "/admin/solicitudes?ia=1", label: "Solicitudes → Respuestas de la IA" }],
    events: ["consulta_ia.preparada"],
    tools: ["listar_consultas_ia", "preparar_respuesta_consulta", "enviar_respuesta_consulta"],
  },
  {
    key: "insights",
    name: "Indicadores",
    icon: "ChartLine",
    description: "Tableros financieros y de gestión del estudio y de cada organización: facturación, cobranza de honorarios, vencimientos a término, solicitudes y tareas.",
    status: "disponible",
    minPlan: { studio: "avanzado" },
    roles: ["dueno", "contador"],
    // §2.o: pestaña Indicadores de Inicio y de Resumen en la ficha de la organización
    nav: [
      { href: "/admin?tab=indicadores", label: "Inicio → Indicadores" },
      { href: "/admin/organizaciones", label: "Organizaciones → Resumen → Indicadores" },
    ],
    events: [],
    tools: ["indicadores_estudio", "indicadores_organizacion"],
  },
  {
    key: "whatsapp",
    name: "WhatsApp",
    icon: "MessageCircle",
    description: "Avisos y recepción de comprobantes por WhatsApp Business API.",
    status: "proximamente",
    minPlan: { studio: "avanzado", personal: "autonomo_pro" },
    roles: ALL_STAFF,
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "white_label",
    name: "Marca blanca",
    icon: "Palette",
    description: "Logo, colores y dominio propio del estudio en el portal de sus clientes.",
    status: "proximamente",
    minPlan: { studio: "avanzado" },
    roles: ["dueno"],
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "personal_invoicing",
    name: "Facturación (Faro Personal)",
    icon: "Receipt",
    description: "Facturas A, B, C y E por WSFE con PDF propio, semáforo de monotributo y calendario personal.",
    status: "disponible",
    minPlan: { personal: "autonomo_gratis" },
    roles: ["titular"],
    nav: [{ href: "/facturacion", label: "Facturación" }],
    events: ["factura.emitida"],
    tools: [],
    limit: "invoicesPerMonth",
  },
];

// Módulos sumados en la etapa de Red de estudios, Flotas y Bitácora
FARO_MODULES.push(
  {
    key: "flotas",
    name: "Flotas",
    icon: "Sailboat",
    core: true,
    description: "Grupos informales de 3 a 20 personas que contratan juntos un estudio de la Red, cada uno con su acuerdo y su abono.",
    status: "disponible",
    minPlan: { personal: "autonomo_gratis", persona: "persona_gratis" },
    roles: ["titular"],
    nav: [{ href: "/flotas", label: "Flotas" }],
    events: ["flota.creada", "flota.propuesta", "flota.acuerdo_firmado"],
    tools: [],
  },
  {
    key: "red_estudios",
    name: "Red de estudios",
    icon: "Network",
    description: "Aparecé en el directorio neutral de estudios de Faro, recibí pedidos de propuesta y reseñas de clientes verificados.",
    status: "disponible",
    minPlan: { studio: "profesional" },
    roles: ["dueno", "contador"],
    nav: [{ href: "/admin/comercial/red", label: "Red de estudios" }],
    events: ["red.pedido_propuesta", "red.resena"],
    tools: [],
  },
  {
    key: "bitacora",
    name: "Bitácora",
    icon: "NotebookPen",
    core: true,
    description: "Tus finanzas personales: movimientos, sobres, gastos fijos y suscripciones, fugas, metas, valores reales (inflación y dólar MEP), importación de resúmenes, conexiones con Mercado Pago y Gmail (Plus), hogar compartido y coach en el Vigía. Siempre privada. Gratis: 1 meta y 2 importaciones por mes; Plus (planes pagos): sin límite y con conexiones.",
    status: "disponible",
    minPlan: { studio: "inicial", persona: "persona_gratis", personal: "autonomo_gratis" },
    roles: [...ALL_STAFF, "titular"],
    // Espacio Personal (§2.o): ítem Bitácora con pestañas Movimientos · Sobres · Fijos · Metas · Importar · Conexiones · Hogar
    nav: [{ href: "/bitacora", label: "Bitácora" }],
    events: ["bitacora.fijo_por_vencer", "bitacora.fuga_detectada", "bitacora.sobre_excedido", "bitacora.importacion_confirmada", "bitacora.resumen_semanal"],
    tools: ["crear_movimiento", "consultar_bitacora", "coach_finanzas"],
  },
);

export const getFaroModule = (key: string) => FARO_MODULES.find((m) => m.key === key);
export const isFaroModuleKey = (k: unknown): k is FaroModuleKey => typeof k === "string" && FARO_MODULES.some((m) => m.key === k);

/** Módulos que se venden por plan (no son núcleo) */
export const PLAN_MODULES = FARO_MODULES.filter((m) => !m.core);

/** Módulo al que pertenece una herramienta del registro */
export const moduleOfTool = (tool: string) => FARO_MODULES.find((m) => m.tools.includes(tool))?.key ?? null;
