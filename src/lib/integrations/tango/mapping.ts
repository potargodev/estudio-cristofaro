// Mapeo tolerante de campos del JSON de Tango. No sabemos con certeza los
// nombres reales (dependen de la versión y de la vista), así que cada dato se
// busca en una lista de candidatos configurable desde /admin/conexiones/tango.
// El JSON crudo se guarda siempre, así un cambio de mapeo aplica a lo ya sincronizado.

export interface TangoMapping {
  id: string[];
  cuit: string[];
  name: string[];
  email: string[];
  phone: string[];
  address: string[];
}

export const DEFAULT_MAPPING: TangoMapping = {
  id: ["ID_GVA14", "IdGva14", "ID_CLIENTE", "IdCliente", "Id", "ID", "COD_GVA14", "COD_CLIENT", "CodigoCliente", "Codigo"],
  cuit: ["CUIT", "Cuit", "CUIT_CLIENTE", "NRO_DOCUMENTO", "NumeroDocumento", "NroDocumento", "N_CUIT", "IdentificacionTributaria"],
  name: ["RAZON_SOCI", "RazonSocial", "RAZON_SOCIAL", "NOMBRE", "Nombre", "DENOMINACION", "Denominacion", "NOM_COM"],
  email: ["E_MAIL", "EMAIL", "Email", "MAIL", "CorreoElectronico"],
  phone: ["TELEFONO_1", "TELEFONO", "Telefono", "TEL", "TelefonoMovil", "CELULAR"],
  address: ["DOMICILIO", "Domicilio", "DIRECCION", "Direccion", "DIR_COM"],
};

export const MAPPING_LABELS: Record<keyof TangoMapping, string> = {
  id: "ID del cliente",
  cuit: "CUIT",
  name: "Razón social",
  email: "Email",
  phone: "Teléfono",
  address: "Domicilio",
};

/** Mapeo guardado en settings.mapping, completado con los valores por defecto */
export function getMapping(settings: Record<string, unknown> | null | undefined): TangoMapping {
  const saved = (settings?.mapping ?? {}) as Partial<Record<keyof TangoMapping, unknown>>;
  const out = { ...DEFAULT_MAPPING };
  for (const key of Object.keys(DEFAULT_MAPPING) as (keyof TangoMapping)[]) {
    const v = saved[key];
    if (Array.isArray(v) && v.every((x) => typeof x === "string") && v.length) out[key] = v as string[];
  }
  return out;
}

/** Busca un campo sin distinguir mayúsculas, en el primer nivel o un nivel adentro */
export function pick(raw: unknown, candidates: string[]): string | null {
  if (!raw || typeof raw !== "object") return null;
  const levels: Record<string, unknown>[] = [raw as Record<string, unknown>];
  for (const v of Object.values(raw as Record<string, unknown>)) {
    if (v && typeof v === "object" && !Array.isArray(v)) levels.push(v as Record<string, unknown>);
  }
  for (const candidate of candidates) {
    const wanted = candidate.toLowerCase();
    for (const obj of levels) {
      for (const [k, v] of Object.entries(obj)) {
        if (k.toLowerCase() !== wanted) continue;
        if (v == null || typeof v === "object") continue;
        const s = String(v).trim();
        if (s) return s;
      }
    }
  }
  return null;
}

/** CUIT de 11 dígitos (acepta guiones y espacios); null si no hay uno válido */
export function pickCuit(raw: unknown, m: TangoMapping): string | null {
  for (const c of m.cuit) {
    const v = pick(raw, [c]);
    const digits = v?.replace(/\D/g, "") ?? "";
    if (digits.length === 11) return digits;
  }
  return null;
}

export function describeClient(raw: unknown, m: TangoMapping) {
  return {
    name: pick(raw, m.name),
    cuit: pickCuit(raw, m),
    email: pick(raw, m.email),
    phone: pick(raw, m.phone),
    address: pick(raw, m.address),
  };
}
