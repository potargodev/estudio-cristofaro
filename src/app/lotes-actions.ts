"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BatchError, createBatch, pauseBatch, readTable, retryFailed, startBatch } from "@/modules/lotes/server";
import { batchScope } from "@/modules/lotes/scope";
import { sendBatchMails, sendBatchWhatsApp } from "@/modules/lotes/send";

// Facturación en lote (§2.p, B2). El alcance sale de la sesión (estudio o
// cuenta personal); cada lote se valida contra ese alcance en el módulo.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (path: string, q: Record<string, string>): never => redirect(`${path}?${new URLSearchParams(q)}`);

async function guard<T>(back: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof BatchError) go(back, { error: e.message });
    throw e;
  }
}

export async function createBatchAction(fd: FormData) {
  const { me, scope, base } = await batchScope();
  const file = fd.get("file");
  const text = s(fd, "text");
  const f = file instanceof File && file.size ? file : null;
  const table = await guard(base, () => readTable({ file: f, text }));
  const source = f ? (f.name.toLowerCase().endsWith(".xlsx") ? "excel" : "csv") : "pegado";
  const r = await guard(base, () => createBatch(scope, me, { name: s(fd, "name"), source, mode: s(fd, "mode") === "emitir" ? "emitir" : "borradores", table }));
  revalidatePath(base);
  go(`${base}/${r.batch.id}`, { ok: `Validamos ${r.valid + r.invalid} ${r.valid + r.invalid === 1 ? "comprobante" : "comprobantes"}: ${r.valid} listos y ${r.invalid} con algo para corregir.${r.unknown.length ? ` Columnas que no usamos: ${r.unknown.join(", ")}.` : ""}` });
}

export async function batchAction(fd: FormData) {
  const { me, scope, base } = await batchScope();
  const id = s(fd, "id");
  const back = `${base}/${id}`;
  const op = s(fd, "op");
  if (op === "emitir") await guard(back, () => startBatch(scope, me, id));
  else if (op === "pausar") await guard(back, () => pauseBatch(scope, me, id));
  else if (op === "cancelar") await guard(back, () => pauseBatch(scope, me, id, true));
  else if (op === "reintentar") {
    const n = await guard(back, () => retryFailed(scope, me, id));
    revalidatePath(back);
    go(back, { ok: n ? `${n} ${n === 1 ? "fila volvió" : "filas volvieron"} a la cola.` : "No había filas con error." });
  } else if (op === "whatsapp") {
    const r = await guard(back, () => sendBatchWhatsApp(scope, me, id));
    revalidatePath(back);
    go(back, r.sent ? { lote: r.batchId, ok: `${r.sent} ${r.sent === 1 ? "comprobante" : "comprobantes"} a ${r.phones} ${r.phones === 1 ? "número" : "números"} por WhatsApp.` } : { error: "Ninguna fila emitida tiene teléfono (columna «telefono» en la planilla)." });
  } else if (op === "mail") {
    const r = await guard(back, () => sendBatchMails(scope, me, id));
    revalidatePath(back);
    go(back, r.sent ? { ok: `Mandamos ${r.sent} ${r.sent === 1 ? "comprobante" : "comprobantes"} por mail${r.skipped ? ` (${r.skipped} sin mail del cliente)` : ""}.` } : { error: r.skipped ? "Ningún comprobante tiene mail del cliente (o el correo no está configurado)." : "No hay comprobantes emitidos para mandar." });
  }
  revalidatePath(back);
  go(back, { ok: op === "emitir" ? "En marcha: el progreso se actualiza solo." : op === "pausar" ? "Lote en pausa." : "Lote cancelado: lo que ya salió queda." });
}
