import { Download } from "lucide-react";
import type { Metadata } from "next";
import { SaveToast } from "@/components/admin/SaveToast";
import { FileField } from "@/components/portal/FileField";
import { Badge, Card, Empty, PageTitle } from "@/components/portal/ui";
import { SubmitButton } from "@/components/admin/ui";
import { requireMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getDocuments } from "@/lib/portal-data";
import { categoryLabel, periodLabel } from "@/lib/portal-types";
import { formatBytes } from "@/lib/uploads-shared";
import { uploadClientDocument } from "../../actions";

export const metadata: Metadata = { title: "Documentos" };

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function DocumentosPage({ searchParams }: { searchParams: Promise<{ subido?: string; error?: string }> }) {
  const { subido, error } = await searchParams;
  const me = await requireMember("documentos.ver");
  const docs = await getDocuments(me);

  // Agrupados por período (más reciente primero) y dentro de cada uno por categoría
  const byPeriod = new Map<string, Map<string, typeof docs>>();
  for (const d of docs) {
    const p = d.period ?? "";
    const cat = d.category ?? "otro";
    if (!byPeriod.has(p)) byPeriod.set(p, new Map());
    const cats = byPeriod.get(p)!;
    cats.set(cat, [...(cats.get(cat) ?? []), d]);
  }
  const periods = [...byPeriod.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : b.localeCompare(a)));

  return (
    <>
      {subido && <SaveToast message="Listo, recibimos tu archivo." />}
      <PageTitle title="Documentos" intro="Descargá lo que te manda el estudio y subí tus comprobantes." />

      {can(me.orgRole, "documentos.subir") && (
        <Card className="mb-8">
          <h2 className="font-semibold">Subir un comprobante</h2>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error === "archivo" ? "Elegí un archivo." : error}
            </p>
          )}
          <form action={uploadClientDocument} className="mt-4 grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr]">
            <FileField id="file" label="Archivo" required />
            <div>
              <label htmlFor="category" className="block text-sm font-medium">
                Tipo
              </label>
              <select
                id="category"
                name="category"
                defaultValue="comprobantes"
                className="mt-1.5 h-11 w-full rounded-md border border-line bg-surface px-3 text-[15px]"
              >
                <option value="comprobantes">Comprobantes</option>
                <option value="recibos">Recibos de sueldo</option>
                <option value="constancias">Constancias</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label htmlFor="period" className="block text-sm font-medium">
                Período
              </label>
              <input
                id="period"
                name="period"
                type="month"
                className="mt-1.5 h-11 w-full rounded-md border border-line bg-surface px-3 text-[15px]"
              />
            </div>
            <div className="sm:col-span-3">
              <SubmitButton pendingText="Subiendo…">Subir archivo</SubmitButton>
            </div>
          </form>
        </Card>
      )}

      {docs.length === 0 && <Empty art="carpeta">Todavía no hay documentos.</Empty>}
      {periods.map((p) => (
        <section key={p || "sin"} className="mb-8">
          <h2 className="mb-3 text-lg font-semibold first-letter:uppercase">{periodLabel(p || null)}</h2>
          <div className="space-y-4">
            {[...byPeriod.get(p)!.entries()].map(([cat, items]) => (
              <div key={cat}>
                <h3 className="mb-2 text-sm font-medium text-muted">{categoryLabel(cat)}</h3>
                <ul className="divide-y divide-line rounded-md border border-line bg-surface">
                  {items.map((d) => (
                    <li key={d.id}>
                      <a
                        href={`/api/archivos/${d.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-canvas"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{d.name}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                            {dateFmt.format(d.created_at)} · {formatBytes(d.size_bytes)}
                            <Badge tone={d.source === "cliente" ? "neutral" : "warn"}>
                              {d.source === "cliente" ? "Subido por vos" : "Del estudio"}
                            </Badge>
                          </span>
                        </span>
                        <Download className="size-5 shrink-0 text-rose-deep" aria-label={`Descargar ${d.name}`} />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
