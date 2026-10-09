import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { client_users, clients, users } from "@/db/schema";
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

/** Emails de los usuarios cliente activos vinculados a un cliente del estudio. */
async function clientEmails(studioId: string, clientId: string) {
  const rows = await getDb()
    .select({ email: users.email })
    .from(client_users)
    .innerJoin(users, eq(users.id, client_users.user_id))
    .innerJoin(clients, eq(clients.id, client_users.client_id))
    .where(and(eq(client_users.client_id, clientId), eq(clients.studio_id, studioId), eq(users.active, true)));
  return rows.map((r) => r.email);
}

type ClientEvent =
  | { kind: "documento"; documentName: string }
  | { kind: "vencimientos"; items: { tax: string; period: string; dueDate: string }[] }
  | { kind: "respuesta"; subject: string };

export async function notifyClient(studioId: string, clientId: string, event: ClientEvent) {
  try {
    const to = await clientEmails(studioId, clientId);
    if (to.length === 0) return;
    const portal = `${getSiteUrl()}/portal`;
    if (event.kind === "documento") {
      await sendMail({
        to,
        subject: "Tenés un documento nuevo en tu portal",
        html: layout(
          "Tenés un documento nuevo",
          `<p>El estudio subió <strong>${esc(event.documentName)}</strong> a tu portal.</p>`,
          { href: `${portal}/documentos`, label: "Ver documentos" },
        ),
      });
    } else if (event.kind === "vencimientos") {
      const list = event.items
        .map((i) => `<li>${esc(i.tax)} · ${esc(i.period)} · vence el ${esc(i.dueDate.split("-").reverse().join("/"))}</li>`)
        .join("");
      await sendMail({
        to,
        subject: event.items.length === 1 ? "Cargamos un vencimiento nuevo" : `Cargamos ${event.items.length} vencimientos nuevos`,
        html: layout("Vencimientos cargados", `<ul>${list}</ul>`, { href: `${portal}/vencimientos`, label: "Ver vencimientos" }),
      });
    } else {
      await sendMail({
        to,
        subject: `Respuesta a tu solicitud: ${event.subject}`,
        html: layout(
          "Te respondimos",
          `<p>Hay una respuesta del estudio en tu solicitud <strong>${esc(event.subject)}</strong>.</p>`,
          { href: `${portal}/solicitudes`, label: "Ver la respuesta" },
        ),
      });
    }
  } catch (error) {
    console.error("[notify] Aviso al cliente", error);
  }
}

type StudioEvent =
  | { kind: "documento"; clientName: string; clientId: string; documentName: string }
  | { kind: "solicitud"; clientName: string; clientId: string; subject: string; message: string };

export async function notifyStudio(event: StudioEvent) {
  const to = process.env.STUDIO_NOTIFY_EMAIL || site.email;
  const href = `${getSiteUrl()}/admin/clientes/${event.clientId}`;
  if (event.kind === "documento") {
    await sendMail({
      to,
      subject: `${event.clientName} subió un documento`,
      html: layout(
        "Documento nuevo de un cliente",
        `<p><strong>${esc(event.clientName)}</strong> subió <strong>${esc(event.documentName)}</strong> desde el portal.</p>`,
        { href: `${href}?tab=documentos`, label: "Ver en el backoffice" },
      ),
    });
  } else {
    await sendMail({
      to,
      subject: `Nueva solicitud de ${event.clientName}: ${event.subject}`,
      html: layout(
        "Solicitud nueva",
        `<p><strong>${esc(event.clientName)}</strong> creó una solicitud: <strong>${esc(event.subject)}</strong></p><p style="white-space:pre-line">${esc(event.message)}</p>`,
        { href: `${href}?tab=solicitudes`, label: "Responder" },
      ),
    });
  }
}
