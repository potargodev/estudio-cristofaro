"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFaro, requireTenant } from "@/lib/auth";
import { ModeError, saveGuideCheck, setMode } from "@/modules/simuladores/server";
import { arcaDrop, arcaOutage, connectSimulated, otherSideAction, phoneSend, storeSale } from "@/modules/simuladores/panel";
import { simPay, simPreference } from "@/modules/simuladores/mercadopago";
import { isUuid } from "@/lib/ids";

// Parte C · Acciones de los simuladores. Las del panel (/simuladores) usan el
// espacio de la sesión; los modos los cambia solo el owner de Faro.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (path: string, ok: boolean, text: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${ok ? "ok" : "error"}=${encodeURIComponent(text)}`);

async function run(path: string, ok: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof Error) || (e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    if (!(e instanceof ModeError)) console.error("[simuladores]", e);
    back(path, false, e instanceof ModeError ? e.message : `No se pudo: ${(e as Error).message.slice(0, 200)}`);
  }
  revalidatePath(path.split("?")[0]);
  back(path, true, ok);
}

export async function arcaSimAction(fd: FormData) {
  const me = await requireTenant();
  const op = s(fd, "op");
  await run("/simuladores", op === "corte" ? "Listo: el próximo pedido a ARCA se autoriza pero la respuesta «se corta»." : op === "caida" ? "ARCA quedó «caído» para las CUIT de este espacio." : "ARCA volvió.", () => (op === "corte" ? arcaDrop(me.studioId, me) : arcaOutage(me.studioId, me, op === "caida")));
}

export async function storeSaleAction(fd: FormData) {
  const me = await requireTenant();
  const status = s(fd, "status");
  const doc = s(fd, "doc").replace(/\D/g, "");
  await run("/simuladores#tiendas", status === "paid" ? "Venta enviada: llegó a Faro como el aviso de la tienda." : "Devolución enviada.", () =>
    storeSale(me.studioId, me, {
      storeId: s(fd, "store"),
      qty: Number(s(fd, "qty")) || 1,
      price: Number(s(fd, "price").replace(/\./g, "").replace(",", ".")) || 0,
      status: status === "refunded" || status === "cancelled" ? status : "paid",
      orderId: s(fd, "order") || null,
      buyer: doc.length >= 7 ? { name: s(fd, "buyer") || "Comprador", doc_number: doc } : null,
    }),
  );
}

export async function connectSimAction(fd: FormData) {
  const me = await requireTenant(null, ["dueno", "titular"]);
  const c = s(fd, "connector");
  if (c !== "xubio" && c !== "contabilium" && c !== "tango") back("/simuladores#sistemas", false, "Sistema desconocido.");
  await run("/simuladores#sistemas", "Conectado al simulador. Sincronizá desde Conexiones para traer los datos.", () => connectSimulated(me.studioId, me, c as "xubio" | "contabilium" | "tango"));
}

export async function otherSideSimAction(fd: FormData) {
  const me = await requireTenant();
  const service = s(fd, "service") as "xubio" | "contabilium" | "tango";
  if (!["xubio", "contabilium", "tango"].includes(service)) back("/simuladores#sistemas", false, "Sistema desconocido.");
  await run("/simuladores#sistemas", "Cargado del otro lado: aparece en Faro con la próxima sincronización.", () =>
    otherSideAction(me.studioId, me, { service, kind: s(fd, "kind"), name: s(fd, "name").slice(0, 80), cuit: s(fd, "cuit").replace(/\D/g, "").slice(0, 11), amount: Number(s(fd, "amount")) || 0, id: s(fd, "id") || undefined } as never),
  );
}

export async function phoneAction(fd: FormData) {
  const me = await requireTenant();
  const phone = s(fd, "phone").replace(/\D/g, "");
  const path = `/simuladores/telefono?numero=${phone}`;
  const file = fd.get("file");
  const text = s(fd, "text").slice(0, 1000);
  const audio = s(fd, "audio").slice(0, 1000);
  await run(path, "Enviado.", async () => {
    if (file instanceof File && file.size > 0) {
      if (file.size > 8 * 1024 * 1024) throw new ModeError("El archivo pesa más de 8 MB.");
      const data = Buffer.from(await file.arrayBuffer());
      const type = file.type.startsWith("image/") ? "imagen" : "documento";
      return phoneSend(me.studioId, me, phone, { type, data, mime: file.type || "application/octet-stream", filename: file.name, text: text || undefined });
    }
    // Un audio de prueba: lo que dice viaja como la transcripción que devolvería la IA
    if (audio) return phoneSend(me.studioId, me, phone, { type: "audio", data: Buffer.from(`TRANSCRIPCION:${audio}`), mime: "audio/ogg", filename: "audio.ogg" });
    if (!text) throw new ModeError("Escribí un mensaje, grabá un audio de prueba o adjuntá una foto.");
    return phoneSend(me.studioId, me, phone, { type: "texto", text });
  });
}

/** Checkout simulado de Mercado Pago: lo usa quien tiene el link, como en Mercado Pago */
export async function mpPayAction(fd: FormData) {
  const id = s(fd, "id");
  if (!/^SIM(PREF|SUB)-[0-9a-f]{12}$/.test(id) || !(await simPreference(id))) back("/simuladores/mercadopago/invalido", false, "Ese link de pago no existe.");
  const approve = s(fd, "op") === "pagar";
  await run(`/simuladores/mercadopago/${id}`, approve ? "Pago aprobado. Mercado Pago (simulado) le avisó a Faro." : "Pago rechazado.", () => simPay(id, approve));
}

/** Faro Manager → Integraciones: el modo de un servicio para un espacio o una organización */
export async function setModeAction(fd: FormData) {
  const me = await requireFaro(true);
  const studio = s(fd, "studio");
  const org = s(fd, "org");
  const path = `/faro-manager/integraciones?espacio=${isUuid(studio) ? studio : ""}`;
  await run(path, "Modo guardado.", () => setMode(me, studio, org || null, s(fd, "service"), s(fd, "mode")));
}

/** Faro Manager → Guía de prueba: estado y comentario de un recorrido */
export async function guideCheckAction(fd: FormData) {
  const me = await requireFaro();
  const key = s(fd, "key");
  await run(`/faro-manager/guia#${encodeURIComponent(key)}`, "Guardado.", () => saveGuideCheck(me, key, s(fd, "status"), String(fd.get("comment") ?? "")));
}
