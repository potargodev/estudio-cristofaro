"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveStock, type StockAmbito } from "@/modules/stock/scope";
import {
  adjust,
  closeCount,
  connectStore,
  importProducts,
  importStoreSales,
  linkListing,
  linkPurchaseItem,
  linkUnlinked,
  listStores,
  publishStore,
  resolveConflict,
  saveDeposit,
  saveProduct,
  setStoreSync,
  StockError,
  syncListings,
} from "@/modules/stock/server";
import { StoreError } from "@/modules/stock/adapters";

// Stock (§2.q etapa 7). El alcance sale de la sesión (resolveStock); el ID de
// organización del formulario se vuelve a validar contra el estudio.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => {
  const v = s(fd, k).replace(/\./g, "").replace(",", ".");
  return v === "" ? null : Number(v);
};
const ctx = (fd: FormData) => resolveStock((["estudio", "portal", "personal"].includes(s(fd, "ambito")) ? s(fd, "ambito") : "personal") as StockAmbito, s(fd, "org") || null);
const at = (r: Awaited<ReturnType<typeof ctx>>, ver: string, extra = "") => `${r.base}${r.sep}ver=${ver}${extra}`;

function go(path: string, q: Record<string, string>): never {
  redirect(`${path}&${new URLSearchParams(q)}`);
}

async function guard<T>(back: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof StockError || e instanceof StoreError) go(back, { error: e.message });
    throw e;
  }
}

const file = (fd: FormData) => {
  const f = fd.get("file");
  return f instanceof File && f.size ? f : null;
};

export async function productAction(fd: FormData) {
  const r = await ctx(fd);
  const back = at(r, "productos");
  await guard(back, () => saveProduct(r.scope, r.actor, { code: s(fd, "code"), barcode: s(fd, "barcode") || null, description: s(fd, "description"), unit: s(fd, "unit"), ivaRate: num(fd, "iva_rate") ?? 21, cost: num(fd, "cost") ?? 0, price: num(fd, "price") ?? 0, minStock: num(fd, "min_stock") }, s(fd, "id") || null));
  revalidatePath(r.base.split("?")[0]);
  go(back, { ok: "Producto guardado." });
}

export async function importProductsAction(fd: FormData) {
  const r = await ctx(fd);
  const back = at(r, "productos");
  const f = file(fd);
  if (!f) go(back, { error: "Elegí el archivo." });
  const res = await guard(back, () => importProducts(r.scope, r.actor, f!));
  go(back, res.errors.length ? { error: `${res.created} nuevos y ${res.updated} actualizados. Revisá: ${res.errors.slice(0, 3).map((e) => `fila ${e.row}: ${e.error}`).join(" · ")}` } : { ok: `${res.created} productos nuevos y ${res.updated} actualizados.` });
}

export async function depositAction(fd: FormData) {
  const r = await ctx(fd);
  const back = at(r, "productos");
  await guard(back, () => saveDeposit(r.scope, r.actor, s(fd, "name")));
  go(back, { ok: "Depósito agregado." });
}

export async function adjustAction(fd: FormData) {
  const r = await ctx(fd);
  const back = at(r, "movimientos");
  await guard(back, () => adjust(r.scope, r.actor, { productId: s(fd, "product_id"), depositId: s(fd, "deposit_id") || null, qty: num(fd, "qty") ?? 0, reason: s(fd, "reason") }));
  go(back, { ok: "Ajuste registrado." });
}

export async function countAction(fd: FormData) {
  const r = await ctx(fd);
  const back = at(r, "conteo");
  let lines: { ref: string; counted: number }[] = [];
  try {
    lines = JSON.parse(s(fd, "lines") || "[]");
  } catch {
    go(back, { error: "No pudimos leer el conteo." });
  }
  const res = await guard(back, () => closeCount(r.scope, r.actor, s(fd, "deposit_id") || null, Array.isArray(lines) ? lines : []));
  go(at(r, "movimientos"), { ok: `Conteo cerrado: ${res.products} productos, ${res.adjusted} ${res.adjusted === 1 ? "ajuste" : "ajustes"}${res.unknown.length ? ` (${res.unknown.length} códigos sin producto)` : ""}.` });
}

export async function connectStoreAction(fd: FormData) {
  const r = await ctx(fd);
  const back = at(r, "tiendas");
  const st = await guard(back, () => connectStore(r.scope, r.actor, { platform: s(fd, "platform"), name: s(fd, "name"), shopId: s(fd, "shop_id"), depositId: s(fd, "deposit_id") || null }));
  go(at(r, "tiendas", `&tienda=${st.id}`), { ok: "Tienda conectada. Revisá los vínculos de sus publicaciones." });
}

export async function storeAction(fd: FormData) {
  const r = await ctx(fd);
  const id = s(fd, "store_id");
  const back = at(r, "tiendas", `&tienda=${id}`);
  const op = s(fd, "op");
  if (op === "sync") {
    const n = await guard(back, () => syncListings(r.scope, id));
    go(back, { ok: `${n} publicaciones actualizadas.` });
  }
  if (op === "config") {
    await guard(back, () => setStoreSync(r.scope, r.actor, id, { syncEnabled: fd.get("sync_enabled") === "on", margin: num(fd, "margin") ?? 0, paused: fd.get("paused") === "on" }));
    go(back, { ok: "Configuración guardada." });
  }
  if (op === "publicar") {
    const res = await guard(back, async () => {
      const st = (await listStores(r.scope)).find((x) => x.id === id);
      if (!st) throw new StockError("No encontramos esa tienda.");
      if (!st.sync_enabled || st.paused) throw new StockError("Activá «Publicar la existencia» (y sacá la pausa) para publicar.");
      return publishStore(st.id);
    });
    go(back, { ok: `Publicadas ${res.published}, conflictos ${res.conflicts}, errores ${res.errors}.` });
  }
  if (op === "ventas") {
    const f = file(fd);
    if (!f) go(back, { error: "Elegí el archivo de ventas." });
    const res = await guard(back, () => importStoreSales(r.scope, r.actor, id, f!));
    go(back, { ok: `Ventas importadas: ${res.moved} descontadas, ${res.unlinked} sin vincular.` });
  }
  go(back, { error: "Acción desconocida." });
}

export async function linkListingAction(fd: FormData) {
  const r = await ctx(fd);
  const back = at(r, "tiendas", `&tienda=${s(fd, "store_id")}`);
  const n = await guard(back, () => linkListing(r.scope, r.actor, s(fd, "listing_id"), s(fd, "product_id") || null));
  go(back, { ok: n ? `Vinculada: se descontaron ${n} ventas que esperaban.` : "Vínculo guardado." });
}

export async function conflictAction(fd: FormData) {
  const r = await ctx(fd);
  const back = at(r, "tiendas", `&tienda=${s(fd, "store_id")}`);
  const op = s(fd, "op") as "usar_faro" | "ajustar_faro" | "descartar";
  await guard(back, () => resolveConflict(r.scope, r.actor, s(fd, "id"), ["usar_faro", "ajustar_faro", "descartar"].includes(op) ? op : "descartar"));
  go(back, { ok: "Diferencia resuelta." });
}

export async function unlinkedAction(fd: FormData) {
  const r = await ctx(fd);
  const back = at(r, "sin-vincular");
  await guard(back, () => linkUnlinked(r.scope, r.actor, s(fd, "id"), s(fd, "product_id") || null));
  go(back, { ok: s(fd, "product_id") ? "Venta vinculada: ya descontó." : "Venta ignorada." });
}

export async function purchaseLinkAction(fd: FormData) {
  const r = await ctx(fd);
  const back = at(r, "sin-vincular");
  await guard(back, () => linkPurchaseItem(r.scope, r.actor, s(fd, "doc_id"), Number(s(fd, "line")), s(fd, "product_id") || "nuevo"));
  go(back, { ok: "Compra vinculada: sumó al stock y Faro lo recuerda para la próxima." });
}
