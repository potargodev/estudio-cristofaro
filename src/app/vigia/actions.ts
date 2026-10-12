"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { setPrefs } from "@/lib/prefs";
import { parseAmount } from "@/modules/bitacora/catalog";
import { confirmProposal, CopilotError, editGroupProposal, editMovementProposal, processMessage, ownMessage, redoProposal, undoProposal } from "@/modules/copilot/server";

// Acciones de las tarjetas del Vigía. El usuario sale de la sesión y cada
// función valida que la tarjeta sea suya.

export interface CardState {
  ok: boolean;
  message?: string;
}

async function me() {
  const u = await getSessionUser();
  if (!u || u.assisted) throw new CopilotError("Tu sesión venció. Volvé a entrar.");
  return { id: u.id, name: u.name, email: u.email, studioId: u.studioId, role: u.role };
}

async function run(fn: () => Promise<unknown>, ok: string): Promise<CardState> {
  try {
    await fn();
    revalidatePath("/vigia");
    revalidatePath("/bitacora");
    return { ok: true, message: ok };
  } catch (e) {
    if (e instanceof CopilotError) return { ok: false, message: e.message };
    throw e;
  }
}

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

export async function confirmCardAction(_p: CardState, fd: FormData): Promise<CardState> {
  const final = s(fd, "final");
  return run(async () => confirmProposal(await me(), s(fd, "id"), final === "dividir" || final === "registrar" ? { final } : undefined), final === "dividir" ? "Listo, dividido: queda pendiente hasta que te pasen su parte." : "Listo, registrado.");
}

export async function undoCardAction(_p: CardState, fd: FormData): Promise<CardState> {
  return run(async () => undoProposal(await me(), s(fd, "id")), "Deshecho.");
}

export async function redoCardAction(_p: CardState, fd: FormData): Promise<CardState> {
  return run(async () => redoProposal(await me(), s(fd, "id")), "Listo, de nuevo registrado.");
}

export async function editMovementCardAction(_p: CardState, fd: FormData): Promise<CardState> {
  const amount = parseAmount(s(fd, "amount"));
  if (amount === null) return { ok: false, message: "Revisá el monto." };
  return run(
    async () =>
      editMovementProposal(await me(), s(fd, "id"), {
        kind: s(fd, "kind") === "ingreso" ? "ingreso" : "gasto",
        amount,
        currency: s(fd, "currency") === "USD" ? "USD" : "ARS",
        date: s(fd, "date"),
        categoryId: s(fd, "category") || null,
        description: s(fd, "description"),
        paymentMethod: s(fd, "method") || null,
        note: s(fd, "note") || null,
      }),
    "Listo, registrado con tus cambios.",
  );
}

export async function editGroupCardAction(_p: CardState, fd: FormData): Promise<CardState> {
  const amount = parseAmount(s(fd, "amount"));
  if (amount === null) return { ok: false, message: "Revisá el monto." };
  return run(async () => editGroupProposal(await me(), s(fd, "id"), { description: s(fd, "description"), amount, date: s(fd, "date") }), "Actualizado. Confirmalo cuando esté bien.");
}

export async function retryMessageAction(fd: FormData) {
  const u = await me();
  const m = await ownMessage(u.id, s(fd, "id"));
  if (m && (m.status === "error" || m.status === "pendiente")) await processMessage(m.id);
  revalidatePath("/vigia");
}

export async function setAutoAction(fd: FormData) {
  const u = await me();
  await setPrefs(u.id, { copilotAuto: fd.get("auto") === "on" });
  revalidatePath("/vigia");
}

