import "server-only";
import { arcaUrls, ARCA_SERVICES } from "./config";
import { arr, ArcaError, soapCall, toXml } from "./soap";
import { getTicket, type ArcaCredential } from "./wsaa";

// WSFEv1 (factura electrónica): la CUIT operadora (Faro) actúa en nombre del
// emisor, que le delegó el servicio en el Administrador de Relaciones.

const NS = "http://ar.gov.afip.dif.FEV1/";

async function call(cred: ArcaCredential, represented: string, op: string, inner = "", withAuth = true) {
  const auth = withAuth ? await getTicket(cred, ARCA_SERVICES.wsfe) : null;
  const authXml = auth ? `<ar:Auth><ar:Token>${auth.token}</ar:Token><ar:Sign>${auth.sign}</ar:Sign><ar:Cuit>${represented}</ar:Cuit></ar:Auth>` : "";
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}"><soapenv:Header/><soapenv:Body><ar:${op}>${authXml}${inner}</ar:${op}></soapenv:Body></soapenv:Envelope>`;
  const { body, raw } = await soapCall(arcaUrls(cred.env).wsfe, `${NS}${op}`, envelope);
  const result = ((body[`${op}Response`] as Record<string, unknown>)?.[`${op}Result`] ?? {}) as Record<string, unknown>;
  const errs = arr<{ Code: string; Msg: string }>((result.Errors as { Err?: unknown } | undefined)?.Err as never);
  return { result, raw, envelope, errors: errs.map((e) => ({ code: Number(e.Code), msg: String(e.Msg) })) };
}

const failIf = (errors: { code: number; msg: string }[], raw: string) => {
  if (errors.length) throw new ArcaError(errors.map((e) => `${e.code}: ${e.msg}`).join(" · "), String(errors[0].code), raw);
};

/** Estado de los servidores de ARCA (no necesita ticket) */
export async function feDummy(cred: ArcaCredential) {
  const { result } = await call(cred, cred.cuit, "FEDummy", "", false);
  return { app: String(result.AppServer ?? ""), db: String(result.DbServer ?? ""), auth: String(result.AuthServer ?? "") };
}

export async function lastAuthorized(cred: ArcaCredential, cuit: string, ptoVta: number, cbteTipo: number) {
  const { result, errors, raw } = await call(cred, cuit, "FECompUltimoAutorizado", `<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>`);
  failIf(errors, raw);
  return Number(result.CbteNro ?? 0);
}

export async function salesPoints(cred: ArcaCredential, cuit: string) {
  const { result, errors, raw } = await call(cred, cuit, "FEParamGetPtosVenta");
  // 602 = sin resultados (no hay puntos de venta para web services)
  if (errors.length && errors[0].code !== 602) failIf(errors, raw);
  return arr<Record<string, string>>((result.ResultGet as { PtoVenta?: unknown } | undefined)?.PtoVenta as never).map((p) => ({ number: Number(p.Nro), kind: String(p.EmisionTipo ?? ""), blocked: p.Bloqueado === "S" || !!(p.FchBaja && p.FchBaja !== "NULL") }));
}

export async function paramList(cred: ArcaCredential, cuit: string, op: "FEParamGetTiposCbte" | "FEParamGetTiposIva" | "FEParamGetTiposDoc" | "FEParamGetTiposMonedas", item: string) {
  const { result, errors, raw } = await call(cred, cuit, op);
  failIf(errors, raw);
  return arr<Record<string, string>>((result.ResultGet as Record<string, unknown> | undefined)?.[item] as never).map((x) => ({ id: String(x.Id), desc: String(x.Desc) }));
}

export interface CaeRequest {
  ptoVta: number;
  cbteTipo: number;
  concepto: number;
  docTipo: number;
  docNro: string;
  cbteNro: number;
  cbteFch: string; // AAAAMMDD
  impTotal: number;
  impTotConc: number;
  impNeto: number;
  impOpEx: number;
  impIva: number;
  impTrib: number;
  fchServDesde?: string;
  fchServHasta?: string;
  fchVtoPago?: string;
  monId: string;
  monCotiz: number;
  condicionIvaReceptorId: number;
  iva: { id: number; baseImp: number; importe: number }[];
  asociados?: { tipo: number; ptoVta: number; nro: number; cuit: string; cbteFch: string }[];
}

const n2 = (v: number) => v.toFixed(2);

/** Pide el CAE de un comprobante */
export async function solicitarCae(cred: ArcaCredential, cuit: string, r: CaeRequest) {
  const det: Record<string, unknown> = {
    Concepto: r.concepto,
    DocTipo: r.docTipo,
    DocNro: r.docNro,
    CbteDesde: r.cbteNro,
    CbteHasta: r.cbteNro,
    CbteFch: r.cbteFch,
    ImpTotal: n2(r.impTotal),
    ImpTotConc: n2(r.impTotConc),
    ImpNeto: n2(r.impNeto),
    ImpOpEx: n2(r.impOpEx),
    ImpTrib: n2(r.impTrib),
    ImpIVA: n2(r.impIva),
    FchServDesde: r.concepto === 1 ? undefined : r.fchServDesde,
    FchServHasta: r.concepto === 1 ? undefined : r.fchServHasta,
    FchVtoPago: r.concepto === 1 ? undefined : r.fchVtoPago,
    MonId: r.monId,
    MonCotiz: r.monCotiz,
    CondicionIVAReceptorId: r.condicionIvaReceptorId,
    CbtesAsoc: r.asociados?.length ? { CbteAsoc: r.asociados.map((a) => ({ Tipo: a.tipo, PtoVta: a.ptoVta, Nro: a.nro, Cuit: a.cuit, CbteFch: a.cbteFch })) } : undefined,
    Iva: r.iva.length ? { AlicIva: r.iva.map((i) => ({ Id: i.id, BaseImp: n2(i.baseImp), Importe: n2(i.importe) })) } : undefined,
  };
  const inner = `<ar:FeCAEReq>${toXml({ FeCabReq: { CantReg: 1, PtoVta: r.ptoVta, CbteTipo: r.cbteTipo }, FeDetReq: { FECAEDetRequest: det } })}</ar:FeCAEReq>`;
  const { result, errors, raw, envelope } = await call(cred, cuit, "FECAESolicitar", inner);
  const detResp: Record<string, unknown> = arr<Record<string, unknown>>((result.FeDetResp as { FECAEDetResponse?: unknown } | undefined)?.FECAEDetResponse as never)[0] ?? {};
  const obs = arr<{ Code: string; Msg: string }>((detResp.Observaciones as { Obs?: unknown } | undefined)?.Obs as never).map((o) => ({ code: Number(o.Code), msg: String(o.Msg) }));
  const approved = (result.FeCabResp as { Resultado?: string } | undefined)?.Resultado === "A" && detResp.Resultado === "A";
  return {
    approved,
    cae: approved ? String(detResp.CAE) : null,
    caeDue: approved ? String(detResp.CAEFchVto) : null,
    observations: obs,
    errors,
    request: envelope.replace(/<ar:Token>[^<]*<\/ar:Token><ar:Sign>[^<]*<\/ar:Sign>/, "<ar:Token>…</ar:Token><ar:Sign>…</ar:Sign>"),
    raw,
  };
}

/** Consulta un comprobante ya emitido (para recuperar un CAE si se cortó la conexión) */
export async function consultarComprobante(cred: ArcaCredential, cuit: string, ptoVta: number, cbteTipo: number, nro: number) {
  const { result, errors, raw } = await call(cred, cuit, "FECompConsultar", `<ar:FeCompConsReq><ar:CbteTipo>${cbteTipo}</ar:CbteTipo><ar:CbteNro>${nro}</ar:CbteNro><ar:PtoVta>${ptoVta}</ar:PtoVta></ar:FeCompConsReq>`);
  if (errors.length) return null;
  const g = (result.ResultGet ?? {}) as Record<string, string>;
  return { cae: String(g.CodAutorizacion ?? ""), caeDue: String(g.FchVto ?? ""), total: Number(g.ImpTotal ?? 0), docNro: String(g.DocNro ?? ""), cbteFch: String(g.CbteFch ?? ""), raw };
}
