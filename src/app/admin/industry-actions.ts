"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator, requireStaff } from "@/lib/auth";
import { IndustryError, applyTemplate, incorporateUpdate, updateSetupItem } from "@/modules/industries/server";

// Plantillas de rubro en la ficha de la organización. Todo valida en el
// servidor que la organización sea del estudio de la sesión.

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const ficha = (id: string, extra = "") => `/admin/organizaciones/${id}?tab=rubro${extra}`;

export async function applyIndustryAction(fd: FormData) {
  const me = await requireOperator();
  const org = str(fd, "organization");
  const key = str(fd, "industry");
  try {
    const r = await applyTemplate(me.studioId, me, org, key);
    revalidatePath(`/admin/organizaciones/${org}`);
    redirect(ficha(org, `&aplicado=${r.created}`));
  } catch (e) {
    if (e instanceof IndustryError) redirect(`/admin/organizaciones/${org}/rubro/${key}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
}

export async function incorporateIndustryAction(fd: FormData) {
  const me = await requireOperator();
  const org = str(fd, "organization");
  const key = str(fd, "industry");
  const selected = fd.getAll("item").map(String).slice(0, 500);
  try {
    const r = await incorporateUpdate(me.studioId, me, org, key, selected);
    revalidatePath(`/admin/organizaciones/${org}`);
    redirect(ficha(org, `&actualizado=${r.applied}&propios=${r.kept}`));
  } catch (e) {
    if (e instanceof IndustryError) redirect(ficha(org, `&error=${encodeURIComponent(e.message)}`));
    throw e;
  }
}

export async function updateSetupItemAction(fd: FormData) {
  const me = await requireStaff();
  const org = str(fd, "organization");
  const op = str(fd, "op");
  try {
    await updateSetupItem(me.studioId, me, org, str(fd, "item"), op === "done" ? { done: fd.get("done") === "1" } : op === "remove" ? { remove: true } : { label: str(fd, "label") });
  } catch (e) {
    if (!(e instanceof IndustryError)) throw e;
  }
  revalidatePath(`/admin/organizaciones/${org}`);
}
