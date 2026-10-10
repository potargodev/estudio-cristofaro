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
};

export const auditLabel = (action: string) => AUDIT_LABELS[action] ?? action;
