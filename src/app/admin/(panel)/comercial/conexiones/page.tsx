import { Star, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { SubmitButton } from "@/components/admin/ui";
import { inviteClientAction } from "@/app/admin/conexiones-actions";
import { requireStaff } from "@/lib/auth";
import { STATUS_LABEL, studioConnections, studioRatings } from "@/modules/conexiones/server";

export const metadata: Metadata = { title: "Conexiones" };

const field = "mt-1 block w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[14px] text-ink";
const GROUPS: { title: string; states: string[] }[] = [
  { title: "Para revisar", states: ["admision", "acuerdo"] },
  { title: "Invitaciones enviadas", states: ["invitada"] },
  { title: "Cuentas conectadas", states: ["activa"] },
  { title: "En cierre", states: ["en_cierre", "en_disputa"] },
  { title: "Terminadas", states: ["cerrada", "rechazada", "cancelada"] },
];
const tone = (st: string) => (st === "activa" ? "activa" : st === "admision" || st === "acuerdo" ? "pendiente" : st === "en_disputa" ? "vencida" : "pausada");

/**
 * Conexiones (Comercial): personas y autónomos que conectan su cuenta con el
 * estudio (§7). Conexión, no copia: el estudio trabaja sobre sus datos en vivo.
 */
export default async function ConexionesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireStaff();
  const [list, ratings] = await Promise.all([studioConnections(me), studioRatings(me)]);
  return (
    <div className="grid gap-6 [&>*]:min-w-0">
      <PageHeader level={2} title="Conexiones" description="Cuentas de personas y autónomos que se conectan con el estudio. Antes de aceptar hacés tu admisión; después firman el acuerdo y trabajás sobre sus datos en vivo, sin copias." className="mb-0" />
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}

      <section aria-labelledby="invitar" className="rounded-lg border border-line bg-surface p-5">
        <h3 id="invitar" className="flex items-center gap-2 text-[16px] font-semibold">
          <UserPlus className="size-5 text-rose-deep" aria-hidden /> Invitar a un cliente
        </h3>
        <p className="mt-1 text-[13px] text-muted">La persona tiene que tener su cuenta de Faro (es gratis). Elige qué compartir y cómo trabajan; después hacés tu admisión.</p>
        <form action={inviteClientAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-[13px] text-muted">
            Mail
            <input name="email" type="email" required className={field} />
          </label>
          <label className="text-[13px] text-muted">
            Mensaje (opcional)
            <input name="message" maxLength={500} className={field} />
          </label>
          <SubmitButton pendingText="…">Invitar</SubmitButton>
        </form>
      </section>

      {GROUPS.map((g) => {
        const rows = list.filter((r) => g.states.includes(r.c.status));
        if (!rows.length) return null;
        return (
          <section key={g.title} aria-label={g.title} className="rounded-lg border border-line bg-surface">
            <h3 className="px-5 pt-4 text-[15px] font-semibold">
              {g.title} <span className="font-normal text-muted">· {rows.length}</span>
            </h3>
            <ul className="mt-2 divide-y divide-line">
              {rows.map(({ c, name, email }) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3" data-conexion={c.status}>
                  <span className="min-w-0">
                    <Link href={c.status === "activa" || c.status === "en_cierre" || c.status === "en_disputa" ? `/admin/organizaciones/cuenta/${c.id}` : `/admin/comercial/conexiones/${c.id}`} className="block truncate text-[15px] font-medium text-ink underline-offset-4 hover:underline">
                      {name}
                    </Link>
                    <span className="block text-[13px] text-muted">
                      {email} · {c.initiated_by === "usuario" ? "la pidió la persona" : "la invitó el estudio"} · {c.source === "flota" ? "desde una Flota" : c.created_at.toLocaleDateString("es-AR")}
                    </span>
                  </span>
                  <StatusBadge status={tone(c.status)} label={STATUS_LABEL[c.status]} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {list.length === 0 && <p className="text-[14px] text-muted">Todavía no hay conexiones. Llegan desde la Red de estudios o invitando a tus clientes.</p>}

      <section aria-labelledby="calificaciones" className="rounded-lg border border-line bg-surface p-5">
        <h3 id="calificaciones" className="flex items-center gap-2 text-[16px] font-semibold">
          <Star className="size-5 text-rose-deep" aria-hidden /> Tus calificaciones
        </h3>
        <p className="mt-1 text-[13px] text-muted">Las encuestas durante la relación y al cierre. Son privadas: solo las ves vos; no cambian lo que se muestra en la Red.</p>
        {ratings.length === 0 ? (
          <p className="mt-2 text-[14px] text-muted">Todavía no hay calificaciones.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {ratings.map(({ r, name }) => (
              <li key={r.id} className="py-2 text-[14px]">
                <span className="num">{"★".repeat(r.score ?? 0)}</span> {name} · {r.kind === "cierre" ? "al cierre" : "durante la relación"} · {r.created_at.toLocaleDateString("es-AR")}
                {r.comment && <span className="block text-muted">«{r.comment}»</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
