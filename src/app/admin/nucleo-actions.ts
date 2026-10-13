"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireOperator, requireOwnAccount } from "@/lib/auth";
import { studioOrganization } from "@/lib/organizations";
import { AdapterError, advanceMigration, cancelMigration, editMirror, resolveMirrorConflict, runOp, setSource, startMigration, type AdapterOp } from "@/modules/adapters/server";

// Sistemas conectados (A0, principios §22): dueños y contadores del estudio,
// con su propia cuenta (el acceso asistido no cambia conexiones). La
// organización del formulario se valida contra el estudio de la sesión.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function go(path: string, q: Record<string, string> = {}): never {
  redirect(Object.keys(q).length ? `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(q)}` : path);
}

async function ctx(fd: FormData) {
  const me = await requireOwnAccount(requireOperator());
  const org = await studioOrganization(s(fd, "org"), me.studioId);
  if (!org) notFound();
  return { me, scope: { studioId: me.studioId, organizationId: org.id }, tab: `/admin/organizaciones/${org.id}?tab=sistemas` };
}

async function guard<T>(back: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AdapterError) go(back, { error: e.message });
    throw e;
  }
}

const done = (c: Awaited<ReturnType<typeof ctx>>, ok: string): never => {
  revalidatePath(`/admin/organizaciones/${c.scope.organizationId}`);
  go(c.tab, { ok });
};

export async function setSourceAction(fd: FormData) {
  const c = await ctx(fd);
  await guard(c.tab, () => setSource(c.scope, c.me, s(fd, "area"), s(fd, "source")));
  done(c, "Fuente de verdad actualizada.");
}

const OPS: AdapterOp[] = ["sincronizar", "publicar", "pausar", "reanudar", "desconectar", "reconectar"];

export async function adapterOpAction(fd: FormData) {
  const c = await ctx(fd);
  const op = s(fd, "op") as AdapterOp;
  if (!OPS.includes(op)) go(c.tab, { error: "Operación desconocida." });
  const r = await guard(c.tab, () => runOp(c.scope, c.me, s(fd, "adapter"), op));
  revalidatePath(`/admin/organizaciones/${c.scope.organizationId}`);
  go(c.tab, r.ok ? { ok: r.message } : { error: r.message });
}

export async function resolveConflictAction(fd: FormData) {
  const c = await ctx(fd);
  const keep = s(fd, "keep") === "externo" ? "externo" : "faro";
  const id = s(fd, "id");
  switch (s(fd, "kind")) {
    case "tango": {
      const { resolveConflict, TangoSyncError } = await import("@/modules/tango-sync/server");
      try {
        await resolveConflict({ ...c.me, studioId: c.me.studioId }, id, keep === "externo" ? "tango" : "faro");
      } catch (e) {
        if (e instanceof TangoSyncError) go(c.tab, { error: e.message });
        throw e;
      }
      break;
    }
    case "tienda": {
      const { resolveConflict } = await import("@/modules/stock/server");
      await resolveConflict({ ...c.scope, canManage: true }, c.me, id, keep === "faro" ? "usar_faro" : "ajustar_faro");
      break;
    }
    default:
      await guard(c.tab, () => resolveMirrorConflict(c.scope, c.me, id, keep));
  }
  done(c, keep === "faro" ? "Quedó lo de Faro." : "Quedó lo del otro sistema.");
}

export async function editMirrorAction(fd: FormData) {
  const c = await ctx(fd);
  const field = s(fd, "field");
  if (!/^[A-Za-z_]{1,40}$/.test(field)) go(c.tab, { error: "Campo inválido." });
  const r = await guard(c.tab, () => editMirror(c.scope, c.me, s(fd, "record"), { [field]: s(fd, "value") }));
  done(c, r.written ? "Cambio guardado en Faro y en el otro sistema." : "Cambio guardado solo en Faro: ese sistema no permite modificarlo.");
}

export async function startMigrationAction(fd: FormData) {
  const c = await ctx(fd);
  await guard(c.tab, () => startMigration(c.scope, c.me, s(fd, "adapter")));
  done(c, "Trajimos la historia y controlamos los totales. Revisalos y confirmá.");
}

export async function advanceMigrationAction(fd: FormData) {
  const c = await ctx(fd);
  if (s(fd, "cancelar")) {
    await guard(c.tab, () => cancelMigration(c.scope, c.me, s(fd, "id")));
    done(c, "Migración cancelada: no cambió nada.");
  }
  const r = await guard(c.tab, () => advanceMigration(c.scope, c.me, s(fd, "id"), { confirm: s(fd, "confirmo") === "1" }));
  done(c, r.step === "hecha" ? "Listo: la organización ya trabaja en Faro y el otro sistema quedó desconectado, con toda su historia acá." : "Paso hecho.");
}
