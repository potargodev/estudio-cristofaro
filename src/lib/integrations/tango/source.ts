// Diseño enchufable: cualquier origen de datos de Tango se convierte en lotes
// normalizados (TangoBatch) y el resto de la plataforma (store.ts, pantallas)
// no sabe de dónde vinieron.
//
// - "connector": el conector local (/connector) que lee la API Delta en la red
//   de la contadora y manda los datos firmados a /api/integrations/tango/ingest.
// - "file": (futuro) importar exportaciones de Tango (Excel/CSV) subidas a mano.

export type TangoSourceKind = "connector" | "file";

export interface TangoBatch {
  companyId: string;
  companyName?: string | null;
  process: number;
  records: Record<string, unknown>[];
}

export interface TangoSource<Input> {
  readonly kind: TangoSourceKind;
  /** Convierte la entrada de este origen en lotes listos para guardar */
  toBatches(input: Input): TangoBatch[] | Promise<TangoBatch[]>;
}
