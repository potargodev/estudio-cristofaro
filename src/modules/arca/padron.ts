import "server-only";
import { arcaUrls, ARCA_SERVICES } from "./config";
import { arr, ArcaError, soapCall } from "./soap";
import { getTicket, type ArcaCredential } from "./wsaa";

// Constancia de inscripción (ws_sr_constancia_inscripcion · getPersona_v2):
// datos del padrón de una CUIT. La CUIT operadora es la representada en el
// pedido; la consultada va en idPersona.

export interface TaxpayerData {
  cuit: string;
  name: string;
  personType: string;
  status: string;
  address: string | null;
  regime: "monotributo" | "responsable_inscripto" | "exento" | "otro";
  category: string | null;
  categoryDetail: string | null;
  activities: { id: string; description: string; main: boolean }[];
  taxes: { id: string; description: string; since: string | null }[];
}

type Raw = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

export function normalizePersona(cuit: string, persona: Raw): TaxpayerData {
  const general = (persona.datosGenerales ?? {}) as Raw;
  const mono = persona.datosMonotributo as Raw | undefined;
  const rg = persona.datosRegimenGeneral as Raw | undefined;
  const dom = general.domicilioFiscal as Raw | undefined;
  const name = s(general.razonSocial) || [s(general.apellido), s(general.nombre)].filter(Boolean).join(", ");
  const monoCat = mono ? (mono.categoriaMonotributo as Raw | undefined) : undefined;
  const activities = [
    ...arr((mono?.actividadMonotributista ?? mono?.actividad) as Raw | Raw[]),
    ...arr(rg?.actividad as Raw | Raw[]),
  ].map((a) => ({ id: s(a.idActividad), description: s(a.descripcionActividad), main: false }));
  const taxes = [...arr(mono?.impuesto as Raw | Raw[]), ...arr(rg?.impuesto as Raw | Raw[])].map((i) => ({ id: s(i.idImpuesto), description: s(i.descripcionImpuesto), since: s(i.periodo) || null }));
  const regime: TaxpayerData["regime"] = mono ? "monotributo" : taxes.some((t) => t.id === "30") ? "responsable_inscripto" : taxes.some((t) => t.id === "32") ? "exento" : "otro";
  return {
    cuit,
    name,
    personType: s(general.tipoPersona),
    status: s(general.estadoClave),
    address: dom ? [s(dom.direccion), s(dom.localidad), s(dom.descripcionProvincia)].filter(Boolean).join(", ") : null,
    regime,
    category: monoCat ? s(monoCat.descripcionCategoria).replace(/^.*?([A-K])\b.*$/, "$1") || null : null,
    categoryDetail: monoCat ? s(monoCat.descripcionCategoria) : null,
    activities: activities.map((a, i) => ({ ...a, main: i === 0 })),
    taxes,
  };
}

export async function getPersona(cred: ArcaCredential, cuit: string) {
  const { token, sign } = await getTicket(cred, ARCA_SERVICES.padron);
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/"><soapenv:Header/><soapenv:Body><a5:getPersona_v2><token>${token}</token><sign>${sign}</sign><cuitRepresentada>${cred.cuit}</cuitRepresentada><idPersona>${cuit}</idPersona></a5:getPersona_v2></soapenv:Body></soapenv:Envelope>`;
  const { body, raw } = await soapCall(arcaUrls(cred.env).padron, "", envelope);
  const ret = ((body.getPersona_v2Response as Raw | undefined)?.personaReturn ?? {}) as Raw;
  const persona = ret.persona as Raw | undefined;
  const errorConstancia = ret.errorConstancia as Raw | undefined;
  if (!persona) throw new ArcaError(s((errorConstancia?.error as unknown) ?? "ARCA no tiene datos de esa CUIT."), "padron", raw);
  return { data: normalizePersona(cuit, persona), raw: ret, errors: errorConstancia ? arr(errorConstancia.error as string | string[]).map(String) : [] };
}
