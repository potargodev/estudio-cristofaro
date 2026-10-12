// Convenios colectivos para la liquidación de sueldos (§2.q etapa 6). Acá
// vive el catálogo base: convenio, categorías, básicos, adicionales y aportes
// sindicales. El Faro Manager carga las escalas nuevas como versiones con
// vigencia (tabla cct_scales) y cada organización puede tener su escala
// propia o fuera de convenio. TODAS las escalas de este archivo son
// estimaciones de referencia «a validar»: no se pudieron cotejar con las
// actas oficiales desde el entorno de Faro, y así lo muestran las pantallas.
// Archivo sin "server-only": lo usan las pruebas y las pantallas.

export interface CctCategory {
  code: string;
  name: string;
  /** Básico mensual en pesos (o valor hora si el convenio es por hora) */
  basic: number;
}

export interface CctExtra {
  code: string;
  name: string;
  /** pct_basico: % del básico · pct_rem: % de lo remunerativo · fijo: monto por mes */
  kind: "pct_basico" | "pct_rem" | "fijo";
  value: number;
  remunerativo: boolean;
  /** Se pierde con una ausencia injustificada en el mes (presentismo) */
  lostOnAbsence?: boolean;
}

export interface Cct {
  key: string;
  number: string;
  name: string;
  union: string;
  /** Por mes o por hora (jornal) */
  unit: "mes" | "hora";
  /** Horas mensuales para el valor hora de un mensualizado */
  monthlyHours: number;
  /** Antigüedad: % del básico por año (0 si no tiene) */
  seniorityPct: number;
  extras: CctExtra[];
  /** Cuota sindical del afiliado (% de lo remunerativo) */
  unionPct: number;
  /** Aporte solidario de los no afiliados (% de lo remunerativo), si el convenio lo prevé */
  solidarityPct: number;
  /** Contribución patronal con destino sindical (% de lo remunerativo), p. ej. FAECYS */
  employerUnionPct: number;
  /** Régimen especial (UOCRA: fondo de cese en vez de indemnización) */
  ceaseFundPct?: number;
  categories: CctCategory[];
}

export interface CctScale {
  cctKey: string;
  validFrom: string;
  status: "a_validar" | "validada";
  source: string;
  categories: CctCategory[];
}

const presentismo = (pct: number): CctExtra => ({ code: "presentismo", name: "Presentismo", kind: "pct_rem", value: pct, remunerativo: true, lostOnAbsence: true });

const cat = (rows: [string, string, number][]): CctCategory[] => rows.map(([code, name, basic]) => ({ code, name, basic }));

/** 26 convenios y regímenes frecuentes en los clientes de un estudio */
export const CCTS: Cct[] = [
  {
    key: "comercio", number: "130/75", name: "Empleados de Comercio", union: "FAECYS", unit: "mes", monthlyHours: 200, seniorityPct: 1,
    extras: [presentismo(8.33)], unionPct: 2, solidarityPct: 0, employerUnionPct: 0.5,
    categories: cat([["MA", "Maestranza A", 1_100_000], ["AA", "Administrativo A", 1_110_000], ["AB", "Administrativo B", 1_115_000], ["AC", "Administrativo C", 1_120_000], ["CA", "Cajero A", 1_115_000], ["VA", "Vendedor A", 1_115_000], ["VB", "Vendedor B", 1_130_000]]),
  },
  {
    key: "uocra", number: "76/75", name: "Construcción (UOCRA)", union: "UOCRA", unit: "hora", monthlyHours: 176, seniorityPct: 0,
    extras: [{ code: "asistencia", name: "Asistencia", kind: "pct_rem", value: 20, remunerativo: true, lostOnAbsence: true }], unionPct: 2.5, solidarityPct: 0, employerUnionPct: 0, ceaseFundPct: 12,
    categories: cat([["AY", "Ayudante (hora)", 4_900], ["MC", "Medio oficial (hora)", 5_300], ["OF", "Oficial (hora)", 5_700], ["OE", "Oficial especializado (hora)", 6_600]]),
  },
  {
    key: "gastronomicos", number: "389/04", name: "Gastronómicos (UTHGRA)", union: "UTHGRA", unit: "mes", monthlyHours: 192, seniorityPct: 1,
    extras: [presentismo(10), { code: "alimentacion", name: "Alimentación", kind: "fijo", value: 40_000, remunerativo: true }], unionPct: 2, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["C1", "Categoría 1", 920_000], ["C2", "Categoría 2", 945_000], ["C3", "Categoría 3", 975_000], ["C4", "Categoría 4", 1_010_000], ["C5", "Categoría 5", 1_060_000]]),
  },
  {
    key: "hoteleros", number: "362/03", name: "Hoteleros (UTHGRA)", union: "UTHGRA", unit: "mes", monthlyHours: 192, seniorityPct: 1,
    extras: [presentismo(10)], unionPct: 2, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["C1", "Categoría 1", 930_000], ["C2", "Categoría 2", 955_000], ["C3", "Categoría 3", 985_000], ["C4", "Categoría 4", 1_020_000]]),
  },
  {
    key: "sanidad", number: "122/75", name: "Sanidad · clínicas y sanatorios (FATSA)", union: "FATSA", unit: "mes", monthlyHours: 192, seniorityPct: 2,
    extras: [presentismo(5)], unionPct: 2, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["MAE", "Maestranza", 880_000], ["ADM", "Administrativo", 920_000], ["AUX", "Auxiliar de enfermería", 960_000], ["ENF", "Enfermero profesional", 1_040_000]]),
  },
  {
    key: "sanidad_108", number: "108/75", name: "Sanidad · establecimientos geriátricos y otros (FATSA)", union: "FATSA", unit: "mes", monthlyHours: 192, seniorityPct: 2,
    extras: [presentismo(5)], unionPct: 2, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["MAE", "Maestranza", 860_000], ["MUC", "Mucama", 870_000], ["AUX", "Auxiliar", 930_000]]),
  },
  {
    key: "camioneros", number: "40/89", name: "Camioneros", union: "Camioneros", unit: "mes", monthlyHours: 200, seniorityPct: 1,
    extras: [{ code: "viatico", name: "Viático (no remunerativo)", kind: "fijo", value: 150_000, remunerativo: false }], unionPct: 3, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["1", "Chofer 1.ª categoría", 1_350_000], ["2", "Chofer 2.ª categoría", 1_300_000], ["AY", "Ayudante", 1_200_000], ["ADM", "Administrativo", 1_220_000]]),
  },
  {
    key: "seguridad", number: "507/07", name: "Seguridad privada (UPSRA)", union: "UPSRA", unit: "mes", monthlyHours: 200, seniorityPct: 1,
    extras: [presentismo(8)], unionPct: 2, solidarityPct: 1, employerUnionPct: 0,
    categories: cat([["VG", "Vigilador general", 980_000], ["VB", "Vigilador bombero", 1_010_000], ["SUP", "Supervisor", 1_090_000]]),
  },
  {
    key: "bancarios", number: "18/75", name: "Bancarios (La Bancaria)", union: "La Bancaria", unit: "mes", monthlyHours: 150, seniorityPct: 1.5,
    extras: [], unionPct: 2.5, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["INI", "Inicial", 2_200_000], ["ADM", "Administrativo", 2_350_000], ["JEF", "Jefe de sección", 2_700_000]]),
  },
  {
    key: "uom", number: "260/75", name: "Metalúrgicos (UOM)", union: "UOM", unit: "hora", monthlyHours: 200, seniorityPct: 1,
    extras: [presentismo(20)], unionPct: 2.5, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["OP", "Operario (hora)", 5_100], ["OC", "Operario calificado (hora)", 5_500], ["MOF", "Medio oficial (hora)", 5_800], ["OF", "Oficial (hora)", 6_200]]),
  },
  {
    key: "suterh", number: "589/10", name: "Encargados de edificio (SUTERH)", union: "SUTERH", unit: "mes", monthlyHours: 200, seniorityPct: 1,
    extras: [{ code: "residuos", name: "Retiro de residuos", kind: "fijo", value: 25_000, remunerativo: true }], unionPct: 2, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["1", "Encargado permanente con vivienda", 900_000], ["2", "Encargado permanente sin vivienda", 1_000_000], ["SUP", "Suplente", 950_000]]),
  },
  {
    key: "textiles", number: "500/07", name: "Textiles (AOT)", union: "AOT", unit: "hora", monthlyHours: 200, seniorityPct: 1,
    extras: [presentismo(10)], unionPct: 2.5, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["OP", "Operario (hora)", 4_700], ["OC", "Operario calificado (hora)", 5_000]]),
  },
  {
    key: "alimentacion", number: "244/94", name: "Alimentación (STIA)", union: "STIA", unit: "hora", monthlyHours: 200, seniorityPct: 1,
    extras: [presentismo(10)], unionPct: 2.5, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["OP", "Operario (hora)", 5_300], ["OC", "Operario calificado (hora)", 5_700], ["MAN", "Mantenimiento (hora)", 6_100]]),
  },
  {
    key: "plasticos", number: "419/05", name: "Plásticos (UOyEP)", union: "UOyEP", unit: "hora", monthlyHours: 200, seniorityPct: 1,
    extras: [presentismo(10)], unionPct: 2.5, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["OP", "Operario (hora)", 4_900], ["OC", "Operario calificado (hora)", 5_300]]),
  },
  {
    key: "quimicos", number: "564/09", name: "Químicos y petroquímicos (FATIQyP)", union: "FATIQyP", unit: "hora", monthlyHours: 200, seniorityPct: 1,
    extras: [presentismo(10)], unionPct: 2.5, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["OP", "Operario (hora)", 5_400], ["OC", "Operario calificado (hora)", 5_900]]),
  },
  {
    key: "graficos", number: "409/05", name: "Gráficos (FATIDA)", union: "FATIDA", unit: "mes", monthlyHours: 200, seniorityPct: 1,
    extras: [presentismo(8)], unionPct: 2, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["OP", "Operario", 1_020_000], ["OF", "Oficial", 1_120_000]]),
  },
  {
    key: "uta", number: "460/73", name: "Transporte de pasajeros (UTA)", union: "UTA", unit: "mes", monthlyHours: 200, seniorityPct: 1,
    extras: [{ code: "viatico", name: "Viático (no remunerativo)", kind: "fijo", value: 120_000, remunerativo: false }], unionPct: 2.5, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["CH", "Conductor", 1_450_000], ["ADM", "Administrativo", 1_250_000]]),
  },
  {
    key: "madereros", number: "335/75", name: "Madereros (USIMRA)", union: "USIMRA", unit: "hora", monthlyHours: 200, seniorityPct: 1,
    extras: [presentismo(10)], unionPct: 2.5, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["PE", "Peón (hora)", 4_600], ["OF", "Oficial (hora)", 5_200]]),
  },
  {
    key: "seguros", number: "264/95", name: "Empleados de seguros", union: "SSSRA", unit: "mes", monthlyHours: 180, seniorityPct: 1.5,
    extras: [], unionPct: 2, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["ADM", "Administrativo", 1_500_000], ["JEF", "Jefe", 1_800_000]]),
  },
  {
    key: "viajantes", number: "308/75", name: "Viajantes de comercio", union: "FUVA", unit: "mes", monthlyHours: 200, seniorityPct: 1,
    extras: [{ code: "comision", name: "Comisiones (se cargan como novedad)", kind: "fijo", value: 0, remunerativo: true }], unionPct: 2, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["VJ", "Viajante", 1_150_000]]),
  },
  {
    key: "estaciones", number: "488/07", name: "Estaciones de servicio, garajes y playas (SOESGyPE)", union: "SOESGyPE", unit: "mes", monthlyHours: 200, seniorityPct: 1,
    extras: [presentismo(8)], unionPct: 2, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["PL", "Playero", 1_000_000], ["CAJ", "Cajero", 1_040_000], ["ENC", "Encargado de turno", 1_120_000]]),
  },
  {
    key: "panaderos", number: "231/94", name: "Panaderos", union: "FAUPPA", unit: "mes", monthlyHours: 200, seniorityPct: 1,
    extras: [presentismo(10)], unionPct: 2, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["MAE", "Maestro", 1_050_000], ["OF", "Oficial", 980_000], ["AY", "Ayudante", 900_000]]),
  },
  {
    key: "vitivinicolas", number: "154/91", name: "Vitivinícolas", union: "FOEVA", unit: "hora", monthlyHours: 200, seniorityPct: 1,
    extras: [presentismo(10)], unionPct: 2, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["PE", "Peón (hora)", 4_300], ["OC", "Operario calificado (hora)", 4_800]]),
  },
  {
    key: "molineros", number: "66/89", name: "Molineros", union: "UOM Molineros", unit: "hora", monthlyHours: 200, seniorityPct: 1,
    extras: [presentismo(10)], unionPct: 2, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["OP", "Operario (hora)", 5_000]]),
  },
  {
    key: "rurales", number: "Ley 26.727", name: "Trabajo agrario (UATRE)", union: "UATRE", unit: "mes", monthlyHours: 200, seniorityPct: 1,
    extras: [], unionPct: 2, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["PG", "Peón general", 850_000], ["TC", "Tractorista", 920_000], ["CAP", "Capataz", 1_000_000]]),
  },
  {
    key: "casas_particulares", number: "Ley 26.844", name: "Casas particulares", union: "—", unit: "mes", monthlyHours: 192, seniorityPct: 1,
    extras: [], unionPct: 0, solidarityPct: 0, employerUnionPct: 0,
    categories: cat([["5", "Personal para tareas generales (con retiro)", 450_000], ["4", "Cuidado de personas (con retiro)", 500_000], ["3", "Caseros", 500_000]]),
  },
];

/** Fuera de convenio: la escala la carga cada organización */
export const OWN_CCT: Cct = { key: "fuera_convenio", number: "—", name: "Fuera de convenio", union: "—", unit: "mes", monthlyHours: 200, seniorityPct: 0, extras: [], unionPct: 0, solidarityPct: 0, employerUnionPct: 0, categories: [] };

export const cctOf = (key: string | null | undefined) => (key === OWN_CCT.key ? OWN_CCT : CCTS.find((c) => c.key === key) ?? null);

/** Escala vigente a una fecha: la última versión con vigencia anterior o igual (las del Faro Manager pisan la base) */
export function scaleAt(cct: Cct, date: string, versions: CctScale[]): { categories: CctCategory[]; status: "a_validar" | "validada"; validFrom: string; source: string } {
  const v = versions
    .filter((x) => x.cctKey === cct.key && x.validFrom <= date)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
  if (v) return { categories: v.categories, status: v.status, validFrom: v.validFrom, source: v.source };
  return { categories: cct.categories, status: "a_validar", validFrom: "2026-10-01", source: "Escala de referencia de Faro (estimada): cargá la oficial en el Faro Manager." };
}
