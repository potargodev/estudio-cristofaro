import type { Metadata } from "next";
import { sendReceiptAction } from "@/app/portal/buzon-actions";
import { Feedback } from "@/components/app/Feedback";
import { SubmitButton, fieldClass } from "@/components/ds";
import { EmpresaHeader } from "@/components/portal/EmpresaTabs";
import { Badge, Card, Empty, PageTitle } from "@/components/portal/ui";
import { requireMember } from "@/lib/auth";
import { formatAmount, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SOURCE_LABEL } from "@/modules/buzon/core";
import { sentBy } from "@/modules/buzon/server";
import { asExtraction } from "@/modules/smart-docs/core";

export const metadata: Metadata = { title: "Comprobantes enviados" };

// Mis comprobantes enviados (§2.p, B8): lo que la persona mandó al estudio
// (portal, WhatsApp o mail) y en qué quedó.

const STATUS: Record<string, { label: string; tone: "neutral" | "ok" | "warn" | "danger" }> = {
  para_confirmar: { label: "En revisión del estudio", tone: "warn" },
  leyendo: { label: "Leyendo", tone: "neutral" },
  en_cola: { label: "Leyendo", tone: "neutral" },
  confirmado: { label: "Aprobado", tone: "ok" },
  descartado: { label: "No se usó", tone: "neutral" },
  error: { label: "No se pudo leer", tone: "danger" },
};

export default async function ComprobantesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireMember("documentos.subir");
  const sp = await searchParams;
  const rows = await sentBy(me.studioId, me.organizationId, me.id);
  return (
    <>
      <EmpresaHeader me={me} />
      <PageTitle level={2} title="Comprobantes enviados" intro="Mandale al estudio las facturas de tus proveedores: por acá, por WhatsApp o reenviando el mail. Acá ves en qué quedó cada una." />
      <div className="grid gap-5">
        <Feedback sp={sp} />
        <Card>
          <form action={sendReceiptAction} className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-meta text-muted">
              PDF o foto del comprobante
              <input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required className={cn(fieldClass, "mt-1 h-auto py-1.5")} />
            </label>
            <SubmitButton pendingText="Mandando…">Mandar al estudio</SubmitButton>
          </form>
        </Card>
        <Card>
          {rows.length === 0 ? (
            <Empty>Todavía no mandaste comprobantes.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((r) => {
                const e = asExtraction(r.extracted);
                const st = STATUS[r.status] ?? { label: r.status, tone: "neutral" as const };
                return (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e?.razon_social_emisor ?? r.file}</p>
                      <p className="text-ui text-muted">
                        {formatDate(r.createdAt.toISOString().slice(0, 10))} · {SOURCE_LABEL[r.source] ?? r.source}
                        {e?.total != null ? ` · ${formatAmount(e.total)}` : ""}
                      </p>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
