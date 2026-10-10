// Onboarding guiado (docs/faro-producto.md §2.l): checklist de primeros pasos
// por perfil y tours cortos por pantalla. Este archivo no toca la base: lo usan
// el servidor (detección de pasos) y el cliente (tours y panel "Guía").

export type OnboardingProfile =
  | "persona"
  | "autonomo"
  | "estudio_dueno"
  | "estudio_equipo"
  | "org_dueno"
  | "org_administracion"
  | "empleado"
  | "capitan"
  | "tripulante";

export type SpaceType = "tenant" | "organization" | "fleet";

export interface ChecklistStep {
  key: string;
  title: string;
  text: string;
  href: string;
  /** Artículo del centro de ayuda que lo explica */
  help?: string;
}

export const PROFILE_LABEL: Record<OnboardingProfile, string> = {
  persona: "Tu cuenta personal",
  autonomo: "Autónomo",
  estudio_dueno: "Dueño del estudio",
  estudio_equipo: "Equipo del estudio",
  org_dueno: "Dueño de la organización",
  org_administracion: "Administración",
  empleado: "Empleado",
  capitan: "Capitán de la Flota",
  tripulante: "Tripulante de la Flota",
};

/** Cada paso se marca solo cuando la persona hace la acción real (ver server.ts) */
export const CHECKLISTS: Record<OnboardingProfile, ChecklistStep[]> = {
  persona: [
    { key: "grupo", title: "Creá tu primer grupo de gastos", text: "Un viaje, la casa o la oficina: dividí sin hacer cuentas.", href: "/grupos/nuevo", help: "grupos-de-gastos/crear-un-grupo" },
    { key: "gasto", title: "Cargá un gasto", text: "Con foto del ticket si querés. Faro calcula quién le debe a quién.", href: "/grupos", help: "grupos-de-gastos/cargar-gastos" },
    { key: "invitar", title: "Sumá a alguien al grupo", text: "Puede entrar sin crear cuenta, con un enlace.", href: "/grupos", help: "grupos-de-gastos/invitar" },
    { key: "red", title: "Mirá la Red de estudios", text: "Si algún día necesitás un contador, compará estudios verificados.", href: "/red", help: "red-de-estudios/buscar-un-estudio" },
  ],
  autonomo: [
    { key: "datos", title: "Confirmá tu CUIT y régimen", text: "Con eso armamos tu calendario de vencimientos.", href: "/personal", help: "primeros-pasos/registro" },
    { key: "grupo", title: "Creá un grupo de gastos", text: "Con socios o clientes. Lo deducible queda marcado para tu contabilidad.", href: "/grupos/nuevo", help: "grupos-de-gastos/crear-un-grupo" },
    { key: "gasto_actividad", title: "Marcá un gasto de tu actividad", text: "Al cargar un gasto, tildá «es de mi actividad» o «deducible».", href: "/grupos", help: "grupos-de-gastos/cargar-gastos" },
    { key: "asistente", title: "Probá el asistente", text: "Preguntale por tus gastos o tus vencimientos.", href: "/admin/asistente", help: "ia/ia-y-aprobaciones" },
    { key: "red", title: "Conocé la Red de estudios", text: "Para cuando quieras que un contador lleve tus números.", href: "/red", help: "red-de-estudios/buscar-un-estudio" },
  ],
  estudio_dueno: [
    { key: "seguridad", title: "Activá el segundo factor", text: "Es obligatorio en el estudio: manejan datos de clientes.", href: "/admin/seguridad", help: "primeros-pasos/registro" },
    { key: "organizacion", title: "Creá tu primera organización", text: "Un cliente del estudio, con sus CUIT y su rubro.", href: "/admin/organizaciones/nueva", help: "organizaciones/invitaciones" },
    { key: "rubro", title: "Aplicá la plantilla de un rubro", text: "Carga obligaciones, documentos y tareas típicas de una vez.", href: "/admin/organizaciones", help: "organizaciones/rubros" },
    { key: "vencimientos", title: "Cargá vencimientos", text: "El calendario fiscal de tus clientes, con alertas.", href: "/admin/vencimientos", help: "vencimientos/calendario" },
    { key: "cliente", title: "Invitá a un cliente al portal", text: "Entra con Google o con un enlace, solo con invitación.", href: "/admin/organizaciones", help: "organizaciones/invitaciones" },
    { key: "equipo", title: "Sumá a tu equipo", text: "Contadores y colaboradores, cada uno con su rol.", href: "/admin/usuarios", help: "organizaciones/roles" },
  ],
  estudio_equipo: [
    { key: "seguridad", title: "Activá el segundo factor", text: "Es obligatorio para entrar al estudio.", href: "/admin/seguridad", help: "primeros-pasos/registro" },
    { key: "organizacion_abierta", title: "Abrí la ficha de una organización", text: "Ahí está todo: datos, vencimientos, documentos y solicitudes.", href: "/admin/organizaciones", help: "organizaciones/roles" },
    { key: "vencimientos_vistos", title: "Revisá los vencimientos", text: "Lo que vence esta semana, por organización y responsable.", href: "/admin/vencimientos", help: "vencimientos/calendario" },
    { key: "solicitud", title: "Respondé una solicitud", text: "Las consultas y pedidos de los clientes llegan a la bandeja.", href: "/admin/solicitudes", help: "solicitudes/solicitudes" },
    { key: "asistente", title: "Probá el asistente", text: "Propone; una persona aprueba lo sensible.", href: "/admin/asistente", help: "ia/ia-y-aprobaciones" },
  ],
  org_dueno: [
    { key: "vencimientos_vistos", title: "Mirá tus vencimientos", text: "Qué vence, cuánto y cómo pagarlo.", href: "/portal/vencimientos", help: "vencimientos/calendario" },
    { key: "documento", title: "Subí un documento", text: "Comprobantes, recibos o constancias para el estudio.", href: "/portal/documentos", help: "documentos/subir-documentos" },
    { key: "solicitud", title: "Mandale una consulta al estudio", text: "Queda todo en un solo lugar, con su respuesta.", href: "/portal/solicitudes", help: "solicitudes/solicitudes" },
    { key: "equipo", title: "Invitá a tu equipo", text: "Administración, RR. HH. o empleados, cada uno con su permiso.", href: "/portal/equipo", help: "organizaciones/invitaciones" },
  ],
  org_administracion: [
    { key: "vencimientos_vistos", title: "Mirá los vencimientos", text: "Qué vence y cuánto.", href: "/portal/vencimientos", help: "vencimientos/calendario" },
    { key: "documento", title: "Subí un documento", text: "Lo que el estudio te pida, en un solo lugar.", href: "/portal/documentos", help: "documentos/subir-documentos" },
    { key: "solicitud", title: "Hacé una consulta", text: "El estudio te responde por acá.", href: "/portal/solicitudes", help: "solicitudes/solicitudes" },
  ],
  empleado: [
    { key: "inicio_empleado", title: "Conocé tu espacio", text: "Tus rendiciones y tus grupos de gastos.", href: "/portal/empleado", help: "grupos-de-gastos/rendiciones" },
    { key: "rendicion", title: "Cargá una rendición", text: "Un gasto que pagaste vos para la empresa, con su ticket.", href: "/portal/rendiciones", help: "grupos-de-gastos/rendiciones" },
  ],
  capitan: [
    { key: "flota_miembros", title: "Sumá a tu tripulación", text: "Una Flota necesita entre 3 y 20 integrantes.", href: "/flotas", help: "flotas/que-es-una-flota" },
    { key: "flota_pedido", title: "Armá el pedido", text: "Qué necesita la Flota del estudio.", href: "/flotas", help: "flotas/pedir-propuestas" },
    { key: "flota_propuestas", title: "Compará propuestas", text: "Los estudios de la Red responden; elegís con tu tripulación.", href: "/flotas", help: "flotas/pedir-propuestas" },
  ],
  tripulante: [
    { key: "flota_ver", title: "Mirá tu Flota", text: "Quiénes son, el pedido y las propuestas.", href: "/flotas", help: "flotas/que-es-una-flota" },
    { key: "flota_acuerdo", title: "Revisá tu acuerdo", text: "Cada integrante tiene su acuerdo y paga solo su abono.", href: "/flotas", help: "flotas/acuerdos-y-salida" },
  ],
};

// ── Tours por pantalla ────────────────────────────────────────────────────

export interface TourStep {
  /** Selector del elemento a señalar (data-tour="…"); sin selector, el paso va centrado */
  target?: string;
  title: string;
  text: string;
}

export interface Tour {
  id: string;
  /** Ruta exacta o patrón con * al final */
  path: string;
  steps: TourStep[];
}

const t = (name: string) => `[data-tour="${name}"]`;

export const TOURS: Tour[] = [
  {
    id: "admin-inicio",
    path: "/admin",
    steps: [
      { title: "Este es el panel del estudio", text: "Lo urgente de hoy: vencimientos, solicitudes y aprobaciones pendientes." },
      { target: t("nav"), title: "El menú", text: "Organizaciones, vencimientos, documentos y todo lo demás. Se repliega con el botón de arriba." },
      { target: t("guia"), title: "La guía", text: "Tus primeros pasos y este recorrido están siempre acá. La podés apagar cuando quieras." },
      { target: t("ayuda"), title: "Ayuda", text: "Artículos cortos para cada pantalla, y el asistente los cita cuando le preguntás." },
    ],
  },
  {
    id: "admin-organizaciones",
    path: "/admin/organizaciones",
    steps: [
      { title: "Tus organizaciones", text: "Cada cliente del estudio es una organización, con sus razones sociales y su portal." },
      { target: t("accion"), title: "Sumá una", text: "Al crearla podés elegir el rubro y Faro te propone obligaciones y documentos típicos." },
      { target: t("org-filtros"), title: "Buscá y filtrá", text: "Por nombre, CUIT, estado o responsable." },
    ],
  },
  {
    id: "personal-inicio",
    path: "/personal",
    steps: [
      { title: "Tu espacio en Faro", text: "Tus números, sin ser contador. Arrancá por los grupos de gastos." },
      { target: t("grupos"), title: "Grupos de gastos", text: "Dividí con amigos, socios o clientes. Lo de tu actividad queda listo para la contabilidad." },
      { target: t("guia"), title: "Tus primeros pasos", text: "Desde «Guía» ves qué te falta. Cada paso se marca solo cuando lo hacés." },
    ],
  },
  {
    id: "grupos",
    path: "/grupos",
    steps: [
      { title: "Grupos de gastos", text: "Cada grupo tiene sus integrantes, sus gastos y sus saldos." },
      { target: t("grupo-nuevo"), title: "Creá uno", text: "Elegí el tipo (viaje, socios, oficina…) y la moneda." },
    ],
  },
  {
    id: "portal-inicio",
    path: "/portal",
    steps: [
      { title: "Tu portal", text: "Lo que tenés con el estudio: vencimientos, documentos y consultas." },
      { target: t("nav"), title: "Secciones", text: "Ves solo lo que tu rol permite." },
      { target: t("guia"), title: "La guía", text: "Tus primeros pasos y la ayuda, siempre a mano." },
    ],
  },
];

export function tourFor(pathname: string): Tour | null {
  return TOURS.find((x) => (x.path.endsWith("*") ? pathname.startsWith(x.path.slice(0, -1)) : pathname === x.path)) ?? null;
}

/** Vista del panel "Guía" que arma el servidor */
export interface GuideView {
  profile: OnboardingProfile;
  profileLabel: string;
  steps: (ChecklistStep & { done: boolean })[];
  toursSeen: string[];
  disabled: boolean;
}
