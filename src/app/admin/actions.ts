"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import type { LeadStatus, TaxRegime } from "@/lib/types";

// ───────────── helpers ─────────────

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function lines(fd: FormData, key: string): string[] {
  return (s(fd, key) ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

const LEAD_STATUSES: LeadStatus[] = ["nuevo", "contactado", "presupuesto", "ganado", "perdido"];
const REGIMES: TaxRegime[] = ["monotributo", "responsable_inscripto", "sociedad", "exento", "otro"];

function revalidateSite() {
  revalidatePath("/", "layout");
}

export interface ActionState {
  ok: boolean;
  message?: string;
}

// ───────────── sesión ─────────────

export async function signIn(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = s(fd, "email");
  const password = s(fd, "password");
  if (!email || !password) return { ok: false, message: "Completá email y contraseña." };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: "Email o contraseña incorrectos." };
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

// ───────────── consultas ─────────────

export async function moveLead(id: string, status: LeadStatus) {
  if (!LEAD_STATUSES.includes(status)) return { ok: false };
  const { supabase } = await requireStaff();
  const { error } = await supabase.from("leads").update({ status }).eq("id", id);
  revalidatePath("/admin/consultas");
  revalidatePath("/admin");
  return { ok: !error };
}

export async function createLead(fd: FormData) {
  const { supabase, profile } = await requireStaff();
  const name = s(fd, "name");
  if (!name) redirect("/admin/consultas/nueva?error=nombre");
  const { data, error } = await supabase
    .from("leads")
    .insert({
      studio_id: profile.studio_id,
      name,
      email: s(fd, "email"),
      phone: s(fd, "phone"),
      company: s(fd, "company"),
      contributor_type: s(fd, "contributor_type"),
      activity: s(fd, "activity"),
      message: s(fd, "message"),
      source: (s(fd, "source") as "whatsapp" | "manual" | "otro" | null) ?? "manual",
      assigned_to: profile.id,
    })
    .select("id")
    .single();
  if (error || !data) redirect("/admin/consultas/nueva?error=guardar");
  revalidatePath("/admin/consultas");
  redirect(`/admin/consultas/${data.id}`);
}

export async function updateLead(fd: FormData) {
  const { supabase } = await requireStaff();
  const id = s(fd, "id");
  if (!id) return;
  const status = s(fd, "status") as LeadStatus | null;
  await supabase
    .from("leads")
    .update({
      name: s(fd, "name") ?? undefined,
      email: s(fd, "email"),
      phone: s(fd, "phone"),
      company: s(fd, "company"),
      status: status && LEAD_STATUSES.includes(status) ? status : undefined,
      assigned_to: s(fd, "assigned_to"),
      next_action: s(fd, "next_action"),
      next_action_at: s(fd, "next_action_at"),
      notes: s(fd, "notes"),
      lost_reason: s(fd, "lost_reason"),
    })
    .eq("id", id);
  revalidatePath("/admin/consultas");
  revalidatePath(`/admin/consultas/${id}`);
  revalidatePath("/admin");
  redirect(`/admin/consultas/${id}?guardado=1`);
}

export async function deleteLead(fd: FormData) {
  const { supabase } = await requireStaff();
  const id = s(fd, "id");
  if (id) await supabase.from("leads").delete().eq("id", id);
  revalidatePath("/admin/consultas");
  redirect("/admin/consultas");
}

export async function convertLeadToClient(fd: FormData) {
  const { supabase, profile } = await requireStaff();
  const id = s(fd, "id");
  if (!id) return;
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).single();
  if (!lead) redirect("/admin/consultas");
  if (lead.client_id) redirect(`/admin/clientes/${lead.client_id}`);

  const regimeByType: Record<string, TaxRegime> = {
    monotributista: "monotributo",
    responsable_inscripto: "responsable_inscripto",
    sociedad: "sociedad",
  };
  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      studio_id: profile.studio_id,
      business_name: lead.company || lead.name,
      contact_name: lead.name,
      email: lead.email,
      phone: lead.phone,
      regime: regimeByType[lead.contributor_type ?? ""] ?? "otro",
      notes: [lead.activity && `Actividad: ${lead.activity}`, lead.notes].filter(Boolean).join("\n\n") || null,
      services: lead.needs ?? [],
      lead_id: lead.id,
    })
    .select("id")
    .single();
  if (error || !client) redirect(`/admin/consultas/${id}?error=convertir`);

  await supabase.from("leads").update({ status: "ganado", client_id: client.id }).eq("id", id);
  revalidatePath("/admin/consultas");
  revalidatePath("/admin/clientes");
  redirect(`/admin/clientes/${client.id}?nuevo=1`);
}

// ───────────── clientes ─────────────

function clientPayload(fd: FormData) {
  const regime = s(fd, "regime") as TaxRegime | null;
  const fee = s(fd, "monthly_fee");
  return {
    business_name: s(fd, "business_name") ?? "Sin nombre",
    cuit: s(fd, "cuit")?.replace(/[^0-9]/g, "") || null,
    regime: regime && REGIMES.includes(regime) ? regime : "otro",
    category: s(fd, "category"),
    services: lines(fd, "services"),
    monthly_fee: fee ? Number(fee.replace(/\./g, "").replace(",", ".")) || null : null,
    contact_name: s(fd, "contact_name"),
    email: s(fd, "email"),
    phone: s(fd, "phone"),
    address: s(fd, "address"),
    notes: s(fd, "notes"),
    active: fd.get("active") !== null,
  };
}

export async function createClientRecord(fd: FormData) {
  const { supabase, profile } = await requireStaff();
  if (!s(fd, "business_name")) redirect("/admin/clientes/nuevo?error=nombre");
  const { data, error } = await supabase
    .from("clients")
    .insert({ studio_id: profile.studio_id, ...clientPayload(fd) })
    .select("id")
    .single();
  if (error || !data) redirect(`/admin/clientes/nuevo?error=${error?.code === "23505" ? "cuit" : "guardar"}`);
  revalidatePath("/admin/clientes");
  redirect(`/admin/clientes/${data.id}?nuevo=1`);
}

export async function updateClientRecord(fd: FormData) {
  const { supabase } = await requireStaff();
  const id = s(fd, "id");
  if (!id) return;
  const { error } = await supabase.from("clients").update(clientPayload(fd)).eq("id", id);
  revalidatePath("/admin/clientes");
  redirect(`/admin/clientes/${id}?${error ? `error=${error.code === "23505" ? "cuit" : "guardar"}` : "guardado=1"}`);
}

// ───────────── novedades ─────────────

export async function savePost(fd: FormData) {
  const { supabase, profile } = await requireStaff();
  const id = s(fd, "id");
  const title = s(fd, "title");
  if (!title) redirect(id ? `/admin/contenidos/novedades/${id}?error=titulo` : "/admin/contenidos/novedades/nueva?error=titulo");
  const published = fd.get("published") !== null;
  const payload = {
    title,
    slug: slugify(s(fd, "slug") ?? title),
    excerpt: s(fd, "excerpt"),
    body: s(fd, "body") ?? "",
    published,
  };

  if (id) {
    const { data: current } = await supabase.from("posts").select("published_at").eq("id", id).single();
    const { error } = await supabase
      .from("posts")
      .update({ ...payload, published_at: published ? current?.published_at ?? new Date().toISOString() : current?.published_at ?? null })
      .eq("id", id);
    revalidateSite();
    redirect(`/admin/contenidos/novedades/${id}?${error ? "error=slug" : "guardado=1"}`);
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({ studio_id: profile.studio_id, ...payload, published_at: published ? new Date().toISOString() : null })
    .select("id")
    .single();
  if (error || !data) redirect("/admin/contenidos/novedades/nueva?error=slug");
  revalidateSite();
  redirect(`/admin/contenidos/novedades/${data.id}?guardado=1`);
}

export async function deletePost(fd: FormData) {
  const { supabase } = await requireStaff();
  const id = s(fd, "id");
  if (id) await supabase.from("posts").delete().eq("id", id);
  revalidateSite();
  redirect("/admin/contenidos/novedades");
}

// ───────────── preguntas frecuentes ─────────────

export async function saveFaq(fd: FormData) {
  const { supabase, profile } = await requireStaff();
  const id = s(fd, "id");
  const question = s(fd, "question");
  const answer = s(fd, "answer");
  if (!question || !answer) redirect("/admin/contenidos/preguntas?error=campos");
  const payload = {
    question,
    answer,
    position: Number(s(fd, "position") ?? 0) || 0,
    published: fd.get("published") !== null,
  };
  if (id) await supabase.from("faqs").update(payload).eq("id", id);
  else await supabase.from("faqs").insert({ studio_id: profile.studio_id, ...payload });
  revalidateSite();
  redirect("/admin/contenidos/preguntas?guardado=1");
}

export async function deleteFaq(fd: FormData) {
  const { supabase } = await requireStaff();
  const id = s(fd, "id");
  if (id) await supabase.from("faqs").delete().eq("id", id);
  revalidateSite();
  redirect("/admin/contenidos/preguntas");
}

// ───────────── planes ─────────────

export async function savePlan(fd: FormData) {
  const { supabase, profile } = await requireStaff();
  const id = s(fd, "id");
  const name = s(fd, "name");
  if (!name) redirect("/admin/contenidos/planes?error=nombre");
  const payload = {
    name,
    segment: s(fd, "segment"),
    price_label: s(fd, "price_label"),
    description: s(fd, "description"),
    features: lines(fd, "features"),
    highlighted: fd.get("highlighted") !== null,
    position: Number(s(fd, "position") ?? 0) || 0,
    published: fd.get("published") !== null,
  };
  if (id) await supabase.from("plans").update(payload).eq("id", id);
  else await supabase.from("plans").insert({ studio_id: profile.studio_id, ...payload });
  revalidateSite();
  redirect("/admin/contenidos/planes?guardado=1");
}

export async function deletePlan(fd: FormData) {
  const { supabase } = await requireStaff();
  const id = s(fd, "id");
  if (id) await supabase.from("plans").delete().eq("id", id);
  revalidateSite();
  redirect("/admin/contenidos/planes");
}
