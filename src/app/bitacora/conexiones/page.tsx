import type { Metadata } from "next";
import { connectAction, disconnectAction, proposalAction, syncAction } from "@/app/bitacora/plus-actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { available, listConnections, listProposals, type Provider } from "@/modules/bitacora/connections";
import { bitacoraPlan } from "@/modules/bitacora/plus";
import { requireUser } from "@/modules/bitacora/session";

export const metadata: Metadata = { title: "Conexiones" };

const INFO: Record<Provider, { name: string; text: string }> = {
  mercadopago: { name: "Mercado Pago", text: "Traemos los pagos y cobros de tu cuenta de los últimos 30 días. Solo lectura: Faro no puede mover tu plata." },
  gmail: { name: "Gmail", text: "Leemos (solo lectura) los mails de facturas de servicios, suscripciones y resúmenes de tarjeta, y te proponemos cargarlos. Nada entra sin que lo aceptes." },
};
const DETECTED: Record<string, string> = { servicio: "Servicio", suscripcion: "Suscripción", resumen_tarjeta: "Resumen de tarjeta", factura: "Factura" };

/** Conexiones de Bitácora Plus: Mercado Pago y Gmail, y las propuestas para confirmar */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const [plan, conns, proposals] = await Promise.all([bitacoraPlan(me), listConnections(me.id), listProposals(me.id)]);
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      {!plan.plus && (
        <p className="rounded-md border border-line bg-surface p-4 text-ui">
          Las conexiones son de <span className="font-medium">Bitácora Plus</span>. Mientras tanto podés importar el CSV de movimientos de Mercado Pago desde la pestaña Importar.
        </p>
      )}
      {(["mercadopago", "gmail"] as Provider[]).map((p) => {
        const c = conns.find((x) => x.provider === p);
        return (
          <section key={p} className="grid gap-2 rounded-md border border-line bg-surface p-4" aria-label={INFO[p].name}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-lead font-semibold">{INFO[p].name}</p>
              {c && (
                <p className="text-meta text-muted">
                  {c.status === "error" ? <span className="text-[#8f2a1c]">Con error</span> : "Conectado"}
                  {c.label ? ` · ${c.label}` : ""}
                  {c.lastSync ? ` · última lectura ${c.lastSync.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}` : ""}
                </p>
              )}
            </div>
            <p className="text-ui text-muted">{INFO[p].text}</p>
            {c?.lastError && <p className="text-meta text-[#8f2a1c]">{c.lastError}</p>}
            <div className="flex flex-wrap gap-2">
              {c ? (
                <>
                  <form action={syncAction}>
                    <input type="hidden" name="provider" value={p} />
                    <SubmitButton pendingText="Leyendo…">{p === "gmail" ? "Buscar mails" : "Traer movimientos"}</SubmitButton>
                  </form>
                  <form action={disconnectAction}>
                    <input type="hidden" name="provider" value={p} />
                    <SubmitButton variant="danger" pendingText="…">Desconectar</SubmitButton>
                  </form>
                </>
              ) : plan.plus && available(p) ? (
                <form action={connectAction}>
                  <input type="hidden" name="provider" value={p} />
                  <SubmitButton pendingText="…">Conectar {INFO[p].name}</SubmitButton>
                </form>
              ) : plan.plus ? (
                <p className="text-meta text-muted">Todavía no está disponible en Faro.</p>
              ) : null}
            </div>
          </section>
        );
      })}
      {proposals.length > 0 && (
        <section className="grid gap-2" aria-label="Para confirmar">
          <h2 className="text-lead font-semibold">Para confirmar</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {proposals.map((p) => (
              <li key={p.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-body">{p.description}</p>
                  <p className="text-meta text-muted">
                    {DETECTED[p.detected] ?? p.detected} · {p.date ? p.date.split("-").reverse().join("/") : "sin fecha"} · desde {p.source === "gmail" ? "Gmail" : p.source}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <form action={proposalAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="op" value="aceptar" />
                    <input name="amount" inputMode="decimal" aria-label="Importe" placeholder="Importe" defaultValue={p.amount ? (p.amount / 100).toLocaleString("es-AR") : ""} className="h-9 w-28 rounded-md border border-line bg-surface px-2 text-ui" />
                    <SubmitButton pendingText="…">Cargar</SubmitButton>
                  </form>
                  <form action={proposalAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="op" value="descartar" />
                    <SubmitButton variant="danger" pendingText="…">Descartar</SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
