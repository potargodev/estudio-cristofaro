"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/auth";
import { decideApproval, type StaffRole } from "@/modules/tools";

// Bandeja de aprobaciones: aprobar (ejecuta y audita), editar y aprobar o
// rechazar con motivo. La validación de estudio, rol y organización la hace
// decideApproval en el servidor.

/** A dónde volver: la pestaña "Propuestas para aprobar" del Vigía (pantalla completa o panel) */
function backOf(fd: FormData) {
  const v = String(fd.get("volver") ?? "");
  return /^\/(admin\/vigia|vigia-panel|vigia)\?[\w=&%-]*$/.test(v) ? v : "/admin/vigia?tab=propuestas";
}

/** Reconstruye el borrador editado a partir de los campos f:<clave> y su tipo t:<clave> */
function editedInput(fd: FormData): { ok: true; input: Record<string, unknown> } | { ok: false; error: string } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("f:") || typeof v !== "string") continue;
    const key = k.slice(2);
    const type = String(fd.get(`t:${key}`) ?? "string");
    const raw = v.trim();
    if (type === "number") {
      if (raw === "") continue;
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n)) return { ok: false, error: `"${key}" tiene que ser un número.` };
      out[key] = n;
    } else if (type === "boolean") {
      out[key] = raw === "true";
    } else if (type === "json") {
      try {
        out[key] = JSON.parse(raw);
      } catch {
        return { ok: false, error: `"${key}" no es JSON válido.` };
      }
    } else if (raw !== "") {
      out[key] = raw;
    }
  }
  return { ok: true, input: out };
}

export async function decideApprovalAction(fd: FormData) {
  const user = await requireTenant();
  const id = String(fd.get("id") ?? "");
  const mode = String(fd.get("mode") ?? "");
  const BASE = backOf(fd);
  const actor = { id: user.id, email: user.email, name: user.name, role: user.role as StaffRole, studioId: user.studioId };
  let r;
  if (mode === "rechazar") {
    const reason = String(fd.get("reason") ?? "").trim();
    if (reason.length < 3) redirect(`${BASE}&error=${encodeURIComponent("Escribí el motivo del rechazo.")}#${id}`);
    r = await decideApproval(id, actor, { approve: false, reason });
  } else if (mode === "editar") {
    const edited = editedInput(fd);
    if (!edited.ok) redirect(`${BASE}&error=${encodeURIComponent(edited.error)}#${id}`);
    r = await decideApproval(id, actor, { approve: true, input: edited.input });
  } else {
    r = await decideApproval(id, actor, { approve: true });
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/vigia-panel");
  if (!r.ok) redirect(`${BASE}&error=${encodeURIComponent(r.message)}#${id}`);
  redirect(`${BASE}&${r.status === "ejecutada" ? "aprobada" : "rechazada"}=1`);
}
