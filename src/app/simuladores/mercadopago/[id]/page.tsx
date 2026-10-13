import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";
import { mpPayAction } from "@/app/simuladores/actions";
import { Feedback } from "@/components/app/Feedback";
import { Card, SubmitButton } from "@/components/ds";
import { formatAmount } from "@/lib/format";
import { simPreference } from "@/modules/simuladores/mercadopago";

export const metadata: Metadata = { title: "Pago simulado · Faro", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const DONE: Record<string, string> = { pagado: "Este pago ya se aprobó.", rechazado: "Este pago se rechazó. Podés aprobarlo igual para probar el reintento.", authorized: "La suscripción ya está adherida.", cancelled: "La suscripción se canceló." };

/** Parte C · Checkout del simulador de Mercado Pago: quien tiene el link aprueba o rechaza el pago y Faro recibe el aviso firmado */
export default async function SimCheckoutPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const p = /^SIM(PREF|SUB)-[0-9a-f]{12}$/.test(id) ? await simPreference(id) : null;
  return (
    <main className="app-ui grid min-h-dvh place-items-center bg-canvas px-4 py-10 text-ink">
      <div className="grid w-full max-w-md gap-4">
        <p className="flex items-center gap-2 text-meta text-muted">
          <FlaskConical className="size-4" aria-hidden /> Simulador de pagos de Faro · sin plata de verdad
        </p>
        <Feedback sp={sp} />
        {!p ? (
          <Card>
            <h1 className="text-title font-semibold">Este link de pago no existe</h1>
            <p className="mt-2 text-ui text-muted">Revisá el link o pedí uno nuevo.</p>
          </Card>
        ) : (
          <Card>
            <p className="text-meta text-muted">{p.kind === "suscripcion" ? "Suscripción mensual" : "Pago"}</p>
            <h1 className="mt-1 text-title font-semibold">{p.title}</h1>
            <p className="num mt-3 text-title">{formatAmount(p.amount)}</p>
            {DONE[p.status] && <p className="mt-3 text-ui text-muted">{DONE[p.status]}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <form action={mpPayAction}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="op" value="pagar" />
                <SubmitButton pendingText="Pagando…">{p.kind === "suscripcion" ? "Adherirme" : "Pagar"}</SubmitButton>
              </form>
              <form action={mpPayAction}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="op" value="rechazar" />
                <SubmitButton variant="secondary">Simular un rechazo</SubmitButton>
              </form>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
