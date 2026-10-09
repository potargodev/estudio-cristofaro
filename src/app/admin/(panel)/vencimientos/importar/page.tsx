import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminField";
import { ObligationsImport } from "@/components/admin/ObligationsImport";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Importar vencimientos" };

export default async function ImportarVencimientosPage() {
  await requireStaff();
  return (
    <div className="max-w-5xl">
      <AdminPageHeader title="Importar vencimientos" />
      <p className="mb-6 max-w-3xl text-muted">
        Subí un CSV o un Excel (.xlsx) con las columnas <strong>CUIT, impuesto, período, vencimiento y monto</strong>. Los clientes se cruzan por CUIT.
        Vas a ver una vista previa antes de confirmar; las filas con errores no se importan.
      </p>
      <ObligationsImport />
    </div>
  );
}
