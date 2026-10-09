"use client";

import { useActionState } from "react";
import { confirmObligationsImport, previewObligationsImport, type ImportState } from "@/app/admin/portal-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initial: ImportState = { ok: false };

const dateLabel = (d: string) => (d ? d.split("-").reverse().join("/") : "—");
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

export function ObligationsImport() {
  const [preview, previewAction, previewing] = useActionState(previewObligationsImport, initial);
  const [result, confirmAction, confirming] = useActionState(confirmObligationsImport, initial);
  const rows = preview.rows ?? [];
  const valid = rows.filter((r) => r.errors.length === 0);

  return (
    <div className="space-y-6">
      <form action={previewAction} className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface p-5">
        <div>
          <Label htmlFor="import-file" className="mb-1 text-sm">
            Archivo
          </Label>
          <Input id="import-file" name="file" type="file" accept=".csv,.xlsx" required className="h-auto w-80 max-w-full py-1.5" />
        </div>
        <Button type="submit" variant="outline" disabled={previewing} className="h-9">
          {previewing ? "Leyendo…" : "Ver vista previa"}
        </Button>
        {preview.message && !preview.ok && (
          <p role="alert" className="w-full text-sm text-danger">
            {preview.message}
          </p>
        )}
      </form>

      {result.message && (
        <p role="status" className={cn("rounded-md px-4 py-3", result.ok ? "bg-navy-soft text-navy-deep" : "bg-danger/10 text-danger")}>
          {result.message}
        </p>
      )}

      {preview.ok && rows.length > 0 && !result.ok && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              <strong>{preview.fileName}</strong>: {valid.length} filas listas para importar
              {rows.length - valid.length > 0 && <span className="text-danger"> · {rows.length - valid.length} con errores (no se importan)</span>}
            </p>
            <form action={confirmAction}>
              <input type="hidden" name="rows" value={JSON.stringify(valid)} />
              <Button type="submit" disabled={confirming || valid.length === 0} className="h-9">
                {confirming ? "Importando…" : `Confirmar e importar ${valid.length}`}
              </Button>
            </form>
          </div>
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line bg-paper text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Fila</th>
                  <th className="px-3 py-2 font-medium">CUIT</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Impuesto</th>
                  <th className="px-3 py-2 font-medium">Período</th>
                  <th className="px-3 py-2 font-medium">Vencimiento</th>
                  <th className="px-3 py-2 text-right font-medium">Monto</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.line} className={r.errors.length ? "bg-danger/5" : ""}>
                    <td className="px-3 py-2 text-muted">{r.line}</td>
                    <td className="px-3 py-2 tabular-nums">{r.cuit || "—"}</td>
                    <td className="px-3 py-2">{r.clientName ?? "—"}</td>
                    <td className="px-3 py-2">{r.tax || "—"}</td>
                    <td className="px-3 py-2">{r.period || "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{dateLabel(r.due_date)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.amount ? money.format(Number(r.amount)) : "—"}</td>
                    <td className="px-3 py-2">{r.errors.length ? <span className="text-danger">{r.errors.join(" · ")}</span> : "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
