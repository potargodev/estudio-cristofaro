import { FileSignature, Megaphone, ReceiptText, Wallet } from "lucide-react";
import { markStep } from "@/modules/onboarding/server";
import type { Metadata } from "next";
import Link from "next/link";
import { requireEmployee } from "@/lib/auth";

export const metadata: Metadata = { title: "Mi espacio" };

/** Portal mínimo del empleado: grupos de gastos y rendiciones; recibos y comunicaciones llegan en la F5 */
export default async function EmpleadoHome() {
  const me = await requireEmployee();
  await markStep("inicio_empleado").catch(() => undefined);
  const cards = [
    { href: "/grupos", icon: Wallet, title: "Grupos de gastos", text: "Dividí gastos con tu equipo, socios o amigos y saldá cuentas." },
    { href: "/portal/rendiciones", icon: ReceiptText, title: "Rendiciones", text: `Cargá lo que gastaste para ${me.organizationName} con su ticket y seguí el reintegro.` },
  ];
  const soon = [
    { icon: FileSignature, title: "Recibos de sueldo", text: "Vas a recibirlos acá y firmarlos en un toque." },
    { icon: Megaphone, title: "Comunicaciones", text: "Los avisos de la empresa, con confirmación de lectura." },
  ];
  return (
    <>
      <p className="text-[13px] font-medium text-muted">
        {me.organizationName}
        {me.employee.position && ` · ${me.employee.position}`}
      </p>
      <h1 className="mt-1 font-display text-[clamp(2.2rem,5vw,3.2rem)] leading-none">Hola, {me.employee.firstName}</h1>
      <p className="mt-2.5 text-[16px] text-muted">Tu espacio en la empresa.</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <li key={c.href}>
            <Link href={c.href} className="group flex h-full gap-4 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-muted">
              <span className="grid size-11 shrink-0 place-items-center rounded-md bg-navy text-gold">
                <c.icon className="size-5" strokeWidth={1.6} aria-hidden />
              </span>
              <span>
                <span className="block text-[17px] font-semibold">{c.title}</span>
                <span className="mt-1 block text-[14px] text-muted">{c.text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <h2 className="mt-10 text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Próximamente</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {soon.map((c) => (
          <li key={c.title} className="flex gap-3 rounded-lg border border-dashed border-line p-4">
            <c.icon className="mt-0.5 size-5 shrink-0 text-gold-ink" strokeWidth={1.5} aria-hidden />
            <span>
              <span className="block font-medium">{c.title}</span>
              <span className="block text-[14px] text-muted">{c.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
