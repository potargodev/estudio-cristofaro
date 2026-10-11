import "server-only";
import { arcaUrls, ARCA_SERVICES } from "./config";
import { arr, soapCall } from "./soap";
import { getTicket, type ArcaCredential } from "./wsaa";

// Constatación de comprobantes (WSCDC · ComprobanteConstatar): confirma con
// ARCA que un CAE corresponde al comprobante leído (emisor, tipo, punto de
// venta, número, fecha y total). Lo usa la Lectura inteligente.

const NS = "http://servicios1.afip.gob.ar/wscdc/";

export interface Constatacion {
  cuitEmisor: string;
  cbteTipo: number;
  ptoVta: number;
  nro: number;
  fecha: string; // AAAA-MM-DD
  total: number; // pesos
  cae: string;
  docTipoReceptor?: number;
  docNroReceptor?: string;
}

export async function constatar(cred: ArcaCredential, c: Constatacion) {
  const { token, sign } = await getTicket(cred, ARCA_SERVICES.wscdc);
  const receptor = c.docNroReceptor ? `<DocTipoReceptor>${c.docTipoReceptor ?? 80}</DocTipoReceptor><DocNroReceptor>${c.docNroReceptor}</DocNroReceptor>` : "";
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wscdc="${NS}"><soapenv:Header/><soapenv:Body><wscdc:ComprobanteConstatar><wscdc:Auth><wscdc:Token>${token}</wscdc:Token><wscdc:Sign>${sign}</wscdc:Sign><wscdc:Cuit>${cred.cuit}</wscdc:Cuit></wscdc:Auth><wscdc:CmpReq><CbteModo>CAE</CbteModo><CuitEmisor>${c.cuitEmisor}</CuitEmisor><PtoVta>${c.ptoVta}</PtoVta><CbteTipo>${c.cbteTipo}</CbteTipo><CbteNro>${c.nro}</CbteNro><CbteFch>${c.fecha.replace(/-/g, "")}</CbteFch><ImpTotal>${c.total.toFixed(2)}</ImpTotal><CodAutorizacion>${c.cae}</CodAutorizacion>${receptor}</wscdc:CmpReq></wscdc:ComprobanteConstatar></soapenv:Body></soapenv:Envelope>`;
  const { body, raw } = await soapCall(arcaUrls(cred.env).wscdc, `${NS}ComprobanteConstatar`, envelope);
  const result = ((body.ComprobanteConstatarResponse as Record<string, unknown>)?.ComprobanteConstatarResult ?? {}) as Record<string, unknown>;
  const obs = arr<{ Code: string; Msg: string }>((result.Observaciones as { Obs?: unknown } | undefined)?.Obs as never).map((o) => `${o.Code}: ${o.Msg}`);
  return { approved: String(result.Resultado) === "A", observations: obs, raw };
}
