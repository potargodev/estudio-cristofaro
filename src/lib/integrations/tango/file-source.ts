import type { TangoBatch, TangoSource } from "./source";

/**
 * Lugar para la futura implementación "file": importar exportaciones de Tango
 * (por ejemplo el listado de clientes en Excel) cuando no se pueda instalar el
 * conector. Tiene que devolver los mismos TangoBatch que el conector; store.ts
 * y las pantallas no cambian.
 */
export const fileSource: TangoSource<{ fileName: string; data: Buffer; companyId: string; process: number }> = {
  kind: "file",
  toBatches(): TangoBatch[] {
    throw new Error("La importación de archivos de Tango todavía no está implementada.");
  },
};
