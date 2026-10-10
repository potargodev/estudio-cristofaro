// Registro de módulos de Faro (docs/faro-producto.md §2). Cada módulo define
// clave, nombre, descripción, plan mínimo, roles que lo usan, navegación,
// eventos que emite (para Flujos), herramientas que expone (Asistente y MCP) y
// límites. Se habilitan por plan (plans.ts) con override por tenant desde el
// Faro Manager. Archivo sin "server-only".

export type FaroModuleKey =
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
  | "personal_invoicing";

export type ModuleStatus = "disponible" | "beta" | "proximamente";
export type StudioRoleKey = "admin" | "contador" | "colaborador" | "autonomo";

export interface FaroModule {
  key: FaroModuleKey;
  name: string;
  description: string;
  status: ModuleStatus;
  /** Plan mínimo de estudio (o de Faro Personal) que lo incluye */
  minPlan: { studio?: string; personal?: string };
  roles: StudioRoleKey[];
  nav: { href: string; label: string }[];
  events: string[];
  tools: string[];
  /** Clave de límite del plan que lo acota (PlanLimits) */
  limit?: "smartDocsPerMonth" | "flows" | "invoicesPerMonth";
}

const ALL_STAFF: StudioRoleKey[] = ["admin", "contador", "colaborador"];

export const FARO_MODULES: FaroModule[] = [
  {
    key: "ai",
    name: "Asistente IA",
    description: "Chat con contexto que opera sobre toda la plataforma, con la IA y la clave propia del estudio. Las acciones sensibles pasan por aprobación.",
    status: "disponible",
    minPlan: { studio: "senal", personal: "destello" },
    roles: [...ALL_STAFF, "autonomo"],
    nav: [
      { href: "/admin/asistente", label: "Asistente" },
      { href: "/admin/aprobaciones", label: "Aprobaciones" },
    ],
    events: ["aprobacion.propuesta", "aprobacion.resuelta"],
    tools: ["buscar_organizaciones", "ver_organizacion", "listar_vencimientos", "listar_solicitudes", "resumen_estudio"],
  },
  {
    key: "shared_expenses",
    name: "Gastos compartidos",
    description: "Grupos, gastos divididos, saldos y deudas simplificadas, conectados con la contabilidad.",
    status: "disponible",
    minPlan: { studio: "senal", personal: "destello" },
    roles: [...ALL_STAFF, "autonomo"],
    nav: [{ href: "/gastos", label: "Gastos compartidos" }],
    events: ["gasto.creado", "pago.registrado"],
    tools: ["crear_gasto", "consultar_saldos", "registrar_pago"],
  },
  {
    key: "flows",
    name: "Flujos",
    description: "Canvas visual con disparadores, condiciones y acciones, con plantillas listas para usar.",
    status: "proximamente",
    minPlan: { studio: "senal" },
    roles: ["admin", "contador"],
    nav: [],
    events: [],
    tools: [],
    limit: "flows",
  },
  {
    key: "payroll",
    name: "Recibos de sueldo",
    description: "Envío masivo de recibos a la nómina con firma conforme o no conforme.",
    status: "proximamente",
    minPlan: { studio: "rumbo" },
    roles: ALL_STAFF,
    nav: [],
    events: ["recibo.firmado"],
    tools: [],
  },
  {
    key: "employees",
    name: "Legajo de empleados",
    description: "La organización administra a sus empleados: datos, documentos, altas y bajas.",
    status: "proximamente",
    minPlan: { studio: "rumbo" },
    roles: ALL_STAFF,
    nav: [],
    events: ["empleado.alta", "empleado.baja"],
    tools: [],
  },
  {
    key: "comms",
    name: "Comunicación interna",
    description: "Avisos y comunicados a los empleados de una organización con confirmación de lectura.",
    status: "proximamente",
    minPlan: { studio: "rumbo" },
    roles: ALL_STAFF,
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "smart_docs",
    name: "Lectura inteligente",
    description: "Extrae datos de facturas, tickets y extractos con detección de duplicados y confirmación humana.",
    status: "proximamente",
    minPlan: { studio: "senal", personal: "guia" },
    roles: [...ALL_STAFF, "autonomo"],
    nav: [],
    events: ["documento.leido"],
    tools: [],
    limit: "smartDocsPerMonth",
  },
  {
    key: "bank_rec",
    name: "Conciliación bancaria",
    description: "Cruza extractos con facturas: pagadas, pendientes, pagos sin factura y comisiones.",
    status: "proximamente",
    minPlan: { studio: "horizonte" },
    roles: ["admin", "contador"],
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "billing",
    name: "Cobranza de honorarios",
    description: "Abonos del estudio a sus clientes, facturación, recordatorios y cobro con Mercado Pago.",
    status: "proximamente",
    minPlan: { studio: "rumbo" },
    roles: ["admin"],
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "crm",
    name: "Cartera y tareas",
    description: "Vista tipo planilla, kanban y calendario del trabajo por cliente, con tareas recurrentes.",
    status: "proximamente",
    minPlan: { studio: "rumbo" },
    roles: ALL_STAFF,
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "arca",
    name: "Integración ARCA",
    description: "Padrón, facturación electrónica, vencimientos según CUIT y VEP por web services oficiales.",
    status: "proximamente",
    minPlan: { studio: "rumbo", personal: "destello" },
    roles: [...ALL_STAFF, "autonomo"],
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "tango",
    name: "Integración Tango (conector local)",
    description: "Conector instalado en la PC de Tango que sincroniza por la API Delta.",
    status: "disponible",
    minPlan: { studio: "rumbo" },
    roles: ["admin"],
    nav: [{ href: "/admin/conexiones/tango", label: "Tango" }],
    events: ["tango.sincronizado"],
    tools: ["listar_registros_externos"],
  },
  {
    key: "tango_files",
    name: "Tango por archivos",
    description: "Importación de exportaciones de Tango y otros sistemas con plantillas de mapeo.",
    status: "disponible",
    minPlan: { studio: "senal" },
    roles: ["admin"],
    nav: [{ href: "/admin/conexiones/archivos", label: "Archivos" }],
    events: [],
    tools: ["listar_registros_externos"],
  },
  {
    key: "ai_consults",
    name: "Consultas laborales y fiscales con IA",
    description: "Los clientes consultan; la IA prepara la respuesta y el estudio la aprueba.",
    status: "proximamente",
    minPlan: { studio: "rumbo" },
    roles: ALL_STAFF,
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "insights",
    name: "Indicadores",
    description: "Tableros financieros y de gestión por organización y del estudio.",
    status: "proximamente",
    minPlan: { studio: "horizonte" },
    roles: ["admin", "contador"],
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "whatsapp",
    name: "WhatsApp",
    description: "Avisos y recepción de comprobantes por WhatsApp Business API.",
    status: "proximamente",
    minPlan: { studio: "horizonte", personal: "guia" },
    roles: ALL_STAFF,
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "white_label",
    name: "Marca blanca",
    description: "Logo, colores y dominio propio del estudio en el portal de sus clientes.",
    status: "proximamente",
    minPlan: { studio: "horizonte" },
    roles: ["admin"],
    nav: [],
    events: [],
    tools: [],
  },
  {
    key: "personal_invoicing",
    name: "Facturación (Faro Personal)",
    description: "Facturas A, B, C y E por WSFE con PDF propio, semáforo de monotributo y calendario personal.",
    status: "proximamente",
    minPlan: { personal: "destello" },
    roles: ["autonomo"],
    nav: [],
    events: [],
    tools: [],
    limit: "invoicesPerMonth",
  },
];

export const getFaroModule = (key: string) => FARO_MODULES.find((m) => m.key === key);
export const isFaroModuleKey = (k: unknown): k is FaroModuleKey => typeof k === "string" && FARO_MODULES.some((m) => m.key === k);
