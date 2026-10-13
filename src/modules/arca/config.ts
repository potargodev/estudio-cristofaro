// Web services oficiales de ARCA (ex AFIP) por ambiente. Las URLs se pueden
// pisar con variables de entorno para apuntar al simulador (mocks/arca):
//   ARCA_WSAA_URL, ARCA_WSFE_URL, ARCA_PADRON_URL
// Nunca scraping: solo WSAA (autenticación con certificado), WSFEv1
// (factura electrónica) y la constancia de inscripción (padrón).

export type ArcaEnv = "homologacion" | "produccion";

export const ARCA_ENVS: Record<ArcaEnv, { label: string; wsaa: string; wsfe: string; padron: string; wscdc: string }> = {
  homologacion: {
    label: "Homologación (pruebas)",
    wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
    padron: "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5",
    wscdc: "https://wswhomo.afip.gov.ar/WSCDC/service.asmx",
  },
  produccion: {
    label: "Producción",
    wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
    padron: "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5",
    wscdc: "https://servicios1.afip.gov.ar/WSCDC/service.asmx",
  },
};

/** Servicios del WSAA que usa Faro */
export const ARCA_SERVICES = { wsfe: "wsfe", padron: "ws_sr_constancia_inscripcion", wscdc: "wscdc" } as const;
export type ArcaService = (typeof ARCA_SERVICES)[keyof typeof ARCA_SERVICES];

export function arcaUrls(env: ArcaEnv) {
  const base = ARCA_ENVS[env];
  return {
    wsaa: process.env.ARCA_WSAA_URL || base.wsaa,
    wsfe: process.env.ARCA_WSFE_URL || base.wsfe,
    padron: process.env.ARCA_PADRON_URL || base.padron,
    wscdc: process.env.ARCA_WSCDC_URL || base.wscdc,
  };
}

/** ¿Apunta al simulador? (se muestra en el Faro Manager) */
export const usingMock = () => [process.env.ARCA_WSAA_URL, process.env.ARCA_WSFE_URL, process.env.ARCA_PADRON_URL, process.env.ARCA_WSCDC_URL].some((u) => !!u && /localhost|127\.0\.0\.1|mock/.test(u));

/** Tipos de comprobante (FEParamGetTiposCbte) que emite Faro */
export const CBTE_TYPES: Record<number, { label: string; short: string; letter: "A" | "B" | "C" | "E" | "M"; kind: "factura" | "nota_debito" | "nota_credito"; fce?: boolean }> = {
  1: { label: "Factura A", short: "FA", letter: "A", kind: "factura" },
  2: { label: "Nota de débito A", short: "NDA", letter: "A", kind: "nota_debito" },
  3: { label: "Nota de crédito A", short: "NCA", letter: "A", kind: "nota_credito" },
  6: { label: "Factura B", short: "FB", letter: "B", kind: "factura" },
  7: { label: "Nota de débito B", short: "NDB", letter: "B", kind: "nota_debito" },
  8: { label: "Nota de crédito B", short: "NCB", letter: "B", kind: "nota_credito" },
  11: { label: "Factura C", short: "FC", letter: "C", kind: "factura" },
  12: { label: "Nota de débito C", short: "NDC", letter: "C", kind: "nota_debito" },
  13: { label: "Nota de crédito C", short: "NCC", letter: "C", kind: "nota_credito" },
  19: { label: "Factura E", short: "FE", letter: "E", kind: "factura" },
  20: { label: "Nota de débito E", short: "NDE", letter: "E", kind: "nota_debito" },
  21: { label: "Nota de crédito E", short: "NCE", letter: "E", kind: "nota_credito" },
  // §2.p (B3): comprobantes M (responsables inscriptos con el régimen de la RG 1575) y FCE MiPyME (Ley 27.440)
  51: { label: "Factura M", short: "FM", letter: "M", kind: "factura" },
  52: { label: "Nota de débito M", short: "NDM", letter: "M", kind: "nota_debito" },
  53: { label: "Nota de crédito M", short: "NCM", letter: "M", kind: "nota_credito" },
  201: { label: "Factura de Crédito Electrónica MiPyME A", short: "FCEA", letter: "A", kind: "factura", fce: true },
  202: { label: "Nota de débito electrónica MiPyME A", short: "NDFCEA", letter: "A", kind: "nota_debito", fce: true },
  203: { label: "Nota de crédito electrónica MiPyME A", short: "NCFCEA", letter: "A", kind: "nota_credito", fce: true },
  206: { label: "Factura de Crédito Electrónica MiPyME B", short: "FCEB", letter: "B", kind: "factura", fce: true },
  207: { label: "Nota de débito electrónica MiPyME B", short: "NDFCEB", letter: "B", kind: "nota_debito", fce: true },
  208: { label: "Nota de crédito electrónica MiPyME B", short: "NCFCEB", letter: "B", kind: "nota_credito", fce: true },
  211: { label: "Factura de Crédito Electrónica MiPyME C", short: "FCEC", letter: "C", kind: "factura", fce: true },
  212: { label: "Nota de débito electrónica MiPyME C", short: "NDFCEC", letter: "C", kind: "nota_debito", fce: true },
  213: { label: "Nota de crédito electrónica MiPyME C", short: "NCFCEC", letter: "C", kind: "nota_credito", fce: true },
};

/**
 * Variantes que se pueden elegir además de las comunes: M en lugar de A (si
 * ARCA lo indicó al emisor) y FCE MiPyME en lugar de A, B o C (cuando el
 * receptor es una gran empresa y supera el monto mínimo, «a validar»).
 */
const VARIANTS: Record<number, number[]> = { 1: [51, 201], 2: [52, 202], 3: [53, 203], 6: [206], 7: [207], 8: [208], 11: [211], 12: [212], 13: [213] };
export function withVariants(types: number[]) {
  return [...types, ...types.flatMap((t) => VARIANTS[t] ?? [])];
}

/** Tipos de documento del receptor */
export const DOC_TYPES: Record<number, string> = { 80: "CUIT", 86: "CUIL", 96: "DNI", 99: "Consumidor final" };

/** Alícuotas de IVA (código de ARCA) */
export const IVA_RATES: Record<string, number> = { "0": 3, "10.5": 4, "21": 5, "27": 6, "5": 8, "2.5": 9 };

export const IVA_CONDITIONS: Record<string, string> = {
  responsable_inscripto: "IVA Responsable Inscripto",
  monotributo: "Responsable Monotributo",
  exento: "IVA Sujeto Exento",
  consumidor_final: "Consumidor Final",
  exterior: "Cliente del Exterior",
};

/** Condición frente al IVA del receptor (RG 5616): código para FECAESolicitar */
export const IVA_CONDITION_CODE: Record<string, number> = { responsable_inscripto: 1, exento: 4, consumidor_final: 5, monotributo: 6, exterior: 9 };

/** Letras que puede emitir cada condición del emisor según el receptor */
export function allowedTypes(issuer: string, receiver: string): number[] {
  if (issuer === "monotributo" || issuer === "exento") return receiver === "exterior" ? [19, 20, 21] : [11, 12, 13];
  if (receiver === "exterior") return [19, 20, 21];
  if (receiver === "responsable_inscripto" || receiver === "monotributo") return [1, 2, 3];
  return [6, 7, 8];
}

export const formatCuit = (c: string) => (/^\d{11}$/.test(c) ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);

/** Dígito verificador de CUIT/CUIL */
export function validCuit(c: string) {
  if (!/^\d{11}$/.test(c)) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = w.reduce((s, x, i) => s + x * Number(c[i]), 0);
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return dv === Number(c[10]);
}
