"use server";

import { z } from "zod";
import { getStudioId } from "@/lib/data";
import { sendLeadEmails } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/server";

export interface LeadFormState {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  // React 19 resetea el formulario después de cada envío: devolvemos lo cargado
  // para repoblarlo cuando hay errores.
  values?: LeadValues;
}

export interface LeadValues {
  name: string;
  email: string;
  phone: string;
  company: string;
  contributor_type: string;
  activity: string;
  employees: string;
  message: string;
  needs: string[];
}

const schema = z
  .object({
    name: z.string().trim().min(2, "Escribí tu nombre."),
    email: z.string().trim().email("Revisá el email.").optional().or(z.literal("")),
    phone: z.string().trim().max(40).optional(),
    company: z.string().trim().max(120).optional(),
    contributor_type: z.string().trim().max(40).optional(),
    activity: z.string().trim().max(200).optional(),
    employees: z.string().trim().max(40).optional(),
    needs: z.array(z.string().max(80)).max(12),
    message: z.string().trim().max(3000).optional(),
    source: z.enum(["diagnostico", "contacto"]),
  })
  .refine((v) => Boolean(v.email) || Boolean(v.phone && v.phone.length >= 6), {
    message: "Dejanos un email o un teléfono para responderte.",
    path: ["email"],
  });

function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v : undefined;
}

export async function submitLead(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  // Honeypot: los bots completan este campo oculto
  if (str(formData, "website")) return { ok: true };

  const raw = {
    name: str(formData, "name") ?? "",
    email: str(formData, "email") ?? "",
    phone: str(formData, "phone") ?? "",
    company: str(formData, "company") ?? "",
    contributor_type: str(formData, "contributor_type") ?? "",
    activity: str(formData, "activity") ?? "",
    employees: str(formData, "employees") ?? "",
    message: str(formData, "message") ?? "",
  };
  const needs = formData.getAll("needs").filter((v): v is string => typeof v === "string");
  const values: LeadValues = { ...raw, needs };

  const parsed = schema.safeParse({
    ...raw,
    needs,
    source: str(formData, "source") === "diagnostico" ? "diagnostico" : "contacto",
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      errors[key] ??= issue.message;
    }
    return { ok: false, message: "Revisá los campos marcados.", errors, values };
  }

  const lead = parsed.data;
  const plan = str(formData, "plan");
  const message = [plan ? `Plan de interés: ${plan}` : null, lead.message || null].filter(Boolean).join("\n\n") || null;

  const sb = createServiceClient();
  const studioId = await getStudioId();
  if (!sb || !studioId) {
    console.warn("[leads] Supabase no configurado: la consulta no se guardó.", lead);
    return {
      ok: false,
      message: "No pudimos enviar el formulario. Escribinos por WhatsApp o a contacto@estudiocristofaro.com.",
      values,
    };
  }

  const { error } = await sb.from("leads").insert({
    studio_id: studioId,
    name: lead.name,
    email: lead.email || null,
    phone: lead.phone || null,
    company: lead.company || null,
    contributor_type: lead.contributor_type || null,
    activity: lead.activity || null,
    employees: lead.employees || null,
    needs: lead.needs,
    message,
    source: lead.source,
  });

  if (error) {
    console.error("[leads] Error al guardar", error);
    return {
      ok: false,
      message: "No pudimos enviar el formulario. Probá de nuevo o escribinos por WhatsApp.",
      values,
    };
  }

  await sendLeadEmails({ ...lead, email: lead.email || null, message });
  return { ok: true };
}
