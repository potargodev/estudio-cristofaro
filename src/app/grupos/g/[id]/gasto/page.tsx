import Link from "next/link";
import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/gastos/ExpenseForm";
import { requireGastos } from "@/modules/gastos/server/session";
import { receiptReadingAvailable } from "@/modules/gastos/server/receipt";
import { GastosError, getGroupView } from "@/modules/gastos/server/service";

export const metadata = { title: "Agregar gasto" };

export default async function NuevoGasto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireGastos();
  let v;
  try {
    v = await getGroupView(actor, id);
  } catch (e) {
    if (e instanceof GastosError) notFound();
    throw e;
  }
  const ai = await receiptReadingAvailable(v.group.studio_id);
  return (
    <>
      <Link href={`/grupos/g/${v.group.id}`} className="text-[14px] text-rose-deep underline-offset-4 hover:underline">
        ← {v.group.name}
      </Link>
      <h1 className="mb-6 mt-3 font-display text-4xl leading-none">Agregar gasto</h1>
      <ExpenseForm
        groupId={v.group.id}
        members={v.members.map((m) => ({ id: m.id, name: m.name }))}
        meId={v.me.id}
        baseCurrency={v.group.base_currency}
        hasContext={!!v.group.organization_id || v.group.context_tenant}
        receiptAI={ai}
      />
    </>
  );
}
