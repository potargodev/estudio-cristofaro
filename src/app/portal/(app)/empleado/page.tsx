import { PageHeader } from "@/components/admin/kit/PageHeader";
import { FileSignature, Megaphone, ReceiptText, Wallet } from "lucide-react";
import { markStep } from "@/modules/onboarding/server";
import type { Metadata } from "next";
import Link from "next/link";
import { requireEmployee } from "@/lib/auth";
import { myAnnouncements, myPayslips } from "@/modules/payroll/server";

export const metadata: Metadata = { title: "Mi espacio" };

/** Portal del empleado: recibos para firmar, comunicados, rendiciones y grupos */
export default async function EmpleadoHome() {
  const me = await requireEmployee();
  await markStep("inicio_empleado").catch(() => undefined);
  const [slips, notes] = await Promise.all([myPayslips(me.employee.id, me.organizationId), myAnnouncements(me.employee.id)]);
  const toSign = slips.filter((p) => p.status === "publicado").length;
  const unread = notes.filter((n) => (n.a.require_ack ? !n.r.ack_at : !n.r.read_at));
  const cards = [
    { href: "/portal/recibos", icon: FileSignature, title: "Mis recibos", text: toSign ? `Tenés ${toSign} recibo${toSign === 1 ? "" : "s"} para firmar.` : "Tus recibos de sueldo, firmados conforme o no conforme." },
    { href: "/portal/rendiciones", icon: ReceiptText, title: "Rendiciones", text: `Cargá lo que gastaste para ${me.organizationName} con su ticket y seguí el reintegro.` },
    { href: "/grupos", icon: Wallet, title: "Grupos de gastos", text: "Dividí gastos con tu equipo, socios o amigos y saldá cuentas." },
  ];
  return (
    <>
      <PageHeader title={`Hola, ${me.employee.firstName}`} description={`Tu espacio en la empresa · ${me.organizationName}${me.employee.position ? ` · ${me.employee.position}` : ""}`} className="mb-0" />
      {notes.length > 0 && (
        <section aria-label="Comunicados" className="mt-6 grid gap-2">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Megaphone className="size-4 text-rose-deep" aria-hidden /> Comunicados {unread.length > 0 && <span className="num rounded-md bg-rose-soft px-1.5 text-[12px] text-rose-deep">{unread.length}</span>}
          </h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {notes.slice(0, 5).map(({ a, r }) => (
              <li key={a.id}>
                <Link href={`/portal/comunicados/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas">
                  <span className="min-w-0">
                    <span className={`block truncate text-[14px] ${(a.require_ack ? !r.ack_at : !r.read_at) ? "font-semibold" : ""}`}>{a.title}</span>
                    <span className="text-[12px] text-muted">{a.created_at.toLocaleDateString("es-AR")}</span>
                  </span>
                  <span className="text-[12px] text-muted">{r.ack_at ? "Confirmado" : a.require_ack ? "Confirmá la lectura" : r.read_at ? "Leído" : "Nuevo"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
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
    </>
  );
}
