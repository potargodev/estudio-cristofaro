import nodemailer from "nodemailer";
import { getSiteUrl } from "./runtime-config";
import { site } from "./site";
import { CONTRIBUTOR_TYPES, LEAD_SOURCES, type LeadSource } from "./types";

interface LeadMail {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  contributor_type?: string | null;
  activity?: string | null;
  employees?: string | null;
  needs?: string[];
  message?: string | null;
  source: LeadSource;
}

export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Transporte SMTP de la casilla del dominio. Null si falta alguna variable: no se envía nada. */
function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !MAIL_FROM) return null;
  const port = Number(SMTP_PORT) || 465;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function sendLeadEmails(lead: LeadMail) {
  const transport = getTransport();
  if (!transport) return;
  const from = process.env.MAIL_FROM!;
  const notifyTo = process.env.STUDIO_NOTIFY_EMAIL || site.email;

  const rows: [string, string | null | undefined][] = [
    ["Nombre", lead.name],
    ["Email", lead.email],
    ["Teléfono", lead.phone],
    ["Empresa", lead.company],
    ["Tipo", lead.contributor_type ? (CONTRIBUTOR_TYPES[lead.contributor_type] ?? lead.contributor_type) : null],
    ["Actividad", lead.activity],
    ["Empleados", lead.employees],
    ["Necesita", lead.needs?.join(", ")],
    ["Mensaje", lead.message],
    ["Origen", LEAD_SOURCES[lead.source]],
  ];
  const table = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5a6176">${k}</td><td style="padding:4px 0">${esc(String(v))}</td></tr>`)
    .join("");

  const jobs: Promise<unknown>[] = [
    transport.sendMail({
      from,
      to: notifyTo,
      replyTo: lead.email ?? undefined,
      subject: `Nueva consulta: ${lead.name}`,
      html: `<p>Entró una consulta desde la web.</p><table>${table}</table><p><a href="${getSiteUrl()}/admin/consultas">Abrir en el backoffice</a></p>`,
    }),
  ];

  if (lead.email) {
    jobs.push(
      transport.sendMail({
        from,
        to: lead.email,
        subject: "Recibimos tu consulta",
        html: `<p>Hola ${esc(lead.name.split(" ")[0])},</p>
<p>Recibimos tu consulta. Un contador del estudio te va a responder en menos de 24 horas hábiles.</p>
<p>Si es urgente, escribinos por WhatsApp al ${site.phone}.</p>
<p>${site.name}</p>`,
      }),
    );
  }

  // Un error de SMTP nunca rompe el envío del formulario: la consulta ya quedó guardada.
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === "rejected") console.error("[mail] No se pudo enviar", r.reason);
}

/**
 * Envía un mail simple. Si el SMTP no está configurado no hace nada, y si falla
 * solo lo registra: nunca rompe la acción que lo dispara. Devuelve si salió.
 */
export async function sendMail({
  to,
  subject,
  html,
  replyTo,
  attachments,
}: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
}): Promise<boolean> {
  const transport = getTransport();
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!transport || recipients.length === 0) {
    if (recipients.length) console.info(`[mail] SMTP sin configurar: no se envió "${subject}" a ${recipients.join(", ")}`);
    return false;
  }
  try {
    await transport.sendMail({ from: process.env.MAIL_FROM!, to: recipients, subject, html, replyTo, attachments });
    return true;
  } catch (error) {
    console.error("[mail] No se pudo enviar", subject, error);
    return false;
  }
}

/** ¿Hay SMTP configurado? (para avisar en la interfaz que hay que pasar el enlace a mano) */
export function mailEnabled() {
  return getTransport() !== null;
}
