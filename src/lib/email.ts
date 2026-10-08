import { Resend } from "resend";
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

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendLeadEmails(lead: LeadMail) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) return;
  const resend = new Resend(key);
  const notifyTo = process.env.STUDIO_NOTIFY_EMAIL ?? site.email;

  const rows: [string, string | null | undefined][] = [
    ["Nombre", lead.name],
    ["Email", lead.email],
    ["Teléfono", lead.phone],
    ["Empresa", lead.company],
    ["Tipo", lead.contributor_type ? CONTRIBUTOR_TYPES[lead.contributor_type] ?? lead.contributor_type : null],
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
    resend.emails.send({
      from,
      to: notifyTo,
      replyTo: lead.email ?? undefined,
      subject: `Nueva consulta: ${lead.name}`,
      html: `<p>Entró una consulta desde la web.</p><table>${table}</table><p><a href="${site.url}/admin/consultas">Abrir en el backoffice</a></p>`,
    }),
  ];

  if (lead.email) {
    jobs.push(
      resend.emails.send({
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

  await Promise.allSettled(jobs);
}
