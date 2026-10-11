"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import { studioOrganization } from "@/lib/organizations";
import { BankRecError, confirmMatch, deleteRule, importStatement, markMovement, saveRule } from "@/modules/bank-rec/server";

// Conciliación bancaria: dueños y contadores del estudio. La organización del
// formulario se valida contra el estudio de la sesión.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function go(path: string, q: Record<string, string> = {}): never {
  redirect(Object.keys(q).length ? `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(q)}` : path);
}

async function ctx(fd: FormData) {
  const me = await requireOperator();
  const org = await studioOrganization(s(fd, "org"), me.studioId);
  if (!org) notFound();
  return { me, scope: { studioId: me.studioId, organizationId: org.id }, tab: `/admin/organizaciones/${org.id}?tab=conciliacion` };
}

async function guard<T>(back: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof BankRecError) go(back, { error: e.message });
    throw e;
  }
}

export async function importStatementAction(fd: FormData) {
  const c = await ctx(fd);
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) go(c.tab, { error: "Elegí el extracto." });
  const st = await guard(c.tab, () => importStatement(c.scope, c.me, file, s(fd, "bank"), s(fd, "account") || null));
  revalidatePath(`/admin/organizaciones/${c.scope.organizationId}`);
  go(`/admin/organizaciones/${c.scope.organizationId}/conciliacion/${st.id}`, { ok: `Importamos ${st.total} movimiento${st.total === 1 ? "" : "s"}${st.duplicates ? ` (${st.duplicates} ya estaban)` : ""}.` });
}

export async function movementAction(fd: FormData) {
  const c = await ctx(fd);
  const back = `/admin/organizaciones/${c.scope.organizationId}/conciliacion/${s(fd, "statement")}`;
  const op = s(fd, "op");
  await guard(back, () => (op === "conciliar" ? confirmMatch(c.scope, c.me, s(fd, "id"), s(fd, "candidate") || null) : markMovement(c.scope, c.me, s(fd, "id"), op === "sin_factura" ? "sin_factura" : op === "ignorar" ? "ignorado" : "sin_conciliar", s(fd, "note") || null)));
  revalidatePath(back);
  go(back, { ok: op === "conciliar" ? "Conciliado." : op === "sin_factura" ? "Marcado como pago sin factura." : op === "ignorar" ? "Ignorado." : "Vuelve a estar sin conciliar." });
}

export async function ruleAction(fd: FormData) {
  const c = await ctx(fd);
  const back = s(fd, "statement") ? `/admin/organizaciones/${c.scope.organizationId}/conciliacion/${s(fd, "statement")}` : c.tab;
  await guard(back, () => saveRule(c.scope, c.me, { pattern: s(fd, "pattern"), sign: s(fd, "sign"), action: s(fd, "action"), label: s(fd, "label"), allOrgs: fd.get("all_orgs") === "on" }));
  revalidatePath(back);
  go(back, { ok: "Regla guardada: se aplica a los movimientos que coinciden." });
}

export async function deleteRuleAction(fd: FormData) {
  const c = await ctx(fd);
  await deleteRule(c.scope, c.me, s(fd, "id"));
  go(c.tab, { ok: "Regla borrada." });
}
