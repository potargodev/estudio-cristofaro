import Link from "next/link";
import { notFound } from "next/navigation";
import { SettleForm } from "@/components/gastos/SettleForm";
import { requireGastos } from "@/modules/gastos/server/actor";
import { GastosError, getGroupView } from "@/modules/gastos/server/service";

export const metadata = { title: "Saldar" };

export default async function Saldar({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string; monto?: string; moneda?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireGastos();
  let v;
  try {
    v = await getGroupView(actor, id);
  } catch (e) {
    if (e instanceof GastosError) notFound();
    throw e;
  }
  const ids = new Set(v.members.map((m) => m.id));
  // Sugerencia: la primera deuda en la que participo
  const mine = Object.entries(v.transfers).flatMap(([cur, ts]) => ts.map((t) => ({ ...t, cur }))).find((t) => t.from === v.me.id || t.to === v.me.id);
  const from = sp.from && ids.has(sp.from) ? sp.from : (mine?.from ?? v.me.id);
  const to = sp.to && ids.has(sp.to) ? sp.to : (mine?.to ?? v.members.find((m) => m.id !== v.me.id)?.id ?? v.me.id);
  const cents = sp.monto && /^\d+$/.test(sp.monto) ? Number(sp.monto) : (mine?.amount ?? 0);
  const currency = sp.moneda && /^[A-Z]{3}$/.test(sp.moneda) ? sp.moneda : (mine?.cur ?? v.group.base_currency);
  return (
    <>
      <Link href={`/gastos/g/${v.group.id}?tab=saldos`} className="text-[14px] text-rose-deep underline-offset-4 hover:underline">
        ← {v.group.name}
      </Link>
      <h1 className="mb-2 mt-3 font-display text-4xl leading-none">Saldar</h1>
      <p className="mb-6 text-muted">Registrá un pago. Queda informado y se confirma cuando la otra persona lo acepta.</p>
      <SettleForm
        groupId={v.group.id}
        meId={v.me.id}
        members={v.members.map((m) => ({ id: m.id, name: m.name, alias: m.alias, cvu: m.cvu }))}
        initial={{ from, to, amount: cents ? (cents / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "", currency }}
      />
    </>
  );
}
