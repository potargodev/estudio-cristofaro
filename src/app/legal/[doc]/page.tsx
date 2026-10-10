import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/admin/ui";
import { HelpMarkdown } from "@/components/help/HelpMarkdown";
import { getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { DRAFT_NOTICE, isLegalKey, LEGAL_DOCS, legalDoc } from "@/modules/legal/catalog";
import { acceptanceOf } from "@/modules/legal/server";
import { acceptLegalAction } from "../actions";

type Params = Promise<{ doc: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const d = legalDoc((await params).doc);
  return d ? { title: `${d.titulo} · Faro` } : { title: "Documento no encontrado" };
}

const day = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Texto legal versionado: muestra la versión, la fecha y si el usuario ya la aceptó */
export default async function LegalPage({ params }: { params: Params }) {
  const key = (await params).doc;
  if (!isLegalKey(key)) notFound();
  const d = legalDoc(key)!;
  const user = await getCurrentUser().catch(() => null);
  const accepted = user ? await acceptanceOf(user.id, key) : null;
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
      <article className="min-w-0">
        <p role="note" className="inline-block rounded-md border border-[#e3cf9f] bg-[#fbf5e6] px-3 py-1.5 text-[13px] font-medium text-[#7a5410]">
          {DRAFT_NOTICE} · {day.format(new Date(`${d.fecha}T12:00:00Z`))}
        </p>
        <h1 className="mt-4 font-display text-[34px] leading-tight sm:text-[46px]">{d.titulo}</h1>
        <p className="mt-2 text-[14px] text-muted">Versión {d.version}</p>
        <div className="mt-6 border-t border-line pt-2">
          <HelpMarkdown text={d.body} />
        </div>
        {user && !user.assisted && (
          <div className="mt-10 rounded-lg border border-line bg-surface p-5 text-[15px]">
            {accepted ? (
              <p>Aceptaste esta versión el {day.format(accepted.accepted_at)}.</p>
            ) : (
              <form action={acceptLegalAction} className="flex flex-wrap items-center justify-between gap-3">
                <input type="hidden" name="doc" value={key} />
                <input type="hidden" name="back" value={`/legal/${key}`} />
                <p>Todavía no aceptaste esta versión.</p>
                <SubmitButton pendingText="…">Aceptar esta versión</SubmitButton>
              </form>
            )}
          </div>
        )}
      </article>
      <aside className="lg:pt-16">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">Textos legales</h2>
        <ul className="mt-3 grid gap-1.5 text-[14px]">
          {LEGAL_DOCS.map((x) => (
            <li key={x.key}>
              <Link href={`/legal/${x.key}`} aria-current={x.key === key ? "page" : undefined} className={cn("hover:underline", x.key === key ? "font-semibold text-ink" : "text-muted")}>
                {x.titulo}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
