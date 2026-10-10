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
    nav: [{ href: "/admin/conexiones", label: "Conexiones" }],
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
      { href: "/admin/asistente", label: "Asistente" },
      { href: "/admin/aprobaciones", label: "Aprobaciones" },
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
    description: "Canvas visual con disparadores, condiciones y acciones, con plantillas listas para usar.",
    status: "proximamente",
    minPlan: { studio: "inicial" },
    roles: ["dueno", "contador"],
    nav: [],
    events: [],
    tools: [],
    limit: "flows",
  },
  {
    key: "payroll",
    name: "Recibos de sueldo",
    icon: "FileSignature",
    description: "Envío masivo de recibos a la nómina con firma conforme o no conforme.",
    status: "proximamente",
    minPlan: { studio: "profesional" },
    roles: ALL_STAFF,
    nav: [],
    events: ["recibo.firmado"],
    tools: [],
  },
  {
    key: "employees",
    name: "Legajo de empleados",
    icon: "IdCard",
    description: "La organización administra a sus empleados: datos, documentos, altas y bajas.",
    status: "proximamente",
    minPlan: { studio: "profesional" },
    roles: ALL_STAFF,
    nav: [],
    events: ["empleado.alta", "empleado.baja"],
    tools: [],
  },
  {
    key: "comms",
    name: "Comunicación interna",
    icon: "Megaphone",
    description: "Avisos y comunicados a los empleados de una organización con confirmación de lectura.",
    status: "proximamente",
    minPlan: { studio: "profesional" },
    roles: ALL_STAFF,
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "smart_docs",
    name: "Lectura inteligente",
    icon: "ScanText",
    description: "Extrae datos de facturas, tickets y extractos con detección de duplicados y confirmación humana.",
    status: "proximamente",
    minPlan: { studio: "inicial", personal: "autonomo_pro" },
    roles: [...ALL_STAFF, "titular"],
    nav: [],
    events: ["documento.leido"],
    tools: [],
    limit: "smartDocsPerMonth",
  },
  {
    key: "bank_rec",
    name: "Conciliación bancaria",
    icon: "Landmark",
    description: "Cruza extractos con facturas: pagadas, pendientes, pagos sin factura y comisiones.",
    status: "proximamente",
    minPlan: { studio: "avanzado" },
    roles: ["dueno", "contador"],
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "billing",
    name: "Cobranza de honorarios",
    icon: "HandCoins",
    description: "Abonos del estudio a sus clientes, facturación, recordatorios y cobro con Mercado Pago.",
    status: "proximamente",
    minPlan: { studio: "profesional" },
    roles: ["dueno"],
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "crm",
    name: "Cartera y tareas",
    icon: "KanbanSquare",
    description: "Vista tipo planilla, kanban y calendario del trabajo por cliente, con tareas recurrentes.",
    status: "proximamente",
    minPlan: { studio: "profesional" },
    roles: ALL_STAFF,
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "arca",
    name: "Integración ARCA",
    icon: "ShieldCheck",
    description: "Padrón, facturación electrónica, vencimientos según CUIT y VEP por web services oficiales.",
    status: "proximamente",
    minPlan: { studio: "profesional", personal: "autonomo_gratis" },
    roles: [...ALL_STAFF, "titular"],
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "tango",
    name: "Integración Tango (conector local)",
    icon: "Plug",
    description: "Conector instalado en la PC de Tango que sincroniza por la API Delta.",
    status: "disponible",
    minPlan: { studio: "profesional" },
    roles: ["dueno"],
    nav: [{ href: "/admin/conexiones/tango", label: "Tango" }],
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
    nav: [{ href: "/admin/conexiones/archivos", label: "Archivos" }],
    events: [],
    tools: [],
  },
  {
    key: "ai_consults",
    name: "Consultas laborales y fiscales con IA",
    icon: "MessagesSquare",
    description: "Los clientes consultan; la IA prepara la respuesta y el estudio la aprueba.",
    status: "proximamente",
    minPlan: { studio: "profesional" },
    roles: ALL_STAFF,
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "insights",
    name: "Indicadores",
    icon: "ChartLine",
    description: "Tableros financieros y de gestión por organización y del estudio.",
    status: "proximamente",
    minPlan: { studio: "avanzado" },
    roles: ["dueno", "contador"],
    nav: [],
    events: [],
    tools: [],
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
    status: "proximamente",
    minPlan: { personal: "autonomo_gratis" },
    roles: ["titular"],
    nav: [],
    events: [],
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
    nav: [{ href: "/admin/red", label: "Red de estudios" }],
    events: ["red.pedido_propuesta", "red.resena"],
    tools: [],
  },
  {
    key: "bitacora",
    name: "Bitácora",
    icon: "NotebookPen",
    core: true,
    description: "Tus finanzas personales: gastos e ingresos del mes, por categoría, cargados con el Copiloto (texto, audio o foto) o a mano. Siempre privada.",
    status: "disponible",
    minPlan: { studio: "inicial", persona: "persona_gratis", personal: "autonomo_gratis" },
    roles: [...ALL_STAFF, "titular"],
    nav: [{ href: "/bitacora", label: "Bitácora" }],
    events: [],
    tools: [],
  },
);

export const getFaroModule = (key: string) => FARO_MODULES.find((m) => m.key === key);
export const isFaroModuleKey = (k: unknown): k is FaroModuleKey => typeof k === "string" && FARO_MODULES.some((m) => m.key === k);

/** Módulos que se venden por plan (no son núcleo) */
export const PLAN_MODULES = FARO_MODULES.filter((m) => !m.core);

/** Módulo al que pertenece una herramienta del registro */
export const moduleOfTool = (tool: string) => FARO_MODULES.find((m) => m.tools.includes(tool))?.key ?? null;
