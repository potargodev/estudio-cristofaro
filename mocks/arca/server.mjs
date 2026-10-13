// Simulador de los web services de ARCA para pruebas (nunca en producción):
// WSAA (LoginCms con CMS firmado), WSFEv1 (FEDummy, FECompUltimoAutorizado,
// FECAESolicitar, FECompConsultar, FEParamGet*) y la constancia de
// inscripción (getPersona_v2), con las mismas formas SOAP que los oficiales.
//
//   node mocks/arca/server.mjs            → http://localhost:4060
//
// En Faro:
//   ARCA_WSAA_URL=http://localhost:4060/ws/services/LoginCms
//   ARCA_WSFE_URL=http://localhost:4060/wsfev1/service.asmx
//   ARCA_PADRON_URL=http://localhost:4060/sr-padron/webservices/personaServiceA5
//
// Reglas que valida (como ARCA): ticket vigente, CUIT representada con
// delegación (DELEGADAS; vacío = todas), numeración correlativa, totales que
// cierran, comprobantes C sin IVA y A/B con IVA, punto de venta habilitado.
// GET /__stats · POST /__reset · POST /__delegar?cuit=… · POST /__caida (simula un corte en el próximo FECAESolicitar)
// POST /__fuera?on=1|0 (ARCA fuera de servicio: FEDummy con AppServer ERROR y el resto sin respuesta)

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import forge from "node-forge";

const PORT = Number(process.env.PORT ?? 4060);
const tickets = new Map(); // token -> { service, exp }
const last = new Map(); // cuit|pto|tipo -> nro
const comps = new Map(); // cuit|pto|tipo|nro -> comprobante
const delegated = new Set((process.env.ARCA_MOCK_DELEGADAS ?? "").split(",").filter(Boolean));
let dropNext = false;
/** ARCA «fuera de servicio» (B5): FEDummy informa la caída y el resto corta la conexión */
let outage = false;
const stats = { tickets: 0, caes: 0, rechazos: 0, padron: 0 };

const PUNTOS = [
  { Nro: 1, EmisionTipo: "CAE - Web Services", Bloqueado: "N", FchBaja: "NULL" },
  { Nro: 2, EmisionTipo: "CAE - Web Services", Bloqueado: "N", FchBaja: "NULL" },
];

const PERSONAS = {
  "20304050607": {
    datosGenerales: { apellido: "PERSONAL", nombre: "PABLO", tipoPersona: "FISICA", estadoClave: "ACTIVO", domicilioFiscal: { direccion: "AV SIEMPRE VIVA 742", localidad: "ROSARIO", descripcionProvincia: "SANTA FE" } },
    datosMonotributo: {
      categoriaMonotributo: { idCategoria: 4, descripcionCategoria: "D LOCACIONES DE SERVICIO", periodo: "202602" },
      actividadMonotributista: { idActividad: "620100", descripcionActividad: "SERVICIOS DE CONSULTORES EN INFORMÁTICA", orden: "1", periodo: "202001" },
      impuesto: [{ idImpuesto: "20", descripcionImpuesto: "MONOTRIBUTO", periodo: "202001" }],
    },
  },
  "30711111119": {
    datosGenerales: { razonSocial: "AGENCIA NORTE SRL", tipoPersona: "JURIDICA", estadoClave: "ACTIVO", domicilioFiscal: { direccion: "CORRIENTES 1234", localidad: "CIUDAD AUTONOMA BUENOS AIRES", descripcionProvincia: "CIUDAD AUTONOMA BUENOS AIRES" } },
    datosRegimenGeneral: {
      actividad: [{ idActividad: "731001", descripcionActividad: "SERVICIOS DE PUBLICIDAD", orden: "1" }],
      impuesto: [
        { idImpuesto: "30", descripcionImpuesto: "IVA", periodo: "201801" },
        { idImpuesto: "10", descripcionImpuesto: "GANANCIAS SOCIEDADES", periodo: "201801" },
      ],
    },
  },
  "30711111111": {
    datosGenerales: { razonSocial: "EDENOR S.A.", tipoPersona: "JURIDICA", estadoClave: "ACTIVO", domicilioFiscal: { direccion: "AV DEL LIBERTADOR 6363", localidad: "CABA", descripcionProvincia: "CIUDAD AUTONOMA BUENOS AIRES" } },
    datosRegimenGeneral: { actividad: { idActividad: "351320", descripcionActividad: "DISTRIBUCION DE ENERGIA ELECTRICA", orden: "1" }, impuesto: { idImpuesto: "30", descripcionImpuesto: "IVA", periodo: "199201" } },
  },
  "30722222229": {
    datosGenerales: { razonSocial: "CONSULTORA SUR SAS", tipoPersona: "JURIDICA", estadoClave: "ACTIVO" },
    datosRegimenGeneral: { actividad: { idActividad: "702092", descripcionActividad: "SERVICIOS DE ASESORAMIENTO EMPRESARIAL", orden: "1" }, impuesto: { idImpuesto: "30", descripcionImpuesto: "IVA", periodo: "202001" } },
  },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const env = (body) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`;
const fault = (code, msg) => env(`<soap:Fault><faultcode>${code}</faultcode><faultstring>${esc(msg)}</faultstring></soap:Fault>`);
const tag = (xml, name) => xml.match(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`))?.[1];
const tags = (xml, name) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "g"))].map((m) => m[1]);
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const xml = (o) => Object.entries(o).map(([k, v]) => (v == null ? "" : Array.isArray(v) ? v.map((x) => `<${k}>${xml(x)}</${k}>`).join("") : typeof v === "object" ? `<${k}>${xml(v)}</${k}>` : `<${k}>${esc(v)}</${k}>`)).join("");

function loginCms(body) {
  const b64 = tag(body, "in0");
  if (!b64) return fault("ns1:cms.bad", "Falta el CMS");
  let tra;
  try {
    const msg = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(b64.trim())));
    tra = msg.rawCapture?.content?.value?.[0]?.value ?? "";
    if (typeof tra !== "string") tra = forge.util.decodeUtf8(String(tra));
    if (!msg.certificates?.length) return fault("ns1:cms.cert.notFound", "El CMS no trae el certificado");
  } catch (e) {
    return fault("ns1:cms.bad", `CMS inválido: ${e.message}`);
  }
  const service = tag(tra, "service");
  if (!["wsfe", "ws_sr_constancia_inscripcion", "wscdc"].includes(service)) return fault("ns1:coe.notAuthorized", `Servicio no autorizado: ${service}`);
  const token = randomBytes(24).toString("base64");
  const sign = randomBytes(16).toString("base64");
  const exp = new Date(Date.now() + 12 * 3600_000);
  tickets.set(token, { service, exp });
  stats.tickets++;
  const ta = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><loginTicketResponse version="1.0"><header><source>CN=wsaahomo</source><destination>SERIALNUMBER=CUIT</destination><uniqueId>${Date.now()}</uniqueId><generationTime>${new Date().toISOString()}</generationTime><expirationTime>${exp.toISOString()}</expirationTime></header><credentials><token>${token}</token><sign>${sign}</sign></credentials></loginTicketResponse>`;
  return env(`<loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${esc(ta)}</loginCmsReturn></loginCmsResponse>`);
}

function authErr(body, service) {
  const token = tag(body, "Token") ?? tag(body, "token");
  const t = tickets.get(token);
  if (!t || t.exp < new Date() || t.service !== service) return { Err: { Code: 600, Msg: "ValidacionDeToken: No validaron las credenciales (token vencido o inválido)" } };
  const cuit = tag(body, "Cuit");
  if (service === "wsfe" && delegated.size && !delegated.has(cuit)) return { Err: { Code: 501, Msg: `La CUIT ${cuit} no delegó el servicio de factura electrónica a la CUIT representante` } };
  return null;
}

const wrap = (op, inner) => env(`<${op}Response xmlns="http://ar.gov.afip.dif.FEV1/"><${op}Result>${xml(inner)}</${op}Result></${op}Response>`);

function wsfe(op, body) {
  if (op === "FEDummy") return wrap(op, outage ? { AppServer: "ERROR", DbServer: "OK", AuthServer: "OK" } : { AppServer: "OK", DbServer: "OK", AuthServer: "OK" });
  if (outage) return null;
  const err = authErr(body, "wsfe");
  if (err) return wrap(op, { Errors: err });
  const cuit = tag(body, "Cuit");
  if (op === "FEParamGetPtosVenta") return wrap(op, { ResultGet: { PtoVenta: PUNTOS } });
  if (op === "FEParamGetTiposCbte") return wrap(op, { ResultGet: { CbteTipo: [1, 2, 3, 6, 7, 8, 11, 12, 13, 19, 20, 21, 51, 52, 53, 201, 202, 203, 206, 207, 208, 211, 212, 213].map((i) => ({ Id: i, Desc: `Tipo ${i}`, FchDesde: "20100917", FchHasta: "NULL" })) } });
  if (op === "FEParamGetTiposIva") return wrap(op, { ResultGet: { IvaTipo: [[3, "0%"], [4, "10.5%"], [5, "21%"], [6, "27%"], [8, "5%"], [9, "2.5%"]].map(([Id, Desc]) => ({ Id, Desc })) } });
  if (op === "FEParamGetTiposDoc") return wrap(op, { ResultGet: { DocTipo: [[80, "CUIT"], [86, "CUIL"], [96, "DNI"], [99, "Doc. (Otro)"]].map(([Id, Desc]) => ({ Id, Desc })) } });
  if (op === "FECompUltimoAutorizado") {
    const pto = Number(tag(body, "PtoVta"));
    const tipo = Number(tag(body, "CbteTipo"));
    return wrap(op, { PtoVta: pto, CbteTipo: tipo, CbteNro: last.get(`${cuit}|${pto}|${tipo}`) ?? 0 });
  }
  if (op === "FECompConsultar") {
    const k = `${cuit}|${Number(tag(body, "PtoVta"))}|${Number(tag(body, "CbteTipo"))}|${Number(tag(body, "CbteNro"))}`;
    const c = comps.get(k);
    if (!c) return wrap(op, { Errors: { Err: { Code: 602, Msg: "Sin Resultados" } } });
    return wrap(op, { ResultGet: c });
  }
  if (op === "FECAESolicitar") {
    const pto = Number(tag(body, "PtoVta"));
    const tipo = Number(tag(body, "CbteTipo"));
    const det = tag(body, "FECAEDetRequest") ?? "";
    const num = (n) => Number(tag(det, n) ?? 0);
    const nro = num("CbteDesde");
    const obs = [];
    const key = `${cuit}|${pto}|${tipo}`;
    const expected = (last.get(key) ?? 0) + 1;
    if (!PUNTOS.some((p) => p.Nro === pto)) obs.push({ Code: 10015, Msg: `El punto de venta ${pto} no está habilitado para web services` });
    if (nro !== expected) obs.push({ Code: 10016, Msg: `El número de comprobante tiene que ser el próximo a autorizar: ${expected}` });
    const total = num("ImpTotal");
    const sum = num("ImpTotConc") + num("ImpNeto") + num("ImpOpEx") + num("ImpTrib") + num("ImpIVA");
    if (Math.abs(total - sum) > 0.01) obs.push({ Code: 10048, Msg: "ImpTotal no es la suma de ImpTotConc, ImpNeto, ImpOpEx, ImpTrib e ImpIVA" });
    const ivas = tags(det, "AlicIva");
    const isC = [11, 12, 13, 211, 212, 213].includes(tipo);
    if (isC && (ivas.length || num("ImpIVA") > 0)) obs.push({ Code: 10071, Msg: "Los comprobantes C no llevan IVA discriminado" });
    if (!isC && ![19, 20, 21].includes(tipo) && num("ImpNeto") > 0 && !ivas.length) obs.push({ Code: 10070, Msg: "Falta el detalle de IVA" });
    const ivaSum = ivas.reduce((s, x) => s + Number(tag(x, "Importe") ?? 0), 0);
    if (Math.abs(ivaSum - num("ImpIVA")) > 0.01) obs.push({ Code: 10051, Msg: "La suma de alícuotas no coincide con ImpIVA" });
    if ([1, 2, 3, 51, 52, 53, 201, 202, 203].includes(tipo) && Number(tag(det, "DocTipo")) !== 80) obs.push({ Code: 10013, Msg: "Para comprobantes A y M el receptor tiene que identificarse con CUIT" });
    if ([2, 3, 7, 8, 12, 13, 20, 21, 52, 53, 202, 203, 207, 208, 212, 213].includes(tipo) && !tag(det, "CbteAsoc")) obs.push({ Code: 10197, Msg: "Las notas de crédito y débito tienen que informar el comprobante asociado" });
    // FCE MiPyME (B3): la factura lleva CBU (opcional 2101) y vencimiento del pago; las notas, la marca de anulación (22)
    const opc = tags(det, "Opcional").map((o) => ({ id: tag(o, "Id"), valor: tag(o, "Valor") }));
    if ([201, 206, 211].includes(tipo)) {
      if (!opc.some((o) => o.id === "2101" && /^\d{22}$/.test(o.valor ?? ""))) obs.push({ Code: 10168, Msg: "Para la Factura de Crédito Electrónica MiPyME informá el CBU del emisor (opcional 2101)" });
      if (!tag(det, "FchVtoPago")) obs.push({ Code: 10169, Msg: "La Factura de Crédito Electrónica MiPyME lleva la fecha de vencimiento del pago" });
    }
    if ([202, 203, 207, 208, 212, 213].includes(tipo) && !opc.some((o) => o.id === "22")) obs.push({ Code: 10173, Msg: "Las notas de la FCE MiPyME informan si anulan (opcional 22)" });
    if (!tag(det, "CondicionIVAReceptorId")) obs.push({ Code: 10242, Msg: "Falta la condición frente al IVA del receptor" });
    if (dropNext) {
      dropNext = false;
      // Autoriza pero "se corta": el cliente tiene que recuperarlo con FECompConsultar
      const cae = String(70000000000000 + Math.floor(Math.random() * 9999999999999)).slice(0, 14);
      last.set(key, nro);
      comps.set(`${key}|${nro}`, { CbteDesde: nro, CbteHasta: nro, CbteFch: tag(det, "CbteFch"), ImpTotal: total, DocNro: tag(det, "DocNro"), CodAutorizacion: cae, FchVto: ymd(new Date(Date.now() + 10 * 86400000)), Resultado: "A" });
      stats.caes++;
      return null; // sin respuesta
    }
    if (obs.length) {
      stats.rechazos++;
      return wrap(op, { FeCabResp: { Cuit: cuit, PtoVta: pto, CbteTipo: tipo, Resultado: "R" }, FeDetResp: { FECAEDetResponse: { CbteDesde: nro, CbteHasta: nro, Resultado: "R", Observaciones: { Obs: obs }, CAE: "", CAEFchVto: "" } } });
    }
    const cae = String(70000000000000 + Math.floor(Math.random() * 9999999999999)).slice(0, 14);
    const vto = ymd(new Date(Date.now() + 10 * 86400000));
    last.set(key, nro);
    comps.set(`${key}|${nro}`, { CbteDesde: nro, CbteHasta: nro, CbteFch: tag(det, "CbteFch"), ImpTotal: total, DocNro: tag(det, "DocNro"), CodAutorizacion: cae, FchVto: vto, Resultado: "A" });
    stats.caes++;
    return wrap(op, { FeCabResp: { Cuit: cuit, PtoVta: pto, CbteTipo: tipo, FchProceso: ymd(new Date()), CantReg: 1, Resultado: "A" }, FeDetResp: { FECAEDetResponse: { Concepto: tag(det, "Concepto"), DocTipo: tag(det, "DocTipo"), DocNro: tag(det, "DocNro"), CbteDesde: nro, CbteHasta: nro, CbteFch: tag(det, "CbteFch"), Resultado: "A", CAE: cae, CAEFchVto: vto } } });
  }
  return fault("soap:Client", `Operación desconocida: ${op}`);
}

// WSCDC · ComprobanteConstatar: aprueba los CAE emitidos por este simulador
// y los que empiezan con 75 (los de las lecturas de prueba); rechaza el resto.
function wscdc(body) {
  const token = tag(body, "Token");
  const t = tickets.get(token);
  if (!t || t.exp < new Date() || t.service !== "wscdc") return fault("soap:Server", "No autorizado: token vencido o inválido");
  stats.wscdc = (stats.wscdc ?? 0) + 1;
  const cae = tag(body, "CodAutorizacion") ?? "";
  const known = [...comps.values()].some((c) => String(c.CodAutorizacion ?? "") === cae);
  const ok = /^\d{14}$/.test(cae) && (known || cae.startsWith("75"));
  const obs = ok ? "" : `<Observaciones><Obs><Code>21</Code><Msg>No existe un comprobante con esos datos</Msg></Obs></Observaciones>`;
  return env(`<ComprobanteConstatarResponse xmlns="http://servicios1.afip.gob.ar/wscdc/"><ComprobanteConstatarResult><CmpResp><CbteModo>CAE</CbteModo><CodAutorizacion>${esc(cae)}</CodAutorizacion></CmpResp><Resultado>${ok ? "A" : "R"}</Resultado>${obs}<FchProceso>${new Date().toISOString().slice(0, 10).replace(/-/g, "")}</FchProceso></ComprobanteConstatarResult></ComprobanteConstatarResponse>`);
}

function padron(body) {
  const token = tag(body, "token");
  const t = tickets.get(token);
  if (!t || t.exp < new Date() || t.service !== "ws_sr_constancia_inscripcion") return fault("soap:Server", "No autorizado: token vencido o inválido");
  const id = tag(body, "idPersona");
  stats.padron++;
  const p = PERSONAS[id];
  const ret = p ? { persona: p, metadata: { fechaHora: new Date().toISOString(), servidor: "mock" } } : { errorConstancia: { error: "No existe persona con ese Id", idPersona: id }, metadata: { fechaHora: new Date().toISOString() } };
  return env(`<ns2:getPersona_v2Response xmlns:ns2="http://a5.soap.ws.server.puc.sr/"><personaReturn>${xml(ret)}</personaReturn></ns2:getPersona_v2Response>`);
}

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString("utf8");
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (status, text, type = "text/xml; charset=utf-8") => {
    res.writeHead(status, { "Content-Type": type });
    res.end(text);
  };
  if (url.pathname === "/__stats") return send(200, JSON.stringify({ ...stats, delegadas: [...delegated], ultimos: Object.fromEntries(last) }), "application/json");
  // Pruebas: alinear el último número con lo que ya tiene la base (?cuit=&pto=&tipo=&nro=)
  if (url.pathname === "/__ultimo") {
    const q = url.searchParams;
    last.set(`${q.get("cuit")}|${Number(q.get("pto"))}|${Number(q.get("tipo"))}`, Number(q.get("nro")) || 0);
    return send(200, "{}", "application/json");
  }
  if (url.pathname === "/__reset") {
    tickets.clear();
    last.clear();
    comps.clear();
    return send(200, "{}", "application/json");
  }
  if (url.pathname === "/__delegar") {
    delegated.add(url.searchParams.get("cuit"));
    return send(200, "{}", "application/json");
  }
  if (url.pathname === "/__fuera") {
    outage = url.searchParams.get("on") !== "0";
    return send(200, JSON.stringify({ outage }), "application/json");
  }
  if (url.pathname === "/__caida") {
    dropNext = true;
    return send(200, "{}", "application/json");
  }
  if (url.pathname.endsWith("/LoginCms")) return send(200, loginCms(body));
  if (url.pathname.endsWith("/wsfev1/service.asmx")) {
    const op = (req.headers.soapaction ?? "").replace(/"/g, "").split("/").pop();
    const out = wsfe(op, body);
    if (out === null) {
      req.socket.destroy();
      return;
    }
    return send(200, out);
  }
  if (url.pathname.includes("personaServiceA5")) return send(200, padron(body));
  if (url.pathname.toLowerCase().includes("wscdc")) return send(200, wscdc(body));
  send(404, "no encontrado", "text/plain");
}).listen(PORT, () => console.log(`Simulador de ARCA en http://localhost:${PORT}`));
