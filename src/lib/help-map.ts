// Botón "?" contextual: qué artículo del centro de ayuda corresponde a cada
// pantalla. El primer prefijo que coincide gana (de lo más específico a lo general).
const MAP: [string, string][] = [
  ["/admin/organizaciones/nueva", "organizaciones/rubros"],
  ["/admin/rubros", "organizaciones/rubros"],
  ["/admin/organizaciones", "organizaciones/invitaciones"],
  ["/admin/usuarios", "organizaciones/roles"],
  ["/admin/vencimientos", "vencimientos/calendario"],
  ["/admin/solicitudes", "solicitudes/solicitudes"],
  ["/admin/aprobaciones", "ia/ia-y-aprobaciones"],
  ["/admin/asistente", "ia/ia-y-aprobaciones"],
  ["/admin/ia", "ia/ia-y-aprobaciones"],
  ["/admin/mcp", "ia/mcp"],
  ["/admin/conexiones", "conexiones/conexiones"],
  ["/admin/plan", "primeros-pasos/planes"],
  ["/admin/modulos", "primeros-pasos/planes"],
  ["/admin/red", "red-de-estudios/perfil-del-estudio"],
  ["/admin", "primeros-pasos/primeros-pasos-estudio"],
  ["/portal/documentos", "documentos/subir-documentos"],
  ["/portal/vencimientos", "vencimientos/calendario"],
  ["/portal/solicitudes", "solicitudes/solicitudes"],
  ["/portal/equipo", "organizaciones/invitaciones"],
  ["/portal/rendiciones", "grupos-de-gastos/rendiciones"],
  ["/portal", "documentos/subir-documentos"],
  ["/grupos", "grupos-de-gastos/crear-un-grupo"],
  ["/flotas", "flotas/que-es-una-flota"],
  ["/red", "red-de-estudios/buscar-un-estudio"],
  ["/personal/plan", "primeros-pasos/planes"],
  ["/personal", "primeros-pasos/registro"],
  ["/faro-manager", "primeros-pasos/planes"],
];

export function helpFor(pathname: string): string {
  const hit = MAP.find(([p]) => pathname === p || pathname.startsWith(`${p}/`));
  return hit ? `/ayuda/${hit[1]}` : "/ayuda";
}
