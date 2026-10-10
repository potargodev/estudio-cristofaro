"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isMonth, parseAmount } from "@/modules/bitacora/catalog";
import { archiveCategory, BitacoraError, createEntry, deleteEntry, restoreEntry, saveCategory, updateEntry, type EntryInput } from "@/modules/bitacora/server";
import { requireUser } from "@/modules/bitacora/session";

// Bitácora: el usuario sale SIEMPRE de la sesión y cada función valida que el
// movimiento o la categoría sean suyos.

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

function input(fd: FormData): EntryInput {
  const amount = parseAmount(s(fd, "amount"));
  if (amount === null) throw new BitacoraError("Revisá el monto.");
  return {
    kind: s(fd, "kind") === "ingreso" ? "ingreso" : "gasto",
    amount,
    currency: s(fd, "currency") === "USD" ? "USD" : "ARS",
    date: s(fd, "date") || new Date().toISOString().slice(0, 10),
    categoryId: s(fd, "category") || null,
    description: s(fd, "description"),
    paymentMethod: s(fd, "method") || null,
    note: s(fd, "note") || null,
  };
}

const back = (fd: FormData) => {
  const m = s(fd, "mes");
  return isMonth(m) ? `/bitacora?mes=${m}` : "/bitacora";
};
const go = (base: string, q: string): never => redirect(`${base}${base.includes("?") ? "&" : "?"}${q}`);

export async function createEntryAction(fd: FormData) {
  const me = await requireUser();
  const b = back(fd);
  try {
    const e = await createEntry(me.id, input(fd));
    revalidatePath("/bitacora");
    go(b, `ok=${encodeURIComponent(e.kind === "ingreso" ? "Ingreso cargado" : "Gasto cargado")}&nuevo=${e.id}`);
  } catch (e) {
    if (e instanceof BitacoraError) go(b, `error=${encodeURIComponent(e.message)}`);
    throw e;
  }
}

export async function updateEntryAction(fd: FormData) {
  const me = await requireUser();
  const id = s(fd, "id");
  try {
    await updateEntry(me.id, id, input(fd));
  } catch (e) {
    if (e instanceof BitacoraError) go(`/bitacora/${encodeURIComponent(id)}`, `error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/bitacora");
  go(back(fd), "ok=Movimiento%20actualizado");
}

export async function deleteEntryAction(fd: FormData) {
  const me = await requireUser();
  const id = s(fd, "id");
  try {
    await deleteEntry(me.id, id);
  } catch (e) {
    if (e instanceof BitacoraError) go(back(fd), `error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/bitacora");
  go(back(fd), `ok=Movimiento%20borrado&deshacer=${id}`);
}

export async function restoreEntryAction(fd: FormData) {
  const me = await requireUser();
  try {
    await restoreEntry(me.id, s(fd, "id"));
  } catch (e) {
    if (e instanceof BitacoraError) go(back(fd), `error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/bitacora");
  go(back(fd), "ok=Listo%2C%20lo%20recuperamos");
}

export async function saveCategoryAction(fd: FormData) {
  const me = await requireUser();
  try {
    await saveCategory(me.id, { id: s(fd, "id") || null, name: s(fd, "name"), kind: s(fd, "kind") === "ingreso" ? "ingreso" : "gasto" });
  } catch (e) {
    if (e instanceof BitacoraError) go("/bitacora/categorias", `error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/bitacora");
  go("/bitacora/categorias", "ok=Categor%C3%ADa%20guardada");
}

export async function archiveCategoryAction(fd: FormData) {
  const me = await requireUser();
  try {
    await archiveCategory(me.id, s(fd, "id"), s(fd, "archived") === "1");
  } catch (e) {
    if (e instanceof BitacoraError) go("/bitacora/categorias", `error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/bitacora");
  go("/bitacora/categorias", "ok=Listo");
}

