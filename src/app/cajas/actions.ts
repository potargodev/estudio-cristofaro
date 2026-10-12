"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isMonth, parseAmount } from "@/modules/bitacora/catalog";
import { requireUser } from "@/modules/bitacora/session";
import { addBusinessEntry, CajaError, contribute, deleteBoxEntry, dismissBusinessHint, moveToBusiness, openBusinessBox, paySalary, setSalary } from "@/modules/cajas/server";
import { addSharedEntry, pairBoxFromHogar, boxInviteLink, confirmEntry, confirmSharePaid, createGoal, createSharedBox, deleteSharedEntry, joinBox, leaveBox } from "@/modules/cajas/shared";
import { todayAR } from "@/lib/format";
import { internalPath } from "@/lib/paths";

// Mis cajas: el usuario sale siempre de la sesión y cada función del servidor
// valida que sea integrante de la caja (nunca se confía en el ID del navegador).

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const go = (base: string, q: Record<string, string>): never => redirect(`${base}${base.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`);
const boxPath = (fd: FormData) => {
  const id = s(fd, "box");
  const m = s(fd, "mes");
  return `/cajas/${encodeURIComponent(id)}${isMonth(m) ? `?mes=${m}` : ""}`;
};
async function guard<T>(back: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof CajaError) go(back, { error: e.message });
    throw e;
  }
}
const amountOf = (fd: FormData, k = "amount") => {
  const a = parseAmount(s(fd, k));
  if (a === null || a <= 0) throw new CajaError("Revisá el monto.");
  return a;
};

export async function openBusinessAction(fd: FormData) {
  const me = await requireUser();
  const box = await openBusinessBox(me, s(fd, "name") || "Mi negocio");
  revalidatePath("/cajas");
  go(`/cajas/${box.id}`, { ok: "Abriste tu caja de negocio. Lo de tu actividad va acá, separado de lo personal." });
}

export async function addBusinessEntryAction(fd: FormData) {
  const me = await requireUser();
  const back = boxPath(fd);
  await guard(back, () =>
    addBusinessEntry(me, s(fd, "box"), {
      kind: s(fd, "kind") === "ingreso" ? "ingreso" : "gasto",
      amount: amountOf(fd),
      currency: s(fd, "currency") === "USD" ? "USD" : "ARS",
      date: s(fd, "date") || todayAR(),
      category: s(fd, "category"),
      description: s(fd, "description"),
      note: s(fd, "note") || null,
      invoiced: fd.get("invoiced") === "on",
      deductible: fd.get("deductible") === "on",
    }),
  );
  revalidatePath("/cajas", "layout");
  go(back, { ok: "Cargado en la caja de negocio." });
}

export async function deleteBoxEntryAction(fd: FormData) {
  const me = await requireUser();
  const back = boxPath(fd);
  await guard(back, () => deleteBoxEntry(me, s(fd, "box"), s(fd, "id")));
  revalidatePath("/cajas", "layout");
  revalidatePath("/bitacora");
  go(back, { ok: "Borrado." });
}

export async function moveToBusinessAction(fd: FormData) {
  const me = await requireUser();
  const back = internalPath(s(fd, "volver"), "/cajas");
  const row = await guard(back, () => moveToBusiness(me, s(fd, "id")));
  revalidatePath("/bitacora");
  revalidatePath("/cajas", "layout");
  go(`/cajas/${row.box_id}`, { ok: "Lo moviste a la caja de negocio: ya no está en lo personal." });
}

export async function dismissHintAction(fd: FormData) {
  const me = await requireUser();
  await dismissBusinessHint(me.id, s(fd, "id"));
  revalidatePath("/cajas");
  go("/cajas", { ok: "Listo, queda en lo personal." });
}

export async function setSalaryAction(fd: FormData) {
  const me = await requireUser();
  const back = boxPath(fd);
  await guard(back, async () => setSalary(me, s(fd, "box"), { amount: amountOf(fd), frequency: s(fd, "frequency"), nextDate: s(fd, "next_date") || todayAR(), active: fd.get("active") === "on" }));
  revalidatePath("/cajas", "layout");
  go(back, { ok: "Sueldo guardado: se registra solo en cada fecha." });
}

export async function paySalaryAction(fd: FormData) {
  const me = await requireUser();
  const back = boxPath(fd);
  await guard(back, async () => paySalary(me, s(fd, "box"), { amount: amountOf(fd), date: s(fd, "date") || undefined }));
  revalidatePath("/cajas", "layout");
  revalidatePath("/bitacora");
  go(back, { ok: "Sueldo registrado: salió del negocio y entró en tu caja personal." });
}

export async function contributeAction(fd: FormData) {
  const me = await requireUser();
  const back = boxPath(fd);
  await guard(back, async () => contribute(me, s(fd, "box"), { amount: amountOf(fd), date: s(fd, "date") || undefined, note: s(fd, "note") || null }));
  revalidatePath("/cajas", "layout");
  revalidatePath("/bitacora");
  go(back, { ok: "Aporte registrado: salió de tu caja personal y entró en el negocio." });
}

// ── Cajas compartidas ────────────────────────────────────────────────

export async function createSharedBoxAction(fd: FormData) {
  const me = await requireUser();
  const box = await guard("/cajas/nueva", () => createSharedBox(me, s(fd, "purpose")));
  revalidatePath("/cajas");
  go(`/cajas/${box.id}`, { ok: "Caja lista. Invitá a los demás con el enlace." });
}

export interface LinkState {
  link?: string;
  message?: string;
}

export async function boxLinkAction(_: LinkState, fd: FormData): Promise<LinkState> {
  const me = await requireUser();
  try {
    return { link: await boxInviteLink(me, s(fd, "box"), s(fd, "renew") === "1") };
  } catch (e) {
    if (e instanceof CajaError) return { message: e.message };
    throw e;
  }
}

export async function joinBoxAction(fd: FormData) {
  const me = await requireUser();
  const token = s(fd, "token");
  const box = await guard(`/caja/${encodeURIComponent(token)}`, () => joinBox(me, token));
  revalidatePath("/cajas");
  go(`/cajas/${box.id}`, { ok: "Te sumaste a la caja." });
}

export async function leaveBoxAction(fd: FormData) {
  const me = await requireUser();
  await guard(boxPath(fd), () => leaveBox(me, s(fd, "box")));
  revalidatePath("/cajas");
  go("/cajas", { ok: "Saliste de la caja." });
}

export async function addSharedEntryAction(fd: FormData) {
  const me = await requireUser();
  const back = boxPath(fd);
  const kind = s(fd, "kind") === "ahorro" ? "ahorro" : s(fd, "kind") === "ingreso" ? "ingreso" : "gasto";
  await guard(back, () =>
    addSharedEntry(me, s(fd, "box"), {
      kind,
      amount: amountOf(fd),
      date: s(fd, "date") || undefined,
      category: s(fd, "category"),
      description: s(fd, "description") || (kind === "ahorro" ? "Ahorro" : ""),
      note: s(fd, "note") || null,
      paidBy: s(fd, "paid_by") || null,
      mode: s(fd, "final") === "dividir" ? "dividir" : "registrar",
      splitWith: fd.getAll("split").map(String),
      alsoPersonal: fd.get("personal") === "on",
      goalId: s(fd, "goal") || null,
    }),
  );
  revalidatePath("/cajas", "layout");
  revalidatePath("/bitacora");
  go(back, { ok: s(fd, "final") === "dividir" ? "Dividido. Cada parte queda pendiente hasta que quien la debe confirme que la pagó." : "Registrado." });
}

export async function confirmEntryAction(fd: FormData) {
  const me = await requireUser();
  const back = boxPath(fd);
  await guard(back, () => (s(fd, "what") === "parte" ? confirmSharePaid(me, s(fd, "box"), s(fd, "id")) : confirmEntry(me, s(fd, "box"), s(fd, "id"))));
  revalidatePath("/cajas", "layout");
  go(back, { ok: "Confirmado: ya cuenta en tu seguimiento." });
}

export async function deleteSharedEntryAction(fd: FormData) {
  const me = await requireUser();
  const back = boxPath(fd);
  await guard(back, () => deleteSharedEntry(me, s(fd, "box"), s(fd, "id")));
  revalidatePath("/cajas", "layout");
  revalidatePath("/bitacora");
  go(back, { ok: "Borrado." });
}

export async function createGoalAction(fd: FormData) {
  const me = await requireUser();
  const back = boxPath(fd);
  await guard(back, () => createGoal(me, s(fd, "box"), s(fd, "name"), amountOf(fd, "target")));
  revalidatePath("/cajas", "layout");
  go(back, { ok: "Meta creada." });
}

export async function pairFromHogarAction(fd: FormData) {
  const me = await requireUser();
  const box = await guard("/bitacora/compartida", () => pairBoxFromHogar(me, s(fd, "id")));
  revalidatePath("/cajas");
  go(`/cajas/${box.id}`, { ok: "Armaste la caja de pareja con quien compartías el Hogar. El Hogar sigue igual." });
}
