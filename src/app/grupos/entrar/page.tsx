import Link from "next/link";
import { redirect } from "next/navigation";
import { getGastosActor } from "@/modules/gastos/server/session";

export const metadata = { title: "Entrar" };

const MESSAGES: Record<string, string> = {
  invalida: "Ese enlace ya no sirve: puede que lo hayan renovado o que te hayan sacado del grupo. Pedile a quien te invitó un enlace nuevo.",
  limite: "Hubo demasiados intentos. Esperá unos minutos y probá de nuevo.",
};

export default async function Entrar({ searchParams }: { searchParams: Promise<{ invitacion?: string }> }) {
  if (await getGastosActor()) redirect("/grupos");
  const { invitacion } = await searchParams;
  return (
    <div className="mx-auto max-w-md pt-6">
      <h1 className="font-display text-4xl leading-tight">Grupos de gastos</h1>
      <p className="mt-3 text-muted">Para ver tus grupos, entrá con tu cuenta. Si te invitaron sin cuenta, abrí el enlace que te pasaron.</p>
      {invitacion && MESSAGES[invitacion] && <p role="alert" className="mt-5 border-l-2 border-rose bg-rose-soft px-4 py-3 text-[14px] text-rose-deep">{MESSAGES[invitacion]}</p>}
      <div className="mt-8 grid gap-3">
        <Link href="/ingresar" className="flex h-12 items-center justify-center bg-navy px-5 text-paper hover:bg-navy-deep">
          Entrar a Faro
        </Link>
        <Link href="/admin/login" className="flex h-12 items-center justify-center border border-navy/30 px-5 text-navy hover:bg-navy-soft">
          Soy de un estudio contable
        </Link>
      </div>
    </div>
  );
}
