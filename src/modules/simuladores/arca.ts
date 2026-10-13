import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, max } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { simGet, simLog, simSet } from "./server";

// Parte C · Simulador de ARCA dentro de Faro: WSAA, WSFEv1, padrón y WSCDC
// con las mismas formas SOAP que los oficiales (lo atiende soapCall cuando la
// URL es sim://arca/…). Valida como ARCA: numeración correlativa, totales,
// C sin IVA, A y M con CUIT, notas con comprobante asociado y FCE. El estado
// (último número, comprobantes, caída) queda en la base: sobrevive reinicios.

const esc = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const env = (body: string) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`;
const fault = (code: string, msg: string) => env(`<soap:Fault><faultcode>${code}</faultcode><faultstring>${esc(msg)}</faultstring></soap:Fault>`);
const tag = (xml: string, name: string) => xml.match(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`))?.[1];
const tags = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "g"))].map((m) => m[1]);
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
type Obj = Record<string, unknown>;
const xml = (o: Obj): string =>
  Object.entries(o)
    .map(([k, v]) => (v == null ? "" : Array.isArray(v) ? v.map((x) => `<${k}>${typeof x === "object" ? xml(x as Obj) : esc(x)}</${k}>`).join("") : typeof v === "object" ? `<${k}>${xml(v as Obj)}</${k}>` : `<${k}>${esc(v)}</${k}>`))
    .join("");
const wrap = (op: string, inner: Obj) => env(`<${op}Response xmlns="http://ar.gov.afip.dif.FEV1/"><${op}Result>${xml(inner)}</${op}Result></${op}Response>`);

const cuitList = (c: string[]) => (c.length > 3 ? `${c.slice(0, 3).join(", ")} y ${c.length - 3} CUIT más` : c.join(", "));

/** Controles del panel, por CUIT (un espacio no le «tira» ARCA a otro): ARCA caído y el próximo pedido «se corta» */
export const arcaSim = {
  outage: async (cuit: string) => !!cuit && ((await simGet<boolean>("arca", `outage:${cuit}`)) ?? false),
  setOutage: async (cuits: string[], on: boolean, studioId: string) => {
    for (const c of cuits) await simSet("arca", `outage:${c}`, on, studioId);
    await simLog("arca", on ? "caida" : "vuelta", on ? `ARCA «caído» para ${cuitList(cuits)}` : `ARCA volvió para ${cuitList(cuits)}`, { cuits }, studioId);
  },
  dropNext: async (cuits: string[], studioId: string) => {
    for (const c of cuits) await simSet("arca", `drop:${c}`, true, studioId);
    await simLog("arca", "corte", `El próximo pedido de ${cuitList(cuits)} se corta después de autorizar`, { cuits }, studioId);
  },
};
const cuitOf = (envelope: string) => (tag(envelope, "Cuit") ?? tag(envelope, "cuitRepresentada") ?? tag(envelope, "CuitEmisor") ?? "").replace(/\D/g, "");

function loginCms() {
  const token = `SIM-${randomBytes(18).toString("base64url")}`;
  const sign = randomBytes(16).toString("base64");
  const exp = new Date(Date.now() + 12 * 3600_000);
  const ta = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><loginTicketResponse version="1.0"><header><source>CN=faro-simulador</source><destination>SERIALNUMBER=CUIT</destination><uniqueId>${Date.now()}</uniqueId><generationTime>${new Date().toISOString()}</generationTime><expirationTime>${exp.toISOString()}</expirationTime></header><credentials><token>${token}</token><sign>${sign}</sign></credentials></loginTicketResponse>`;
  return env(`<loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${esc(ta)}</loginCmsReturn></loginCmsResponse>`);
}

const tokenOk = (body: string) => /^SIM-/.test(tag(body, "Token") ?? tag(body, "token") ?? "");
const C_TYPES = [11, 12, 13, 211, 212, 213];
const NOTES = [2, 3, 7, 8, 12, 13, 20, 21, 52, 53, 202, 203, 207, 208, 212, 213];

/**
 * Último número autorizado: el del simulador o el mayor que ya tiene Faro
 * emitido en el simulador (la demo trae comprobantes cargados), así nunca
 * repite un número que existe.
 */
async function lastOf(cuit: string, pto: number, tipo: number) {
  const sim = (await simGet<number>("arca", `last:${cuit}|${pto}|${tipo}`)) ?? 0;
  const [r] = await getDb()
    .select({ n: max(invoices.number) })
    .from(invoices)
    .where(and(eq(invoices.cuit, cuit), eq(invoices.environment, "simulador"), eq(invoices.status, "autorizada"), eq(invoices.point_of_sale, pto), eq(invoices.cbte_type, tipo)));
  return Math.max(sim, r?.n ?? 0);
}

async function wsfe(op: string, body: string) {
  const outage = await arcaSim.outage(cuitOf(body));
  if (op === "FEDummy") return wrap(op, outage ? { AppServer: "ERROR", DbServer: "OK", AuthServer: "OK" } : { AppServer: "OK", DbServer: "OK", AuthServer: "OK" });
  if (outage) return null;
  if (!tokenOk(body)) return wrap(op, { Errors: { Err: { Code: 600, Msg: "ValidacionDeToken: No validaron las credenciales (token vencido o inválido)" } } });
  const cuit = tag(body, "Cuit") ?? "";
  if (op === "FEParamGetPtosVenta") return wrap(op, { ResultGet: { PtoVenta: [1, 2, 3, 4, 5].map((n) => ({ Nro: n, EmisionTipo: "CAE - Web Services", Bloqueado: "N", FchBaja: "NULL" })) } });
  if (op === "FECompUltimoAutorizado") {
    const pto = Number(tag(body, "PtoVta"));
    const tipo = Number(tag(body, "CbteTipo"));
    return wrap(op, { PtoVta: pto, CbteTipo: tipo, CbteNro: await lastOf(cuit, pto, tipo) });
  }
  if (op === "FECompConsultar") {
    const c = await simGet<Obj>("arca", `comp:${cuit}|${Number(tag(body, "PtoVta"))}|${Number(tag(body, "CbteTipo"))}|${Number(tag(body, "CbteNro"))}`);
    return c ? wrap(op, { ResultGet: c }) : wrap(op, { Errors: { Err: { Code: 602, Msg: "Sin Resultados" } } });
  }
  if (op === "FECAESolicitar") {
    const pto = Number(tag(body, "PtoVta"));
    const tipo = Number(tag(body, "CbteTipo"));
    const det = tag(body, "FECAEDetRequest") ?? "";
    const num = (n: string) => Number(tag(det, n) ?? 0);
    const nro = num("CbteDesde");
    const key = `${cuit}|${pto}|${tipo}`;
    const expected = (await lastOf(cuit, pto, tipo)) + 1;
    const obs: { Code: number; Msg: string }[] = [];
    if (!(pto >= 1 && pto <= 5)) obs.push({ Code: 10015, Msg: `El punto de venta ${pto} no está habilitado para web services` });
    if (nro !== expected) obs.push({ Code: 10016, Msg: `El número de comprobante tiene que ser el próximo a autorizar: ${expected}` });
    const total = num("ImpTotal");
    if (Math.abs(total - (num("ImpTotConc") + num("ImpNeto") + num("ImpOpEx") + num("ImpTrib") + num("ImpIVA"))) > 0.01) obs.push({ Code: 10048, Msg: "ImpTotal no es la suma de ImpTotConc, ImpNeto, ImpOpEx, ImpTrib e ImpIVA" });
    const ivas = tags(det, "AlicIva");
    if (C_TYPES.includes(tipo) && (ivas.length || num("ImpIVA") > 0)) obs.push({ Code: 10071, Msg: "Los comprobantes C no llevan IVA discriminado" });
    if (!C_TYPES.includes(tipo) && ![19, 20, 21].includes(tipo) && num("ImpNeto") > 0 && !ivas.length) obs.push({ Code: 10070, Msg: "Falta el detalle de IVA" });
    if (Math.abs(ivas.reduce((t, x) => t + Number(tag(x, "Importe") ?? 0), 0) - num("ImpIVA")) > 0.01) obs.push({ Code: 10051, Msg: "La suma de alícuotas no coincide con ImpIVA" });
    if ([1, 2, 3, 51, 52, 53, 201, 202, 203].includes(tipo) && Number(tag(det, "DocTipo")) !== 80) obs.push({ Code: 10013, Msg: "Para comprobantes A y M el receptor tiene que identificarse con CUIT" });
    if (NOTES.includes(tipo) && !tag(det, "CbteAsoc")) obs.push({ Code: 10197, Msg: "Las notas de crédito y débito tienen que informar el comprobante asociado" });
    const opc = tags(det, "Opcional").map((o) => ({ id: tag(o, "Id"), valor: tag(o, "Valor") }));
    if ([201, 206, 211].includes(tipo)) {
      if (!opc.some((o) => o.id === "2101" && /^\d{22}$/.test(o.valor ?? ""))) obs.push({ Code: 10168, Msg: "Para la Factura de Crédito Electrónica MiPyME informá el CBU del emisor (opcional 2101)" });
      if (!tag(det, "FchVtoPago")) obs.push({ Code: 10169, Msg: "La Factura de Crédito Electrónica MiPyME lleva la fecha de vencimiento del pago" });
    }
    if (!tag(det, "CondicionIVAReceptorId")) obs.push({ Code: 10242, Msg: "Falta la condición frente al IVA del receptor" });
    if (obs.length) {
      await simLog("arca", "rechazo", `Rechazado ${tipo} ${pto}-${nro} de ${cuit}: ${obs[0].Msg}`, { cuit, pto, tipo, nro, obs });
      return wrap(op, { FeCabResp: { Cuit: cuit, PtoVta: pto, CbteTipo: tipo, Resultado: "R" }, FeDetResp: { FECAEDetResponse: { CbteDesde: nro, CbteHasta: nro, Resultado: "R", Observaciones: { Obs: obs }, CAE: "", CAEFchVto: "" } } });
    }
    const cae = String(70000000000000 + Math.floor(Math.random() * 9999999999999)).slice(0, 14);
    const vto = ymd(new Date(Date.now() + 10 * 86400000));
    await simSet("arca", `last:${key}`, nro);
    await simSet("arca", `comp:${key}|${nro}`, { CbteDesde: nro, CbteHasta: nro, CbteFch: tag(det, "CbteFch"), ImpTotal: total, DocNro: tag(det, "DocNro"), CodAutorizacion: cae, FchVto: vto, Resultado: "A" });
    await simLog("arca", "cae", `CAE ${cae} · tipo ${tipo} ${String(pto).padStart(5, "0")}-${String(nro).padStart(8, "0")} de ${cuit} por $ ${total}`, { cuit, pto, tipo, nro, total, cae });
    if (await simGet<boolean>("arca", `drop:${cuit}`)) {
      // Autoriza pero «se corta»: Faro lo recupera con FECompConsultar
      await simSet("arca", `drop:${cuit}`, false);
      return null;
    }
    return wrap(op, { FeCabResp: { Cuit: cuit, PtoVta: pto, CbteTipo: tipo, FchProceso: ymd(new Date()), CantReg: 1, Resultado: "A" }, FeDetResp: { FECAEDetResponse: { Concepto: tag(det, "Concepto"), DocTipo: tag(det, "DocTipo"), DocNro: tag(det, "DocNro"), CbteDesde: nro, CbteHasta: nro, CbteFch: tag(det, "CbteFch"), Resultado: "A", CAE: cae, CAEFchVto: vto } } });
  }
  if (op.startsWith("FEParamGet")) return wrap(op, { ResultGet: {} });
  return fault("soap:Client", `Operación desconocida: ${op}`);
}

/** Padrón: cualquier CUIT válida existe; persona humana (20, 23, 24, 27) monotributista, jurídica responsable inscripta */
function padron(body: string) {
  if (!tokenOk(body)) return fault("soap:Server", "No autorizado: token vencido o inválido");
  const id = tag(body, "idPersona") ?? "";
  if (!/^\d{11}$/.test(id)) return env(`<ns2:getPersona_v2Response xmlns:ns2="http://a5.soap.ws.server.puc.sr/"><personaReturn>${xml({ errorConstancia: { error: "No existe persona con ese Id", idPersona: id } })}</personaReturn></ns2:getPersona_v2Response>`);
  const human = /^(20|23|24|27)/.test(id);
  const persona = human
    ? { datosGenerales: { apellido: "CONTRIBUYENTE", nombre: `DE PRUEBA ${id.slice(-4)}`, tipoPersona: "FISICA", estadoClave: "ACTIVO", domicilioFiscal: { direccion: "CALLE FALSA 123", localidad: "CABA", descripcionProvincia: "CIUDAD AUTONOMA BUENOS AIRES" } }, datosMonotributo: { categoriaMonotributo: { idCategoria: 4, descripcionCategoria: "D LOCACIONES DE SERVICIO", periodo: "202601" }, impuesto: [{ idImpuesto: "20", descripcionImpuesto: "MONOTRIBUTO", periodo: "202001" }] } }
    : { datosGenerales: { razonSocial: `EMPRESA DE PRUEBA ${id.slice(-4)} SA`, tipoPersona: "JURIDICA", estadoClave: "ACTIVO", domicilioFiscal: { direccion: "AV CORRIENTES 1000", localidad: "CABA", descripcionProvincia: "CIUDAD AUTONOMA BUENOS AIRES" } }, datosRegimenGeneral: { actividad: [{ idActividad: "620100", descripcionActividad: "SERVICIOS DE CONSULTORES EN INFORMATICA", orden: "1" }], impuesto: [{ idImpuesto: "30", descripcionImpuesto: "IVA", periodo: "201801" }] } };
  return env(`<ns2:getPersona_v2Response xmlns:ns2="http://a5.soap.ws.server.puc.sr/"><personaReturn>${xml({ persona, metadata: { fechaHora: new Date().toISOString(), servidor: "faro-simulador" } })}</personaReturn></ns2:getPersona_v2Response>`);
}

/** WSCDC: aprueba los CAE de 14 números que empiezan con 7 (los del simulador y los de las lecturas de prueba) */
function wscdc(body: string) {
  if (!tokenOk(body)) return fault("soap:Server", "No autorizado: token vencido o inválido");
  const cae = tag(body, "CodAutorizacion") ?? "";
  const ok = /^7\d{13}$/.test(cae);
  const obs = ok ? "" : `<Observaciones><Obs><Code>21</Code><Msg>No existe un comprobante con esos datos</Msg></Obs></Observaciones>`;
  return env(`<ComprobanteConstatarResponse xmlns="http://servicios1.afip.gob.ar/wscdc/"><ComprobanteConstatarResult><CmpResp><CbteModo>CAE</CbteModo><CodAutorizacion>${esc(cae)}</CodAutorizacion></CmpResp><Resultado>${ok ? "A" : "R"}</Resultado>${obs}<FchProceso>${ymd(new Date())}</FchProceso></ComprobanteConstatarResult></ComprobanteConstatarResponse>`);
}

/** Atiende un pedido SOAP a sim://arca/…; null = sin respuesta (ARCA caído o corte) */
export async function simSoap(url: string, action: string, envelope: string): Promise<string | null> {
  const service = url.replace("sim://arca/", "");
  if (service === "wsaa") return loginCms();
  if (service === "wsfe") return wsfe(action.replace(/"/g, "").split("/").pop() ?? "", envelope);
  if ((await arcaSim.outage(cuitOf(envelope))) && service !== "padron") return null;
  if (service === "padron") return padron(envelope);
  if (service === "wscdc") return wscdc(envelope);
  return fault("soap:Client", `Servicio desconocido: ${service}`);
}
