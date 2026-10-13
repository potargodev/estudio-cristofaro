import "server-only";
import { simGet, simLog, simSet } from "./server";

// Parte C · Simuladores de Xubio, Contabilium y Tango dentro de Faro. Atienden
// las mismas rutas que las APIs (y que mocks/xubio, mocks/contabilium y
// mocks/tango) con datos guardados en la base, por cuenta: una cuenta de
// Xubio o Contabilium cuyo Client ID empieza con «simulador» y un enlace de
// Tango con la URL sim://tango no salen a internet. El panel del simulador
// carga ventas, compras y clientes «del otro lado» para probar la
// sincronización, los conflictos y la migración con totales.

const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
type Row = Record<string, unknown>;

export const isSimClient = (clientId: string) => clientId.startsWith("simulador");
/** La cuenta simulada de Xubio o Contabilium de un espacio */
export const simClientId = (studioId: string) => `simulador-${studioId}`;
export const isSimTango = (url: string) => url.startsWith("sim://tango");

// ───────────── Xubio ─────────────

interface XubioData {
  empresa: Row;
  clientes: Row[];
  proveedores: Row[];
  ventas: Row[];
  compras: Row[];
  asientos: Row[];
  seq: number;
}

const xubioSeed = (): XubioData => ({
  empresa: { nombreEmpresa: "Empresa simulada (Xubio)", cuit: "30-70000000-7", categoriaFiscal: 1 },
  clientes: [
    { cliente_id: 101, nombre: "Agencia Norte", razonSocial: "Agencia Norte SRL", cuit: "30-71111111-9", email: "admin@agencia.com.ar" },
    { cliente_id: 102, nombre: "Consultora Sur", razonSocial: "Consultora Sur SAS", CUIT: "30722222229" },
  ],
  proveedores: [{ proveedorid: 501, nombre: "Hosting SA", razonSocial: "Hosting SA", cuit: "30-75555555-5" }],
  ventas: [
    { transaccionid: 9001, tipo: 1, fecha: day(10), numeroDocumento: "A-00002-00000123", importetotal: 544500, importeGravado: 450000, importeImpuestos: 94500, CAE: "75123456789012", cliente: { ID: 101, nombre: "Agencia Norte" } },
    { transaccionid: 9003, tipo: 1, fecha: day(12), numeroDocumento: "A-00002-00000124", importetotal: 363000, cliente: { ID: 102, nombre: "Consultora Sur" } },
  ],
  compras: [{ transaccionid: 7001, tipo: 1, fecha: day(5), numeroDocumento: "B-00001-00004567", importetotal: 48400, proveedor: { ID: 501, nombre: "Hosting SA" } }],
  asientos: [],
  seq: 10000,
});

async function xubioState(account: string) {
  return (await simGet<XubioData>("xubio", account)) ?? xubioSeed();
}

const inRange = (rows: Row[], field: string, desde?: string, hasta?: string) => rows.filter((r) => (!desde || String(r[field]) >= desde) && (!hasta || String(r[field]) <= hasta));

/** GET de la API de Xubio contra el simulador */
export async function simXubio(account: string, path: string, params: Record<string, string | undefined>): Promise<unknown> {
  const s = await xubioState(account);
  switch (path) {
    case "/miempresa":
      return s.empresa;
    case "/clienteBean":
      return s.clientes;
    case "/ProveedorBean":
      return s.proveedores;
    case "/comprobanteVentaBean":
      return inRange(s.ventas, "fecha", params.fechaDesde, params.fechaHasta);
    case "/comprobanteCompraBean":
      return inRange(s.compras, "fecha", params.fechaDesde, params.fechaHasta);
    case "/asientoContableManualBean":
      return s.asientos;
    default:
      throw new Error(`Simulador de Xubio: ruta desconocida (${path})`);
  }
}

// ───────────── Contabilium ─────────────

interface CbData {
  clientes: Row[];
  ventas: Row[];
  compras: Row[];
  seq: number;
}

const cbSeed = (): CbData => ({
  seq: 1000,
  clientes: [
    { Id: 11, RazonSocial: "Distribuidora del Plata SA", NroDoc: "30711222339", CondicionIva: "RI", Email: "compras@delplata.com.ar", Modificado: day(30) },
    { Id: 12, RazonSocial: "Martina Gómez", NroDoc: "27301234568", CondicionIva: "CF", Email: null, Modificado: day(20) },
  ],
  ventas: [
    { Id: 501, Tipo: "FA", PuntoVenta: 3, Numero: 101, FechaEmision: day(15), RazonSocial: "Distribuidora del Plata SA", NroDoc: "30711222339", ImporteNeto: 100000, Iva: 21000, ImporteTotal: 121000, Cae: "75111111111111" },
    { Id: 502, Tipo: "FB", PuntoVenta: 3, Numero: 55, FechaEmision: day(8), RazonSocial: "Martina Gómez", NroDoc: "27301234568", ImporteNeto: 20000, Iva: 4200, ImporteTotal: 24200, Cae: "75111111111112" },
  ],
  compras: [{ Id: 801, Tipo: "FA", PuntoVenta: 1, Numero: 3001, FechaEmision: day(6), RazonSocial: "Papelera Sur SRL", NroDoc: "30709998887", ImporteNeto: 50000, Iva: 10500, Percepciones: 1500, ImporteTotal: 62000 }],
});

async function contabiliumState(account: string) {
  return (await simGet<CbData>("contabilium", account)) ?? cbSeed();
}

/** La API de Contabilium contra el simulador (búsquedas paginadas, alta y modificación) */
export async function simContabilium(account: string, path: string, init: { method?: string; body?: unknown; params?: Record<string, string> }): Promise<unknown> {
  const s = await contabiliumState(account);
  const p = init.params ?? {};
  const page = (rows: Row[]) => {
    const n = Math.max(1, Number(p.page ?? 1));
    return { Items: rows.slice((n - 1) * 50, n * 50), TotalItems: rows.length, TotalPage: Math.max(1, Math.ceil(rows.length / 50)) };
  };
  if (path === "/api/clientes/search") return page(s.clientes);
  if (path === "/api/comprobantes/search") return page(inRange(s.ventas, "FechaEmision", p.fechaDesde, p.fechaHasta));
  if (path === "/api/compras/search") return page(inRange(s.compras, "FechaEmision", p.fechaDesde, p.fechaHasta));
  const b = (init.body ?? {}) as Row;
  const cliente = /^\/api\/clientes\/(\d+)$/.exec(path);
  if (cliente && init.method === "PUT") {
    const c = s.clientes.find((x) => x.Id === Number(cliente[1]));
    if (!c) throw new Error("Simulador de Contabilium: cliente inexistente");
    Object.assign(c, b, { Modificado: day(0) });
    await simSet("contabilium", account, s);
    await simLog("contabilium", "faro_escribio", `Faro modificó el cliente ${c.RazonSocial}`, b);
    return c;
  }
  if (path === "/api/comprobantes" && init.method === "POST") {
    const same = s.ventas.find((v) => v.Tipo === b.Tipo && v.PuntoVenta === b.PuntoVenta && v.Numero === b.Numero);
    if (same) return same;
    const v = { Id: ++s.seq, ...b };
    s.ventas.push(v);
    await simSet("contabilium", account, s);
    await simLog("contabilium", "faro_escribio", `Faro cargó el comprobante ${b.Tipo} ${b.PuntoVenta}-${b.Numero}`, b);
    return v;
  }
  throw new Error(`Simulador de Contabilium: ruta desconocida (${path})`);
}

// ───────────── Tango ─────────────

interface TangoData {
  docs: Row[];
  seq: number;
  failNext: number;
}

async function tangoState(studioId: string) {
  return (await simGet<TangoData>("tango", studioId)) ?? { docs: [], seq: 1000, failNext: 0 };
}

/** La API de Tango (proceso 20412) contra el simulador. Sin webhooks: queda la sincronización periódica */
export async function simTango(studioId: string, method: string, path: string, body?: unknown): Promise<Row> {
  const s = await tangoState(studioId);
  const url = new URL(path, "sim://tango");
  const save = () => simSet("tango", studioId, s, studioId);
  if (url.pathname === "/Api/Webhooks") throw Object.assign(new Error("El simulador de Tango no ofrece webhooks: Faro sincroniza cada tanto."), { status: 501 });
  if (url.searchParams.get("process") !== "20412") throw Object.assign(new Error("Proceso no simulado"), { status: 400 });
  if (url.pathname === "/Api/Get") {
    const desde = url.searchParams.get("desde");
    const list = s.docs.filter((d) => !desde || String(d.FECHA_MODIF) > desde);
    return { list, total: list.length };
  }
  const b = (body ?? {}) as Row;
  if (url.pathname === "/Api/Create" && method === "POST") {
    if (s.failNext > 0) {
      s.failNext--;
      await save();
      throw Object.assign(new Error("Tango no responde"), { status: 503 });
    }
    if (!b.N_COMP || !b.RAZON_SOCI) throw Object.assign(new Error("Faltan campos obligatorios (N_COMP, RAZON_SOCI)"), { status: 400 });
    const dup = s.docs.find((d) => d.N_COMP === b.N_COMP && d.TIPO_COMP === b.TIPO_COMP);
    if (dup) throw Object.assign(new Error(`Ya existe el comprobante ${b.N_COMP} (ID ${dup.ID_GVA12})`), { status: 409 });
    const doc = { ...b, ID_GVA12: String(++s.seq), FECHA_MODIF: new Date().toISOString() };
    s.docs.push(doc);
    await save();
    await simLog("tango", "faro_escribio", `Faro cargó ${b.TIPO_COMP ?? "el comprobante"} ${b.N_COMP} en Tango`, doc, studioId);
    return doc;
  }
  if (url.pathname === "/Api/Update" && method === "PUT") {
    const doc = s.docs.find((d) => d.ID_GVA12 === url.searchParams.get("id"));
    if (!doc) throw Object.assign(new Error("No existe"), { status: 404 });
    Object.assign(doc, b, { ID_GVA12: doc.ID_GVA12, FECHA_MODIF: new Date().toISOString() });
    await save();
    return doc;
  }
  throw Object.assign(new Error("No encontrado"), { status: 404 });
}

// ───────────── Panel: «el otro lado» ─────────────

export type OtherSideAction =
  | { service: "xubio"; account: string; kind: "venta" | "compra" | "cliente"; name: string; cuit: string; amount: number }
  | { service: "contabilium"; account: string; kind: "venta" | "compra" | "cliente" | "modificar_cliente"; name: string; cuit: string; amount: number; id?: number }
  | { service: "tango"; account: string; kind: "venta" | "modificar" | "fallar"; name: string; cuit: string; amount: number; id?: string };

/** Alguien carga o modifica algo directo en el sistema: aparece en Faro en la próxima sincronización */
export async function otherSide(a: OtherSideAction, studioId: string) {
  const net = Math.round(a.amount * 100) / 100;
  if (a.service === "xubio") {
    const s = await xubioState(a.account);
    const id = ++s.seq;
    if (a.kind === "cliente") s.clientes.push({ cliente_id: id, nombre: a.name, razonSocial: a.name, cuit: a.cuit });
    else {
      const row = { transaccionid: id, tipo: 1, fecha: day(0), numeroDocumento: `${a.kind === "venta" ? "A-00002" : "B-00001"}-${String(id).padStart(8, "0")}`, importetotal: net, [a.kind === "venta" ? "cliente" : "proveedor"]: { ID: id, nombre: a.name } };
      (a.kind === "venta" ? s.ventas : s.compras).push(row);
    }
    await simSet("xubio", a.account, s, studioId);
  } else if (a.service === "contabilium") {
    const s = await contabiliumState(a.account);
    if (a.kind === "modificar_cliente") {
      const c = s.clientes.find((x) => x.Id === a.id) ?? s.clientes[0];
      if (c) Object.assign(c, { RazonSocial: a.name || c.RazonSocial, Modificado: day(0) });
    } else if (a.kind === "cliente") s.clientes.push({ Id: ++s.seq, RazonSocial: a.name, NroDoc: a.cuit, CondicionIva: "CF", Email: null, Modificado: day(0) });
    else {
      const neto = Math.round((net / 1.21) * 100) / 100;
      (a.kind === "venta" ? s.ventas : s.compras).push({ Id: ++s.seq, Tipo: "FB", PuntoVenta: 3, Numero: s.seq, FechaEmision: day(0), RazonSocial: a.name, NroDoc: a.cuit, ImporteNeto: neto, Iva: Math.round((net - neto) * 100) / 100, ImporteTotal: net });
    }
    await simSet("contabilium", a.account, s, studioId);
  } else {
    const s = await tangoState(studioId);
    if (a.kind === "fallar") s.failNext = 2;
    else if (a.kind === "modificar") {
      const d = s.docs.find((x) => x.ID_GVA12 === a.id) ?? s.docs.at(-1);
      if (d) Object.assign(d, { RAZON_SOCI: a.name || d.RAZON_SOCI, FECHA_MODIF: new Date().toISOString() });
    } else s.docs.push({ ID_GVA12: String(++s.seq), FECHA_MODIF: new Date().toISOString(), TIPO_COMP: "FAC", N_COMP: `B0000300${s.seq}`, RAZON_SOCI: a.name, CUIT: a.cuit, IMPORTE_TOTAL: net, MONEDA: "ARS", FECHA_EMIS: day(0) });
    await simSet("tango", studioId, s, studioId);
  }
  await simLog(a.service, "otro_lado", `${a.kind} en ${a.service}: ${a.name || ("id" in a ? a.id : "") || ""}${a.amount ? ` por ${a.amount}` : ""}`, a, studioId);
}
