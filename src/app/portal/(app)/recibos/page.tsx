import type { Metadata } from "next";
import { signPayslipAction } from "@/app/sueldos-actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { Badge, Card, Empty, PageTitle } from "@/components/portal/ui";
import { requireEmployee } from "@/lib/auth";
import { myPayslips } from "@/modules/payroll/server";

export const metadata: Metadata = { title: "Mis recibos" };

const per = (p: string) => `${p.slice(5)}/${p.slice(0, 4)}`;

/** Mis recibos: ver cada recibo y firmarlo conforme o no conforme (con motivo) */
export default async function MisRecibos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireEmployee();
  const slips = await myPayslips(me.employee.id, me.organizationId);
  return (
    <>
      <PageTitle title="Mis recibos" intro="Abrí cada recibo, revisalo y firmalo. Si algo no está bien, firmalo no conforme y contá por qué." />
      <Feedback sp={sp} />
      {slips.length === 0 ? (
        <Empty>Todavía no tenés recibos publicados.</Empty>
      ) : (
        <ul className="grid gap-3">
          {slips.map((p) => (
            <li key={p.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lead font-semibold">Recibo de {per(p.period)}</p>
                  {p.status === "conforme" ? <Badge tone="ok">Firmado conforme</Badge> : p.status === "no_conforme" ? <Badge tone="danger">Firmado no conforme</Badge> : <Badge tone="warn">Falta tu firma</Badge>}
                </div>
                <a href={`/api/recibos/${p.id}`} target="_blank" rel="noopener" className="mt-2 inline-block text-ui underline">
                  Ver el recibo (PDF)
                </a>
                {p.signed_at ? (
                  <p className="mt-2 text-meta text-muted">
                    Firmado el {p.signed_at.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })} desde {p.sign_device}. Constancia: {p.seal?.slice(0, 16)}…{p.reason ? ` · Motivo: ${p.reason}` : ""}
                  </p>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <form action={signPayslipAction} className="grid gap-2 rounded-md border border-line p-3">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="decision" value="conforme" />
                      <label className="flex items-start gap-2 text-ui">
                        <input type="checkbox" name="confirm" required className="mt-0.5" /> Revisé el recibo
                      </label>
                      <SubmitButton pendingText="Firmando…">Firmar conforme</SubmitButton>
                    </form>
                    <form action={signPayslipAction} className="grid gap-2 rounded-md border border-line p-3">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="decision" value="no_conforme" />
                      <label className="text-meta text-muted">
                        Motivo
                        <input name="reason" required className="mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-ui text-ink" />
                      </label>
                      <label className="flex items-start gap-2 text-ui">
                        <input type="checkbox" name="confirm" required className="mt-0.5" /> Revisé el recibo
                      </label>
                      <SubmitButton variant="danger" pendingText="Firmando…">Firmar no conforme</SubmitButton>
                    </form>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-caption text-muted">Al firmar guardamos la fecha y hora, tu IP, el dispositivo y la huella (hash) del documento, para que la firma quede asociada a este recibo.</p>
    </>
  );
}
