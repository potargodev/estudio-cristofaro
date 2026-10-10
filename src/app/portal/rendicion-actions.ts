"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { fileFromForm } from "@/lib/uploads";
import { parseAmount } from "@/modules/gastos/core/split";
import { createReimbursement, decideReimbursement, markReimbursed } from "@/modules/gastos/server/reimbursements";
import { GastosError } from "@/modules/gastos/server/service";

// Rendiciones de gastos del portal. requireMember resuelve la organización
// activa del usuario en el servidor; el servicio valida rol y pertenencia.

export type RendicionState = { ok?: boolean; message?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function attempt(fn: () => Promise<void>, ok: string): Promise<RendicionState> {
  try {
    await fn();
    revalidatePath("/portal/rendiciones");
    revalidatePath("/portal/gastos-empresa");
    return { ok: true, message: ok };
  } catch (e) {
    if (e instanceof GastosError) return { ok: false, message: e.message };
    throw e;
  }
}

export async function createRendicionAction(_: RendicionState, fd: FormData): Promise<RendicionState> {
  const me = await requireMember("gastos.rendir");
  return attempt(
    () =>
      createReimbursement(me, {
        description: str(fd, "description"),
        amount: parseAmount(str(fd, "amount")) ?? 0,
        currency: str(fd, "currency") || "ARS",
        date: str(fd, "date"),
        category: str(fd, "category"),
        receipt: fileFromForm(fd, "receipt"),
      }).then(() => undefined),
    "Rendición enviada. Te avisamos cuando la revisen.",
  );
}

export async function decideRendicionAction(_: RendicionState, fd: FormData): Promise<RendicionState> {
  const me = await requireMember("finanzas.gestionar");
  const approve = str(fd, "decision") === "aprobar";
  return attempt(() => decideReimbursement(me, str(fd, "id"), approve, str(fd, "reason")), approve ? "Rendición aprobada: ya está en los gastos de la empresa." : "Rendición rechazada.");
}

export async function reimburseAction(_: RendicionState, fd: FormData): Promise<RendicionState> {
  const me = await requireMember("finanzas.gestionar");
  return attempt(() => markReimbursed(me, str(fd, "id")), "Marcada como reintegrada.");
}
