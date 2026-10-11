"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFaro } from "@/lib/auth";
import { EscudoError, saveDerivationRule, saveProfessionalTask } from "@/modules/escudo/server";

// Escudo de responsabilidad (principios §1.b y §1.c): la lista de tareas que
// requieren un matriculado y las reglas del disparador de derivación. Solo el
// owner edita; todo queda «a validar por un contador» hasta que uno lo valide.

const PATH = "/faro-manager/escudo";
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (q: Record<string, string>, hash = ""): never => redirect(`${PATH}?${new URLSearchParams(q)}${hash}`);

export async function saveTaskAction(fd: FormData) {
  const faro = await requireFaro(true);
  let key = "";
  try {
    key = await saveProfessionalTask(faro, {
      key: s(fd, "key"),
      title: s(fd, "title"),
      description: s(fd, "description"),
      keywords: s(fd, "keywords"),
      active: fd.get("active") === "on",
      validation: s(fd, "validation") === "validada" ? "validada" : "a_validar",
      validatedBy: s(fd, "validated_by") || null,
    });
  } catch (e) {
    if (e instanceof EscudoError) go({ error: e.message });
    throw e;
  }
  revalidatePath(PATH);
  go({ ok: "Tarea guardada" }, `#tarea-${key}`);
}

export async function saveRuleAction(fd: FormData) {
  const faro = await requireFaro(true);
  const key = s(fd, "key");
  const t = s(fd, "threshold").replace(",", ".");
  try {
    await saveDerivationRule(faro, key, {
      title: s(fd, "title"),
      message: s(fd, "message"),
      need: s(fd, "need"),
      threshold: t === "" ? null : Number(t),
      snoozeDays: Number(s(fd, "snooze_days")),
      active: fd.get("active") === "on",
      validation: s(fd, "validation") === "validada" ? "validada" : "a_validar",
      validatedBy: s(fd, "validated_by") || null,
    });
  } catch (e) {
    if (e instanceof EscudoError) go({ error: e.message });
    throw e;
  }
  revalidatePath(PATH);
  go({ ok: "Regla guardada" }, `#regla-${key}`);
}
