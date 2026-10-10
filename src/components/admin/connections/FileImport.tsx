"use client";

import { useRef, useState, useTransition } from "react";
import { importExportFile, type ImportState } from "@/app/admin/connection-actions";
import { AdminField } from "@/components/admin/AdminField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FIELD_LABEL, RESOURCE_LABEL, TEMPLATES, type MappingField } from "@/modules/connectors/archivos/templates";

/** Importar una exportación con plantilla: primero vista previa, después importar (sin perder el archivo elegido) */
export function FileImport({ orgs }: { orgs: { id: string; name: string }[] }) {
  const form = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<ImportState | null>(null);
  const [pending, start] = useTransition();
  const [tpl, setTpl] = useState(TEMPLATES[0].key);
  const template = TEMPLATES.find((t) => t.key === tpl)!;

  function run(mode: "preview" | "importar") {
    if (!form.current) return;
    const fd = new FormData(form.current);
    fd.set("mode", mode);
    start(async () => setState(await importExportFile({ ok: false }, fd)));
  }

  return (
    <form ref={form} onSubmit={(e) => (e.preventDefault(), run("preview"))} className="grid gap-4 [&>*]:min-w-0">
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Plantilla" htmlFor="tpl">
          <select id="tpl" name="template" value={tpl} onChange={(e) => setTpl(e.target.value)} className="mt-1 h-9 w-full border border-line bg-surface px-2 text-[15px]">
            {TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField label="Organización (opcional)" htmlFor="imp-org" hint="Para comprobantes y asientos de una sola organización. Los clientes se cruzan por CUIT.">
          <select id="imp-org" name="organization_id" defaultValue="" className="mt-1 h-9 w-full border border-line bg-surface px-2 text-[15px]">
            <option value="">Cruzar por CUIT</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField label="Archivo exportado" htmlFor="imp-file" hint="CSV (coma, punto y coma o tabulación) o XLSX, hasta 10 MB." className="sm:col-span-2">
          <Input id="imp-file" name="file" type="file" accept=".csv,.txt,.xlsx" required className="mt-1" />
        </AdminField>
      </div>
      <details className="border border-line bg-canvas p-3">
        <summary className="cursor-pointer text-[14px] font-medium text-ink">Mapeo de columnas ({RESOURCE_LABEL[template.resource]})</summary>
        <p className="mt-2 text-[13px] text-muted">Faro busca cada dato por estos nombres de columna. Si tu exportación usa otros, escribilos separados por coma.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(Object.keys(FIELD_LABEL) as MappingField[])
            .filter((f) => template.columns[f])
            .map((f) => (
              <AdminField key={`${tpl}-${f}`} label={FIELD_LABEL[f]} htmlFor={`col-${f}`}>
                <Input id={`col-${f}`} name={`col_${f}`} placeholder={template.columns[f]!.join(", ")} className="mt-1 text-[14px]" />
              </AdminField>
            ))}
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" disabled={pending} className="h-9 bg-surface px-4">
          {pending ? "Leyendo…" : "Vista previa"}
        </Button>
        <Button type="button" disabled={pending || !state?.ok || !state.preview?.length} onClick={() => run("importar")} className="h-9 px-4">
          Importar
        </Button>
      </div>
      {state && (
        <div role="status" className={`border px-4 py-3 text-[14px] ${state.ok ? "border-line bg-surface" : "border-danger/30 bg-danger/5 text-danger"}`}>
          <p className="font-medium">{state.message}</p>
          {state.columns && Object.keys(state.columns).length > 0 && (
            <p className="mt-1 text-[13px] text-muted">
              Columnas: {Object.entries(state.columns).map(([k, v]) => `${FIELD_LABEL[k as MappingField]} → “${v}”`).join(" · ")}
            </p>
          )}
          {!!state.preview?.length && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-[13px]">
                <thead className="text-[12px] uppercase tracking-wide text-muted">
                  <tr className="border-b border-line">
                    <th className="py-1.5 font-medium">ID</th>
                    <th className="py-1.5 font-medium">CUIT</th>
                    <th className="py-1.5 font-medium">Nombre</th>
                    <th className="py-1.5 font-medium">Fecha</th>
                    <th className="py-1.5 text-right font-medium">Importe</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {state.preview.map((r) => (
                    <tr key={r.externalId} className="border-b border-line last:border-0">
                      <td className="py-1.5">{r.externalId}</td>
                      <td className="py-1.5">{r.cuit ?? "—"}</td>
                      <td className="py-1.5">{r.name ?? "—"}</td>
                      <td className="py-1.5">{r.date ?? "—"}</td>
                      <td className="py-1.5 text-right">{r.amount != null ? r.amount.toLocaleString("es-AR") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!!state.errors?.length && (
            <ul className="mt-2 list-disc pl-5 text-[13px] text-[#7a5410]">
              {state.errors.slice(0, 8).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
