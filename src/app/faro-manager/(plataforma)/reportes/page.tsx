import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { requireFaro } from "@/lib/auth";
import { listReports, REPORT_REASONS } from "@/modules/messages/server";
import { resolveReportAction } from "@/app/faro-manager/reportes-actions";

export const metadata: Metadata = { title: "Mensajes reportados" };

const when = (d: Date | string) => new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(d));

/** Moderación: el Faro Manager ve solo el mensaje reportado (copia del momento), nunca la conversación */
export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; ver?: string }> }) {
  await requireFaro();
  const sp = await searchParams;
  const all = sp.ver === "todos";
  const rows = await listReports(all ? "todos" : "abierto");
  return (
    <>
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      <PageHeader level={2} title="Mensajes reportados" description="Solo ves el mensaje que alguien reportó, tal como estaba al reportarlo. Las conversaciones son privadas: no se pueden abrir desde acá." />
      <p className="mb-4 text-[14px]">
        <Link href={all ? "/faro-manager/reportes" : "/faro-manager/reportes?ver=todos"} className="underline underline-offset-4">
          {all ? "Ver solo los abiertos" : "Ver también los revisados"}
        </Link>
      </p>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line bg-surface p-6 text-center text-[14px] text-muted">No hay reportes {all ? "" : "abiertos"}.</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map(({ r, reporter }) => (
            <li key={r.id} className="rounded-md border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px] text-muted">
                <span>
                  {REPORT_REASONS[r.reason as keyof typeof REPORT_REASONS] ?? r.reason} · reportó {reporter ?? "alguien"} · {when(r.created_at)}
                </span>
                <span>{r.status === "abierto" ? "Abierto" : `Revisado: ${r.resolution === "borrar" ? "mensaje borrado" : "sin acción"}`}</span>
              </div>
              <p className="mt-2 text-[13px] text-muted">
                De {r.snapshot.author ?? "un usuario"} · {when(r.snapshot.at)}
              </p>
              <blockquote className="mt-1 whitespace-pre-wrap rounded-md bg-canvas px-3 py-2 text-[15px]">{r.snapshot.body ?? (r.snapshot.attachment ? `Archivo: ${r.snapshot.attachment}` : "—")}</blockquote>
              {r.detail && <p className="mt-2 text-[13px]">Comentario: {r.detail}</p>}
              {r.status === "abierto" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    ["sin_accion", "Dejarlo (sin acción)", "border border-line"],
                    ["borrar", "Borrar el mensaje", "border border-danger/40 text-danger"],
                  ].map(([a, l, cls]) => (
                    <form key={a} action={resolveReportAction}>
                      <input type="hidden" name="report" value={r.id} />
                      <input type="hidden" name="accion" value={a} />
                      <button className={`h-9 rounded-md px-3 text-[13px] ${cls}`}>{l}</button>
                    </form>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
