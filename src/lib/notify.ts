import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { can, type Permission } from "./permissions";
import { esc, sendMail } from "./email";
import { getSiteUrl } from "./runtime-config";
import { site } from "./site";

// Avisos por mail del portal. Si el SMTP no está configurado no se envía nada
// (sendMail no hace nada) y la acción sigue igual.

function layout(title: string, body: string, cta?: { href: string; label: string }) {
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1b1e26;max-width:560px">
<p style="font-size:18px;margin:0 0 12px">${esc(title)}</p>
${body}
${cta ? `<p style="margin:20px 0"><a href="${cta.href}" style="background:#1c2235;color:#f7f5f3;padding:10px 16px;border-radius:6px;text-decoration:none">${esc(cta.label)}</a></p>` : ""}
<p style="color:#5a6176;font-size:13px;margin-top:24px">${esc(site.name)}</p>
</div>`;
}

/**
 * Emails de los miembros activos de una organización del estudio que tienen el
 * permiso para ver lo que se avisa (RRHH no recibe avisos de vencimientos, etc.).
 */
async function memberEmails(studioId: string, organizationId: string, permission: Permission) {
  const rows = await getDb()
    .select({ email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.user_id))
    .innerJoin(organizations, eq(organizations.id, memberships.organization_id))
    .where(
      and(
        eq(memberships.organization_id, organizationId),
        eq(memberships.status, "activa"),
        eq(organizations.studio_id, studioId),
        ne(organizations.status, "baja"),
        eq(users.active, true),
      ),
    );
  return rows.filter((r) => can(r.role, permission)).map((r) => r.email);
}

type ClientEvent =
  | { kind: "documento"; documentName: string }
  | {
      kind: "vencimientos";
      items: { tax: string; period: string; dueDate: string }[];
    }
  | { kind: "respuesta"; subject: string };

const EVENT_PERMISSION: Record<ClientEvent["kind"], Permission> = {
  documento: "documentos.ver",
  vencimientos: "vencimientos.ver",
  respuesta: "solicitudes.ver",
};

export async function notifyOrganization(studioId: string, organizationId: string, event: ClientEvent) {
  try {
    const to = await memberEmails(studioId, organizationId, EVENT_PERMISSION[event.kind]);
    if (to.length === 0) return;
    const portal = `${getSiteUrl()}/portal`;
    if (event.kind === "documento") {
      await sendMail({
        to,
        subject: "Tenés un documento nuevo en tu portal",
        html: layout("Tenés un documento nuevo", `<p>El estudio subió <strong>${esc(event.documentName)}</strong> a tu portal.</p>`, {
          href: `${portal}/documentos`,
          label: "Ver documentos",
        }),
      });
    } else if (event.kind === "vencimientos") {
      const list = event.items
        .map((i) => `<li>${esc(i.tax)} · ${esc(i.period)} · vence el ${esc(i.dueDate.split("-").reverse().join("/"))}</li>`)
        .join("");
      await sendMail({
        to,
        subject: event.items.length === 1 ? "Cargamos un vencimiento nuevo" : `Cargamos ${event.items.length} vencimientos nuevos`,
        html: layout("Vencimientos cargados", `<ul>${list}</ul>`, {
          href: `${portal}/vencimientos`,
          label: "Ver vencimientos",
        }),
      });
    } else {
      await sendMail({
        to,
        subject: `Respuesta a tu solicitud: ${event.subject}`,
        html: layout("Te respondimos", `<p>Hay una respuesta del estudio en tu solicitud <strong>${esc(event.subject)}</strong>.</p>`, {
          href: `${portal}/solicitudes`,
          label: "Ver la respuesta",
        }),
      });
    }
  } catch (error) {
    console.error("[notify] Aviso al cliente", error);
  }
}

type StudioEvent =
  | {
      kind: "documento";
      organizationName: string;
      organizationId: string;
      documentName: string;
    }
  | {
      kind: "solicitud";
      organizationName: string;
      organizationId: string;
      subject: string;
      message: string;
    };

export async function notifyStudio(event: StudioEvent) {
  const to = process.env.STUDIO_NOTIFY_EMAIL || site.email;
  const href = `${getSiteUrl()}/admin/organizaciones/${event.organizationId}`;
  if (event.kind === "documento") {
    await sendMail({
      to,
      subject: `${event.organizationName} subió un documento`,
      html: layout(
        "Documento nuevo de un cliente",
        `<p><strong>${esc(event.organizationName)}</strong> subió <strong>${esc(event.documentName)}</strong> desde el portal.</p>`,
        { href: `${href}?tab=documentos`, label: "Ver en el backoffice" },
      ),
    });
  } else {
    await sendMail({
      to,
      subject: `Nueva solicitud de ${event.organizationName}: ${event.subject}`,
      html: layout(
        "Solicitud nueva",
        `<p><strong>${esc(event.organizationName)}</strong> creó una solicitud: <strong>${esc(event.subject)}</strong></p><p style="white-space:pre-line">${esc(event.message)}</p>`,
        { href: `${href}?tab=solicitudes`, label: "Responder" },
      ),
    });
  }
}
