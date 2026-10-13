"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { ipc_series } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireFaro } from "@/lib/auth";
import { fetchIndexes, saveIndexes, setIndexSource } from "@/modules/contabilidad/inflacion-server";
import { AccountingError } from "@/modules/contabilidad/server";

// Índices de la plataforma: la serie del IPC (INDEC) que usa la Bitácora para
// mostrar montos ajustados por inflación. Se carga a mano o pegando la serie.

const PATH = "/faro-manager/indices";

export async function saveIpcAction(fd: FormData) {
  const faro = await requireFaro(true);
  const source = String(fd.get("source") ?? "").trim() || "INDEC · IPC nivel general (base dic-2016 = 100)";
  const rows = String(fd.get("series") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [month, value] = l.split(/[;\t,]\s*/);
      return { month: (month ?? "").trim(), value: Number((value ?? "").trim().replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) };
    });
  if (!rows.length || rows.some((r) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month) || !(r.value > 0)))
    redirect(`${PATH}?${new URLSearchParams({ error: "Revisá la serie: una fila por mes, «AAAA-MM;valor» con valores positivos." })}`);
  for (const r of rows) {
    const v = { month: r.month, value: String(r.value), source, updated_by: faro.id };
    await getDb().insert(ipc_series).values(v).onConflictDoUpdate({ target: ipc_series.month, set: v });
  }
  await audit({ studioId: null, actor: faro, action: "faro.ipc", metadata: { meses: rows.length, desde: rows[0].month, hasta: rows[rows.length - 1].month, fuente: source } });
  revalidatePath(PATH);
  redirect(`${PATH}?${new URLSearchParams({ ok: `Guardamos ${rows.length} mes${rows.length === 1 ? "" : "es"} del IPC.` })}`);
}

// Índices para el ajuste por inflación contable (A2): serie de la FACPCE,
// pegada a mano o traída de una fuente configurable.

async function inflation<T>(fn: () => Promise<T>, ok: (r: T) => string) {
  let r: T;
  try {
    r = await fn();
  } catch (e) {
    if (e instanceof AccountingError) redirect(`${PATH}?${new URLSearchParams({ error: e.message })}`);
    throw e;
  }
  revalidatePath(PATH);
  redirect(`${PATH}?${new URLSearchParams({ ok: ok(r) })}`);
}

export async function saveInflationIndexesAction(fd: FormData) {
  const faro = await requireFaro(true);
  await inflation(() => saveIndexes(faro, String(fd.get("series") ?? ""), String(fd.get("source") ?? "")), (n) => `Guardamos ${n} mes${n === 1 ? "" : "es"} del índice FACPCE.`);
}

export async function inflationSourceAction(fd: FormData) {
  const faro = await requireFaro(true);
  await inflation(() => setIndexSource(faro, String(fd.get("url") ?? ""), String(fd.get("name") ?? "")), () => "Fuente guardada.");
}

export async function fetchInflationAction() {
  const faro = await requireFaro(true);
  await inflation(() => fetchIndexes(faro), (n) => `Traímos ${n} mes${n === 1 ? "" : "es"} de la fuente.`);
}
