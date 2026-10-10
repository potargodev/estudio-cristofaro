import Link from "next/link";
import { redirect } from "next/navigation";
import { NewGroupForm } from "@/components/gastos/NewGroupForm";
import { requireGastos } from "@/modules/gastos/server/actor";
import { contextOptions } from "@/modules/gastos/server/service";

export const metadata = { title: "Nuevo grupo" };

export default async function NuevoGrupo() {
  const actor = await requireGastos();
  if (actor.kind !== "user") redirect("/gastos");
  const ctx = await contextOptions(actor);
  const contexts = [...(ctx.tenant ? [{ value: "tenant", label: "Mis gastos de la actividad (Faro Personal)" }] : []), ...ctx.organizations.map((o) => ({ value: o.id, label: o.name }))];
  return (
    <>
      <Link href="/gastos" className="text-[14px] text-rose-deep underline-offset-4 hover:underline">
        ← Tus grupos
      </Link>
      <h1 className="mt-3 font-display text-4xl leading-none">Nuevo grupo</h1>
      <p className="mb-8 mt-2 text-muted">Después sumás a las personas: con cuenta de Faro o invitadas por un enlace.</p>
      <NewGroupForm contexts={contexts} />
    </>
  );
}
