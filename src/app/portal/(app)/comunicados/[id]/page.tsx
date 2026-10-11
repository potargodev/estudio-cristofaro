import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ackAnnouncementAction } from "@/app/sueldos-actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { Card, PageTitle } from "@/components/portal/ui";
import { requireEmployee } from "@/lib/auth";
import { openAnnouncement } from "@/modules/payroll/server";

export const metadata: Metadata = { title: "Comunicado" };

/** Un comunicado de la empresa: al abrirlo queda leído; si lo piden, se confirma la lectura */
export default async function Comunicado({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await requireEmployee();
  const row = await openAnnouncement(me.employee.id, id);
  if (!row) notFound();
  const { a, r } = row;
  return (
    <>
      <Link href="/portal/empleado" className="text-[13px] text-muted hover:text-ink">
        ← Inicio
      </Link>
      <PageTitle title={a.title} intro={`${a.created_at.toLocaleDateString("es-AR")}${a.from_studio ? " · enviado por el estudio en nombre de la empresa" : ""}`} />
      <Feedback sp={sp} />
      <Card>
        <p className="whitespace-pre-line text-[15px] leading-relaxed">{a.body}</p>
        {a.attachments.length > 0 && (
          <ul className="mt-4 grid gap-1 text-[14px]">
            {a.attachments.map((x, i) => (
              <li key={x.path}>
                <a href={`/api/comunicados/${a.id}/adjunto/${i}`} className="underline">
                  {x.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {a.require_ack &&
        (r.ack_at ? (
          <p className="mt-4 text-[14px] text-muted">Confirmaste la lectura el {r.ack_at.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}.</p>
        ) : (
          <form action={ackAnnouncementAction} className="mt-4">
            <input type="hidden" name="id" value={a.id} />
            <SubmitButton pendingText="…">Leí y entendí</SubmitButton>
          </form>
        ))}
    </>
  );
}
