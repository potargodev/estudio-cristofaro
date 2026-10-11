import type { Metadata } from "next";
import Link from "next/link";
import { revokeShareAction, shareAction } from "@/app/bitacora/plus-actions";
import { pairFromHogarAction } from "@/app/cajas/actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { mySharing } from "@/modules/bitacora/shares";
import { requireUser } from "@/modules/bitacora/session";

export const metadata: Metadata = { title: "Hogar" };
const field = "mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-[14px] text-ink";

/** Bitácora compartida (hogar o pareja): con quién comparto y quién comparte conmigo */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const { mine, withMe } = await mySharing(me.id);
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      {sp.link && (
        <p className="break-all rounded-md border border-line bg-surface p-3 text-[13px] text-muted">
          Si el mail no le llega, pasale este enlace: <span className="text-ink">{sp.link}</span>
        </p>
      )}
      <p className="text-[14px] text-muted">Tu Bitácora es privada. Si querés llevar las cuentas del hogar con otra persona, invitala: elegís si solo mira o también carga, y cualquiera de las dos puede dejar de compartir cuando quiera.</p>
      <p className="rounded-md border border-line bg-navy-soft px-4 py-2.5 text-[14px] text-ink">
        ¿Quieren llevar la cuenta juntos (quién puso qué, si están a mano, ahorros en común)? Armen una <Link href="/cajas/nueva" className="underline underline-offset-4">caja compartida de pareja</Link>: cada uno carga lo suyo y su Bitácora sigue privada.
      </p>
      {withMe.length > 0 && (
        <section className="grid gap-2" aria-label="Compartidas conmigo">
          <h2 className="text-[16px] font-semibold">Compartidas con vos</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {withMe.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <Link href={`/bitacora/compartida/${s.id}`} className="text-[15px] text-navy underline">
                  Bitácora de {s.owner}
                </Link>
                <span className="text-[13px] text-muted">{s.permission === "cargar" ? "Ves y cargás" : "Solo ves"}</span>
                <form action={revokeShareAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <SubmitButton variant="danger" pendingText="…">Salir</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="grid gap-2" aria-label="Compartir mi Bitácora">
        <h2 className="text-[16px] font-semibold">Con quién compartís la tuya</h2>
        {mine.length > 0 && (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {mine.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px]">{s.member ?? s.email}</p>
                  <p className="text-[13px] text-muted">
                    {s.permission === "cargar" ? "Ve y carga" : "Solo ve"} · {s.status === "activa" ? "aceptó" : "invitación enviada"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.status === "activa" && (
                    <form action={pairFromHogarAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <SubmitButton variant="secondary" pendingText="…">Armar una caja de pareja</SubmitButton>
                    </form>
                  )}
                  <form action={revokeShareAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <SubmitButton variant="danger" pendingText="…">Dejar de compartir</SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form action={shareAction} className="grid gap-2 rounded-md border border-line bg-surface p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <label className="text-[13px] text-muted">
            Mail de la persona
            <input name="email" type="email" required className={field} />
          </label>
          <label className="text-[13px] text-muted">
            Puede
            <select name="permission" className={field}>
              <option value="ver">Solo ver</option>
              <option value="cargar">Ver y cargar</option>
            </select>
          </label>
          <SubmitButton pendingText="Enviando…">Invitar</SubmitButton>
        </form>
      </section>
    </div>
  );
}
