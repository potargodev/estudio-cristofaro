import { type NextRequest } from "next/server";
import writeXlsxFile from "write-excel-file/node";
import { audit } from "@/lib/audit";
import { EXPORT_HEADERS, toCsv, toTangoCsv, type ExportRow } from "@/modules/smart-docs/core";
import { resolveScope, type Ambito } from "@/modules/smart-docs/scope";
import { exportData, markExported } from "@/modules/smart-docs/server";

export const dynamic = "force-dynamic";

/**
 * Exportación de lo confirmado: CSV, planilla XLSX (una hoja por cuenta),
 * archivo para Tango (Compras) o planilla para importar en Xubio.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const a = q.get("ambito");
  const ambito: Ambito = a === "estudio" || a === "personal" ? a : "bitacora";
  const r = await resolveScope(ambito, q.get("org"));
  const formato = ["csv", "xlsx", "tango", "xubio"].includes(q.get("formato") ?? "") ? q.get("formato")! : "csv";
  const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(q.get(k) ?? "") ? q.get(k)! : undefined);
  const { rows, ids } = await exportData(r.scope, date("desde"), date("hasta"));
  const name = `lectura-${r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${new Date().toISOString().slice(0, 10)}`;
  let body: Uint8Array | string;
  let type: string;
  let ext: string;
  if (formato === "csv") [body, type, ext] = [toCsv(rows), "text/csv; charset=utf-8", "csv"];
  else if (formato === "tango") [body, type, ext] = [toTangoCsv(rows), "text/csv; charset=utf-8", "csv"];
  else {
    const head = EXPORT_HEADERS.map(([, h]) => ({ value: h, fontWeight: "bold" as const }));
    const sheet = (list: ExportRow[]) => [head, ...list.map((row) => EXPORT_HEADERS.map(([k]) => ({ value: row[k] ?? "" })))];
    const accounts = formato === "xubio" ? ["Compras"] : [...new Set(rows.map((x) => x.cuenta))].sort();
    const data = formato === "xubio" ? [sheet(rows)] : accounts.length ? accounts.map((acc) => sheet(rows.filter((x) => x.cuenta === acc))) : [sheet([])];
    const sheets = (accounts.length ? accounts : ["Comprobantes"]).map((s) => s.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
    const buf = await writeXlsxFile(data.map((d, i) => ({ data: d as never, sheet: sheets[i] })) as never).toBuffer();
    [body, type, ext] = [new Uint8Array(buf as unknown as Buffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"];
  }
  await markExported(ids);
  await audit({ studioId: r.scope.studioId, organizationId: r.scope.organizationId, actor: r.actor, action: "lectura.exportar", entityType: "exportacion", metadata: { formato, comprobantes: ids.length } });
  return new Response(body as BodyInit, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}${formato === "tango" ? "-tango" : formato === "xubio" ? "-xubio" : ""}.${ext}"`, "Cache-Control": "private, no-store" } });
}
