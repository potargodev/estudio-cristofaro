"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant, type StaffUser } from "@/lib/auth";
import { checkUpload, fileFromForm, storeUpload } from "@/lib/uploads";
import { emailInvoice } from "@/modules/arca/mail";
import { invoicePaymentLink } from "@/modules/billing/collect";
import { BillingError, deleteAccount, saveAccount } from "@/modules/billing/mp";
import {
  ArcaError,
  actorOf,
  createDraft,
  deleteCustomer,
  deleteDraft,
  deleteProduct,
  emitInvoice,
  fetchSituation,
  getInvoice,
  issuerFromForm,
  saveAdjustment,
  saveCheck,
  saveCustomer,
  saveProduct,
  saveProfile,
  saveSettings,
  setShare,
  syncPoints,
  type DraftInput,
  type IssuerScope,
} from "@/modules/arca/server";
import { LegendError, saveLegendProfile } from "@/modules/leyendas/server";

// Acciones de facturación y ARCA. El emisor sale de la sesión: sin `org` es
// la cuenta personal; con `org`, una organización del estudio (validada).

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string) => {
  const v = s(fd, k).replace(/\./g, "").replace(",", ".");
  return v === "" ? NaN : Number(v);
};

/** Usuario del tenant con su seguridad completa (2FA en el estudio, contraseña definitiva, tenant activo); nunca en acceso asistido */
async function session(): Promise<StaffUser> {
  const u = await requireTenant();
  if (u.assisted) redirect("/admin");
  return u;
}

/** Redirige con un aviso; los errores conocidos vuelven a la misma pantalla */
function back(path: string, params: Record<string, string>): never {
  const url = new URL(path, "http://x");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  redirect(`${url.pathname}${url.search}`);
}

async function guard<T>(path: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ArcaError) back(path, { error: e.message });
    throw e;
  }
}

function draftFrom(fd: FormData): DraftInput {
  let items: DraftInput["items"] = [];
  try {
    items = JSON.parse(s(fd, "items") || "[]");
  } catch {
    items = [];
  }
  const customerId = s(fd, "customer_id");
  return {
    cbteType: Number(s(fd, "cbte_type")) || null,
    pointOfSale: Number(s(fd, "point_of_sale")),
    issueDate: s(fd, "issue_date"),
    concept: Number(s(fd, "concept")) || 2,
    serviceFrom: s(fd, "service_from") || null,
    serviceTo: s(fd, "service_to") || null,
    paymentDue: s(fd, "payment_due") || null,
    customerId: customerId || null,
    customer: customerId ? null : { docType: Number(s(fd, "doc_type")), docNumber: s(fd, "doc_number"), name: s(fd, "customer_name"), ivaCondition: s(fd, "iva_condition"), email: s(fd, "customer_email"), address: s(fd, "customer_address") },
    saveCustomer: fd.get("save_customer") === "on",
    items,
    currency: s(fd, "currency") === "DOL" ? "DOL" : "PES",
    exchangeRate: n(fd, "exchange_rate") || 1,
    associatedInvoiceId: s(fd, "associated") || null,
    notes: s(fd, "notes") || null,
  };
}

const done = (scope: IssuerScope) => {
  revalidatePath(scope.base, "layout");
  revalidatePath(scope.home.split("?")[0]);
};

export async function saveDraftAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const id = s(fd, "id") || null;
  const inv = await guard(id ? `${scope.base}/${id}` : `${scope.base}/nueva`, () => createDraft(scope, draftFrom(fd), actorOf(u), "manual", id));
  done(scope);
  back(`${scope.base}/${inv.id}`, { ok: "Borrador guardado. Revisalo y emitilo cuando esté listo." });
}

export async function emitAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const id = s(fd, "id");
  if (fd.get("confirmo") !== "on") back(`${scope.base}/${id}`, { error: "Para emitir tenés que confirmar que los datos están bien." });
  const inv = await guard(`${scope.base}/${id}`, () => emitInvoice(scope, id, actorOf(u), "manual"));
  done(scope);
  back(
    `${scope.base}/${id}`,
    inv.status === "autorizada"
      ? { ok: `Listo: ARCA lo autorizó con el CAE ${inv.cae}.` }
      : inv.status === "en_cola"
        ? { ok: `ARCA no responde: quedó en cola con el número previsto ${inv.reserved_number}. Se emite solo cuando ARCA vuelva y te avisamos.` }
        : { error: inv.error ?? "ARCA rechazó el comprobante." },
  );
}

/**
 * §2.p B10 · Factura rápida: cliente, descripción e importe final, y un toque
 * en «Emitir» (esa es la aprobación de quien factura). Arma y emite en el
 * mismo paso; guarda cuánto tardó desde que se abrió el formulario.
 */
export async function quickEmitAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const path = `${scope.base}/rapida`;
  const total = n(fd, "amount");
  if (!(total > 0)) back(path, { error: "Poné el importe." });
  const customerId = s(fd, "customer_id");
  const doc = s(fd, "doc").replace(/\D/g, "");
  const name = s(fd, "customer_name") || "Consumidor final";
  const customer = customerId
    ? null
    : doc.length === 11
      ? { docType: 80, docNumber: doc, name, ivaCondition: s(fd, "iva_condition") || "consumidor_final" }
      : doc.length >= 7 && doc.length <= 8
        ? { docType: 96, docNumber: doc, name, ivaCondition: "consumidor_final" }
        : { docType: 99, docNumber: "0", name, ivaCondition: "consumidor_final" };
  const { getSettings, listPoints } = await import("@/modules/arca/server");
  const [settings, points] = await Promise.all([getSettings(scope), listPoints(scope)]);
  const discriminates = settings.iva_condition === "responsable_inscripto";
  const draft = await guard(path, () =>
    createDraft(
      scope,
      {
        pointOfSale: Number(s(fd, "point_of_sale")) || points.find((p) => !p.blocked)?.number || 1,
        issueDate: "",
        concept: Number(s(fd, "concept")) || 2,
        customerId: customerId || null,
        customer,
        saveCustomer: !customerId && customer?.docType !== 99,
        items: [{ description: s(fd, "description") || "Servicios", quantity: 1, unitPrice: discriminates ? Math.round((total / 1.21) * 100) / 100 : total, ivaRate: 21 }],
        idempotencyKey: s(fd, "nonce") ? `rapida:${u.id}:${s(fd, "nonce").slice(0, 40)}` : null,
      },
      actorOf(u),
    ),
  );
  const inv = draft.status === "borrador" ? await guard(path, () => emitInvoice(scope, draft.id, actorOf(u), "manual")) : draft;
  const started = Number(s(fd, "started_at"));
  const seconds = started > 0 ? Math.max(0, Math.round((Date.now() - started) / 100) / 10) : null;
  const { audit } = await import("@/lib/audit");
  await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor: u, action: "factura.rapida", entityType: "factura", entityId: inv.id, metadata: { segundos: seconds, estado: inv.status } });
  done(scope);
  const took = seconds != null ? ` en ${String(seconds).replace(".", ",")} s` : "";
  back(
    `${scope.base}/${inv.id}`,
    inv.status === "autorizada"
      ? { ok: `Listo${took}: ARCA lo autorizó con el CAE ${inv.cae}.` }
      : inv.status === "en_cola"
        ? { ok: `ARCA no responde: quedó en cola con el número previsto ${inv.reserved_number} y sale solo cuando vuelva.` }
        : { error: inv.error ?? "ARCA rechazó el comprobante." },
  );
}

/** §2.p B10 · Empezar a facturar en 3 pasos: datos de la CUIT, delegación y factura de prueba en homologación */
export async function onboardingAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const path = `${scope.base}/empezar`;
  const op = s(fd, "op");
  if (op === "datos") {
    await guard(path, () => saveSettings(scope, { businessName: s(fd, "business_name"), ivaCondition: s(fd, "iva_condition"), address: s(fd, "address") || null }, actorOf(u)));
    done(scope);
    back(path, { ok: "Datos guardados. Ahora, la delegación." });
  }
  if (op === "delegacion") {
    const list = await guard(path, () => syncPoints(scope, actorOf(u)));
    done(scope);
    back(path, list.some((p) => !p.blocked) ? { ok: `¡Delegación lista! ARCA nos dio ${list.length} punto${list.length === 1 ? "" : "s"} de venta.` } : { error: "ARCA no tiene puntos de venta para web services en esa CUIT. Creá uno («RECE para aplicativo y web services») y volvé a probar." });
  }
  const { testInvoice } = await import("@/modules/arca/server");
  const r = await guard(path, () => testInvoice(scope, actorOf(u)));
  done(scope);
  back(path, r.ok ? { ok: `Factura de prueba autorizada en homologación (CAE ${r.cae}). Ya podés facturar.` } : { error: `La factura de prueba no salió: ${r.error ?? "ARCA la rechazó"}.` });
}

export async function deleteDraftAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  await deleteDraft(scope, s(fd, "id"), actorOf(u));
  done(scope);
  back(scope.home, { ok: "Borrador eliminado." });
}

/** Nota de crédito o débito sobre una factura autorizada: arma el borrador con los mismos datos */
export async function noteFromInvoiceAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const id = s(fd, "id");
  const kind = s(fd, "kind") === "debito" ? "debito" : "credito";
  const inv = await getInvoice(scope, id);
  if (!inv || inv.status !== "autorizada") back(scope.home, { error: "La factura no está autorizada." });
  const offset = kind === "credito" ? 2 : 1;
  const draft = await guard(`${scope.base}/${id}`, () =>
    createDraft(
      scope,
      {
        cbteType: inv.cbte_type + offset,
        pointOfSale: inv.point_of_sale,
        issueDate: new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10),
        concept: inv.concept,
        serviceFrom: inv.service_from,
        serviceTo: inv.service_to,
        paymentDue: inv.payment_due,
        customer: { docType: inv.customer_doc_type, docNumber: inv.customer_doc_number, name: inv.customer_name, ivaCondition: inv.customer_iva_condition, email: inv.customer_email, address: inv.customer_address },
        items: inv.items,
        currency: inv.currency as "PES" | "DOL",
        exchangeRate: Number(inv.exchange_rate),
        associatedInvoiceId: inv.id,
        notes: kind === "credito" ? "Anulación total o parcial" : "Ajuste",
      },
      actorOf(u),
    ),
  );
  done(scope);
  back(`${scope.base}/${draft.id}/editar`, { ok: `Armamos la nota de ${kind === "credito" ? "crédito" : "débito"}. Ajustá los importes y guardala.` });
}

export async function emailAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const id = s(fd, "id");
  const sent = await guard(`${scope.base}/${id}`, () => emailInvoice(scope, id, s(fd, "to"), actorOf(u)));
  done(scope);
  back(`${scope.base}/${id}`, sent ? { ok: "Enviado por mail." } : { error: "El mail no salió (el servidor de correo no está configurado). Compartí el link." });
}

export async function shareAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const id = s(fd, "id");
  await guard(`${scope.base}/${id}`, () => setShare(scope, id, s(fd, "on") === "1", actorOf(u)));
  done(scope);
  back(`${scope.base}/${id}`, { ok: s(fd, "on") === "1" ? "Generamos un link nuevo para compartir." : "El link quedó desactivado." });
}

export async function fetchSituationAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const path = s(fd, "volver") || scope.home;
  await guard(path, () => fetchSituation(scope, actorOf(u)));
  done(scope);
  back(path, { ok: "Consultamos ARCA: la situación quedó actualizada." });
}

export async function syncPointsAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const path = s(fd, "volver") || scope.home;
  const list = await guard(path, () => syncPoints(scope, actorOf(u)));
  done(scope);
  back(path, { ok: list.length ? `ARCA respondió: ${list.length} punto${list.length === 1 ? "" : "s"} de venta para web services. La delegación funciona.` : "La delegación funciona, pero no hay puntos de venta para web services: creá uno en ARCA (ABM de puntos de venta)." });
}

export async function saveSettingsAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const path = s(fd, "volver") || scope.home;
  let logoPath: string | null | undefined;
  const file = fileFromForm(fd, "logo");
  if (file) {
    if (!/^image\/(png|jpeg)$/.test(file.type)) back(path, { error: "El logo tiene que ser PNG o JPG." });
    const check = await checkUpload(file);
    if (!check.ok) back(path, { error: check.error });
    logoPath = (await storeUpload(file, scope.studioId, scope.organizationId)).storagePath;
  }
  if (fd.get("quitar_logo") === "on") logoPath = null;
  await guard(path, () =>
    saveSettings(
      scope,
      { businessName: s(fd, "business_name"), ivaCondition: s(fd, "iva_condition"), address: s(fd, "address"), activityStart: s(fd, "activity_start"), iibb: s(fd, "iibb"), color: s(fd, "color"), email: s(fd, "email"), phone: s(fd, "phone"), website: s(fd, "website"), footer: s(fd, "footer"), logoPath, ...(fd.has("cbu") ? { cbu: s(fd, "cbu") || null, fceTransfer: s(fd, "fce_transfer") || "SCA" } : {}) },
      actorOf(u),
    ),
  );
  done(scope);
  back(path, { ok: "Datos de facturación guardados." });
}

/** §2.q etapa 5: perfil de leyendas obligatorias del emisor */
export async function saveLegendsAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const path = s(fd, "volver") || scope.home;
  if (!scope.canEmit) back(path, { error: "Las leyendas las configura quien puede emitir." });
  const num = (k: string) => (s(fd, k) === "" ? null : Number(s(fd, k).replace(",", ".")));
  try {
    await saveLegendProfile(
      scope,
      { isibCaba: s(fd, "isib_caba") as never, isibAlicuota: num("isib_alicuota"), isibPromocion: fd.get("isib_promocion") === "on", isibExento: fd.get("isib_exento") === "on", sujetaRetencion: fd.get("sujeta_retencion") === "on", otrosNacionalesPct: num("otros_nacionales") ?? 0 },
      actorOf(u),
    );
  } catch (e) {
    if (e instanceof LegendError) back(path, { error: e.message });
    throw e;
  }
  done(scope);
  back(path, { ok: "Leyendas guardadas: salen solas en los próximos comprobantes." });
}

export async function saveCustomerAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const path = s(fd, "volver") || scope.home;
  await guard(path, () => saveCustomer(scope, { docType: Number(s(fd, "doc_type")), docNumber: s(fd, "doc_number"), name: s(fd, "name"), ivaCondition: s(fd, "iva_condition"), email: s(fd, "email"), address: s(fd, "address") }, s(fd, "id") || null));
  done(scope);
  back(path, { ok: "Cliente guardado." });
}

export async function deleteCustomerAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  await deleteCustomer(scope, s(fd, "id"));
  done(scope);
  back(s(fd, "volver") || scope.home, { ok: "Cliente eliminado." });
}

export async function saveProductAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const path = s(fd, "volver") || scope.home;
  const rate = s(fd, "iva_rate");
  await guard(path, () => saveProduct(scope, { description: s(fd, "description"), unitPrice: n(fd, "unit_price"), ivaRate: rate === "" ? null : Number(rate) }));
  done(scope);
  back(path, { ok: "Producto guardado." });
}

export async function deleteProductAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  await deleteProduct(scope, s(fd, "id"));
  done(scope);
  back(s(fd, "volver") || scope.home, { ok: "Producto eliminado." });
}

export async function saveAdjustmentAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const path = s(fd, "volver") || scope.home;
  await guard(path, () => saveAdjustment(scope, s(fd, "month"), n(fd, "amount") || 0, s(fd, "note") || null, actorOf(u)));
  done(scope);
  back(path, { ok: "Facturación del mes guardada." });
}

export async function saveProfileAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const path = s(fd, "volver") || scope.home;
  await guard(path, () =>
    saveProfile(scope, { regime: s(fd, "regime"), category: s(fd, "category") || null, iibb: s(fd, "iibb"), jurisdiction: s(fd, "jurisdiction") || null, autonomos: fd.get("autonomos") === "on", alertsEmail: fd.get("alerts_email") === "on", alertDays: Number(s(fd, "alert_days")) || 3 }, actorOf(u)),
  );
  done(scope);
  back(path, { ok: "Perfil guardado: armamos tu calendario de los próximos 6 meses." });
}

export async function saveCheckAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const path = s(fd, "volver") || scope.home;
  const amount = n(fd, "amount");
  await guard(path, () => saveCheck(scope, s(fd, "key"), { status: s(fd, "status"), finding: s(fd, "finding") || null, amount: Number.isFinite(amount) ? amount : null, everyDays: Number(s(fd, "every_days")) || 30 }, actorOf(u)));
  done(scope);
  back(path, { ok: "Chequeo guardado. Te lo recordamos cuando toque." });
}

/** Link de pago (Mercado Pago del autónomo) para un comprobante autorizado */
export async function paymentLinkAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const id = s(fd, "id");
  if (scope.kind !== "personal") back(`${scope.base}/${id}`, { error: "Los links de pago son para las facturas de Faro Personal." });
  try {
    await invoicePaymentLink(scope, actorOf(u), id);
  } catch (e) {
    if (e instanceof BillingError) back(`${scope.base}/${id}`, { error: e.message });
    throw e;
  }
  done(scope);
  back(`${scope.base}/${id}`, { ok: "Link de pago creado: ya está en el PDF y en el mail." });
}

export async function savePersonalMpAction(fd: FormData) {
  const u = await session();
  if (u.role !== "titular" || u.tenantKind !== "personal") back("/facturacion/ajustes", { error: "Solo el titular." });
  try {
    await saveAccount(u.studioId, u, { accessToken: s(fd, "access_token"), publicKey: s(fd, "public_key"), webhookSecret: s(fd, "webhook_secret") });
  } catch (e) {
    if (e instanceof BillingError) back("/facturacion/ajustes", { error: e.message });
    throw e;
  }
  back("/facturacion/ajustes", { ok: "Cuenta de Mercado Pago conectada." });
}

export async function deletePersonalMpAction() {
  const u = await session();
  if (u.role !== "titular" || u.tenantKind !== "personal") back("/facturacion/ajustes", { error: "Solo el titular." });
  await deleteAccount(u.studioId, u);
  back("/facturacion/ajustes", { ok: "Cuenta desconectada." });
}

// ───────────── §2.p (B3): padrón, presupuestos, remitos, recibos y recurrentes ─────────────

/** Datos de una CUIT en el padrón de ARCA para autocompletar el cliente (no guarda nada) */
export async function padronLookupAction(cuit: string): Promise<{ ok: true; name: string; ivaCondition: string; address: string | null } | { ok: false; error: string }> {
  const u = await session();
  const c = String(cuit ?? "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(c)) return { ok: false, error: "La CUIT tiene 11 números." };
  const { lookupTaxpayer } = await import("@/modules/arca/server");
  try {
    const p = await lookupTaxpayer(u.studioId, c, actorOf(u));
    return { ok: true, name: p.name, ivaCondition: p.regime === "otro" ? "consumidor_final" : p.regime, address: p.address };
  } catch (e) {
    return { ok: false, error: e instanceof ArcaError ? e.message : "No pudimos consultar el padrón." };
  }
}

/** Ítems del formulario: JSON en «items» o filas desc0…desc4 / cant0 / precio0 / iva0 */
const docItems = (fd: FormData) => {
  if (s(fd, "items")) {
    try {
      const raw = JSON.parse(s(fd, "items")) as { description: string; quantity: number; unitPrice: number; ivaRate?: number | null }[];
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }
  const out: { description: string; quantity: number; unitPrice: number; ivaRate: number | null }[] = [];
  for (let i = 0; i < 5; i++) {
    if (!s(fd, `desc${i}`)) continue;
    out.push({ description: s(fd, `desc${i}`), quantity: n(fd, `cant${i}`) || 1, unitPrice: n(fd, `precio${i}`), ivaRate: s(fd, `iva${i}`) ? n(fd, `iva${i}`) : null });
  }
  return out;
};

export async function createDocAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const path = s(fd, "volver") || scope.home;
  const { createDoc, DocError, isDocKind } = await import("@/modules/facturacion-plus/server");
  const kind = s(fd, "kind");
  if (!isDocKind(kind)) back(path, { error: "Tipo inválido." });
  let id = "";
  try {
    const d = await createDoc(scope, actorOf(u), { kind, issueDate: s(fd, "date"), validUntil: s(fd, "valid_until"), customer: { name: s(fd, "customer_name"), docType: Number(s(fd, "doc_type")) || 99, docNumber: s(fd, "doc_number"), ivaCondition: s(fd, "iva_condition") || "consumidor_final", email: s(fd, "customer_email") }, items: docItems(fd), paymentMethod: s(fd, "payment_method"), notes: s(fd, "notes") });
    id = d.id;
  } catch (e) {
    if (e instanceof DocError) back(path, { error: e.message });
    throw e;
  }
  done(scope);
  back(path, { ok: "Listo: el comprobante quedó guardado con su número.", doc: id });
}

export async function docAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const path = s(fd, "volver") || scope.home;
  const { DocError, quoteToInvoice, setDocStatus } = await import("@/modules/facturacion-plus/server");
  const op = s(fd, "op");
  try {
    if (op === "facturar") {
      const pos = Number(s(fd, "point_of_sale")) || 1;
      const draft = await quoteToInvoice(scope, actorOf(u), s(fd, "id"), pos);
      done(scope);
      back(`${scope.base}/${draft.id}`, { ok: "Armamos la factura con los datos del presupuesto: revisala y emitila." });
    }
    await setDocStatus(scope, actorOf(u), s(fd, "id"), op === "anular" ? "anulado" : "aceptado");
  } catch (e) {
    if (e instanceof DocError || e instanceof ArcaError) back(path, { error: e.message });
    throw e;
  }
  done(scope);
  back(path, { ok: op === "anular" ? "Anulado." : "Marcado como aceptado." });
}

export async function recurringAction(fd: FormData) {
  const u = await session();
  const scope = await issuerFromForm(u, fd);
  const path = s(fd, "volver") || scope.home;
  const { DocError, saveRecurring, toggleRecurring } = await import("@/modules/facturacion-plus/server");
  try {
    if (s(fd, "op") === "pausar" || s(fd, "op") === "reanudar") await toggleRecurring(scope, actorOf(u), s(fd, "id"), s(fd, "op") === "reanudar");
    else
      await saveRecurring(scope, actorOf(u), {
        name: s(fd, "name"),
        dayOfMonth: Number(s(fd, "day")) || 1,
        startDate: s(fd, "start"),
        adjust: s(fd, "adjust") === "ipc" ? "ipc" : "ninguno",
        template: { pointOfSale: Number(s(fd, "point_of_sale")) || 1, concept: 2, customer: { docType: Number(s(fd, "doc_type")) || 99, docNumber: s(fd, "doc_number") || "0", name: s(fd, "customer_name"), ivaCondition: s(fd, "iva_condition") || "consumidor_final", email: s(fd, "customer_email") || null }, items: docItems(fd).map((x) => ({ description: x.description, quantity: Number(x.quantity), unitPrice: Number(x.unitPrice), ivaRate: x.ivaRate ?? null })) },
      });
  } catch (e) {
    if (e instanceof DocError) back(path, { error: e.message });
    throw e;
  }
  done(scope);
  back(path, { ok: s(fd, "op") ? "Listo." : "Factura recurrente guardada: la armamos sola el día elegido." });
}
