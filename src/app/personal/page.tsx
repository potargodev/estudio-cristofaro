import { and, desc, eq, isNull, or } from "drizzle-orm";
import { CalendarClock, FileText, Gauge, LifeBuoy, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { requestAccountant } from "./actions";
import { Notice } from "@/components/admin/AdminField";
import { SubmitButton } from "@/components/admin/ui";
import { Textarea } from "@/components/ui/textarea";
import { getDb } from "@/db";
import { accounting_expenses, studios } from "@/db/schema";
import { categoryName, formatMoney } from "@/modules/gastos/constants";
import { requirePersonal } from "@/lib/auth";
import { getPlan } from "@/lib/faro/plans";
import { ownOrganization } from "@/lib/faro/tenants";

export const metadata = { title: "Inicio" };

const SOON = [
  { icon: FileText, title: "Facturación electrónica", text: "Facturas A, B, C y E con ARCA, con tu logo y link de pago." },
  { icon: Gauge, title: "Semáforo de monotributo", text: "Cuánto podés facturar sin pasarte y aviso de recategorización." },
  { icon: ShieldCheck, title: "Tu situación con ARCA", text: "Constancia y datos del padrón por web service oficial." },
  { icon: CalendarClock, title: "Calendario personal", text: "Tus vencimientos según tu CUIT, con el importe y alertas." },
];

const cuitFmt = (c: string | null) => (c ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : "—");

export default async function PersonalHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requirePersonal();
  const [t] = await getDb().select().from(studios).where(eq(studios.id, me.studioId));
  const own = await ownOrganization(me.studioId);
  // Gastos de la actividad: lo que marcó "de la empresa" o "deducible" en grupos conectados a su contabilidad
  const activity = await getDb()
    .select()
    .from(accounting_expenses)
    .where(and(eq(accounting_expenses.studio_id, me.studioId), own ? or(isNull(accounting_expenses.organization_id), eq(accounting_expenses.organization_id, own.id)) : isNull(accounting_expenses.organization_id)))
    .orderBy(desc(accounting_expenses.date))
    .limit(8);
  const first = me.name.split(" ")[0];
  return (
    <div className="grid gap-6 pb-10">
      {sp.contador && <Notice>{sp.contador === "1" ? "Listo: un contador del Estudio Cristofaro te va a escribir." : "No pudimos mandar el pedido. Probá de nuevo."}</Notice>}
      <header>
        <p className="text-[13px] text-muted">
          {sp.bienvenida ? "Te damos la bienvenida a Faro Personal" : "Faro Personal"} · plan {getPlan(t?.plan_key)?.name} · CUIT {cuitFmt(t?.cuit ?? null)}
        </p>
        <h1 className="mt-2 font-display text-[34px] leading-tight text-ink sm:text-[44px]">Hola, {first}.</h1>
        <p className="mt-2 max-w-xl text-[15px] text-muted">Desde acá vas a llevar tus números sin ser contador. Arrancamos por los gastos compartidos; lo demás llega muy pronto.</p>
      </header>

      <Link href="/gastos" className="group flex items-center gap-4 border border-line bg-surface p-5 transition-colors hover:border-muted">
        <span className="grid size-12 shrink-0 place-items-center bg-navy text-gold">
          <Wallet className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-medium text-ink">Gastos compartidos</span>
          <span className="block text-[14px] text-muted">Dividí gastos con socios, clientes o amigos. Lo deducible queda marcado para tu contabilidad.</span>
        </span>
        <span className="text-[14px] font-medium text-ink underline-offset-4 group-hover:underline">Abrir</span>
      </Link>

      {activity.length > 0 && (
        <section aria-labelledby="actividad" className="border border-line bg-surface p-5">
          <h2 id="actividad" className="text-[17px] font-medium text-ink">
            Gastos de tu actividad
          </h2>
          <p className="mt-1 text-[14px] text-muted">Los que marcaste como de la actividad o deducibles, con su comprobante. Quedan listos para tu contabilidad.</p>
          <ul className="mt-3 divide-y divide-line">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 py-2.5 text-[14px]">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{a.description}</span>
                  <span className="block text-muted">
                    {a.date} · {categoryName(a.category)}
                    {a.deductible && " · deducible"}
                    {a.receipt_path && (
                      <>
                        {" · "}
                        <a href={`/api/gastos/archivo/contable/${a.id}`} target="_blank" className="text-rose-deep underline-offset-4 hover:underline">
                          comprobante
                        </a>
                      </>
                    )}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatMoney(a.amount, a.currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="pronto">
        <h2 id="pronto" className="text-[13px] font-medium uppercase tracking-wide text-muted">
          Próximamente
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {SOON.map((s) => (
            <li key={s.title} className="flex gap-3 border border-dashed border-line bg-surface/60 p-4">
              <s.icon className="mt-0.5 size-5 shrink-0 text-gold-ink" strokeWidth={1.5} aria-hidden />
              <span>
                <span className="block font-medium text-ink">{s.title}</span>
                <span className="block text-[14px] text-muted">{s.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contador" className="border border-line bg-surface p-5">
        <h2 id="contador" className="flex items-center gap-2 text-[17px] font-medium text-ink">
          <LifeBuoy className="size-5 text-gold-ink" strokeWidth={1.5} aria-hidden /> Necesito un contador
        </h2>
        <p className="mt-1 text-[14px] text-muted">Te contacta un contador del Estudio Cristofaro, el primer estudio de Faro. Tus números no se comparten hasta que vos lo autorices.</p>
        <form action={requestAccountant} className="mt-4 grid gap-3">
          <label htmlFor="msg" className="sr-only">
            Contanos qué necesitás
          </label>
          <Textarea id="msg" name="message" rows={3} maxLength={1500} placeholder="Contanos qué necesitás (opcional)" />
          <div>
            <SubmitButton pendingText="Enviando…">Pedir un contador</SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
