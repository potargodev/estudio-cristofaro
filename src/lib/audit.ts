import "server-only";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { audit_log } from "@/db/schema";

// Registro de auditoría. Toda acción sensible pasa por acá: logins, invitaciones,
// cambios de rol, accesos revocados, plan, módulos, descargas de documentos,
// importaciones, sincronizaciones y resets de contraseña. Nunca corta la acción
// que audita: si falla el insert, lo deja en el log del servidor.

export type AuditResult = "ok" | "denegado" | "error";

export interface AuditEvent {
  studioId: string | null;
  organizationId?: string | null;
  actor?: { id: string; email?: string | null } | null;
  /** Para acciones sin usuario: "sistema", "conector de Tango", un email no registrado */
  actorLabel?: string;
  action: string;
  entityType?: string;
  entityId?: string | null;
  result?: AuditResult;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/** IP del pedido actual (detrás del proxy de Easypanel viene en x-forwarded-for) */
export async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  } catch {
    return null; // fuera de un pedido (scripts)
  }
}

export async function audit(e: AuditEvent): Promise<void> {
  try {
    await getDb()
      .insert(audit_log)
      .values({
        studio_id: e.studioId,
        organization_id: e.organizationId ?? null,
        actor_id: e.actor?.id ?? null,
        actor_label: e.actor?.email ?? e.actorLabel ?? null,
        action: e.action,
        entity_type: e.entityType ?? null,
        entity_id: e.entityId ?? null,
        result: e.result ?? "ok",
        metadata: e.metadata ?? {},
        ip: e.ip === undefined ? await requestIp() : e.ip,
      });
  } catch (error) {
    console.error("[audit] No se pudo registrar", e.action, error);
  }
}

/** Nombres legibles de las acciones para la línea de tiempo */
export const AUDIT_LABELS: Record<string, string> = {
  "sesion.iniciar": "Inició sesión",
  "sesion.rechazada": "Intento de acceso rechazado",
  "organizacion.crear": "Creó la organización",
  "organizacion.editar": "Editó los datos de la organización",
  "organizacion.plan": "Cambió el plan",
  "organizacion.excepcion": "Otorgó una excepción a los límites del plan",
  "razon_social.crear": "Agregó una razón social",
  "razon_social.editar": "Editó una razón social",
  "razon_social.eliminar": "Eliminó una razón social",
  "modulo.activar": "Activó un módulo",
  "modulo.desactivar": "Desactivó un módulo",
  "equipo.asignar": "Asignó equipo del estudio",
  "equipo.quitar": "Quitó a alguien del equipo del estudio",
  "invitacion.crear": "Envió una invitación",
  "invitacion.aprobar": "Confirmó una invitación con rol sensible",
  "invitacion.revocar": "Revocó una invitación",
  "invitacion.aceptar": "Aceptó la invitación",
  "invitacion.reenviar": "Reenvió una invitación",
  "miembro.rol": "Cambió el rol de un miembro",
  "miembro.revocar": "Revocó el acceso de un miembro",
  "miembro.reactivar": "Reactivó el acceso de un miembro",
  "miembro.admin": "Designó un nuevo administrador",
  "documento.subir": "Subió un documento",
  "documento.descargar": "Descargó un documento",
  "documento.eliminar": "Eliminó un documento",
  "vencimientos.importar": "Importó vencimientos",
  "vencimientos.estado": "Cambió el estado de un vencimiento",
  "consultas.estado": "Movió una consulta de etapa",
  "tango.sincronizar": "Sincronización de Tango",
  "tango.vincular": "Vinculó un cliente de Tango",
  "tango.importar": "Importó un cliente de Tango",
  "usuario.reset_password": "Reseteó la contraseña",
  "usuario.2fa_activar": "Activó el segundo factor",
  "permiso.denegado": "Acción sin permiso bloqueada",
  "agenda.reservar": "Agendó una llamada",
  "agenda.reprogramar": "Reprogramó una llamada",
  "agenda.cancelar": "Canceló una llamada",
  "agenda.disponibilidad": "Actualizó su disponibilidad",
  "agenda.google_conectar": "Conectó Google Calendar",
  "agenda.google_desconectar": "Desconectó Google Calendar",
  "plan.precio": "Cambió el precio publicado de un plan",
  "herramienta.ejecutar": "Usó una herramienta de IA",
  "herramienta.denegada": "Herramienta de IA bloqueada",
  "herramienta.confirmar_pedido": "La IA pidió confirmar una acción",
  "herramienta.confirmar": "Confirmó una acción de la IA",
  "aprobacion.proponer": "La IA propuso una acción sensible",
  "aprobacion.aprobar": "Aprobó una propuesta",
  "aprobacion.rechazar": "Rechazó una propuesta",
  "vencimientos.crear": "Creó un vencimiento",
  "solicitud.crear": "Abrió una solicitud",
  "solicitud.responder": "Respondió una solicitud",
  "documento.leer_ia": "La IA leyó un documento",
  "ia.proveedor_crear": "Agregó un proveedor de IA",
  "ia.proveedor_editar": "Editó un proveedor de IA",
  "ia.proveedor_eliminar": "Eliminó un proveedor de IA",
  "ia.proveedor_estado": "Pausó o activó un proveedor de IA",
  "ia.proveedor_probar": "Probó la conexión con un proveedor de IA",
  "ia.configurar": "Cambió la configuración de IA",
  "asistente.borrar_conversacion": "Borró una conversación del Asistente",
  "mcp.acceso_crear": "Creó un acceso MCP",
  "mcp.acceso_revocar": "Revocó un acceso MCP",
  "mcp.oauth_autorizar": "Autorizó un cliente MCP por OAuth",
  "mcp.oauth_rechazar": "Rechazó un cliente MCP por OAuth",
  "mcp.oauth_token": "Cliente MCP obtuvo un token",
  "conexion.crear": "Creó una conexión",
  "conexion.editar": "Editó una conexión",
  "conexion.eliminar": "Eliminó una conexión",
  "conexion.probar": "Probó una conexión",
  "conexion.sincronizar": "Sincronizó una conexión",
  "conexion.vincular": "Vinculó un registro externo",
  "conexion.importar": "Importó un archivo en una conexión",
};

export const auditLabel = (action: string) => AUDIT_LABELS[action] ?? action;
