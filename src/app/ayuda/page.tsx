import { Building2, CalendarClock, Compass, FileText, Handshake, Inbox, NotebookPen, Plug, Ship, Sparkles, Wallet, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HelpSearch } from "@/components/help/HelpSearch";
import { cn } from "@/lib/utils";
import { ARTICLES, articleUrl, CATEGORIES, categoryName, PROFILE_LABELS, type HelpProfile } from "@/modules/help/catalog";

export const metadata: Metadata = { title: "Centro de ayuda" };

const ICONS: Record<string, LucideIcon> = { Building2, CalendarClock, Compass, FileText, Handshake, Inbox, NotebookPen, Plug, Ship, Sparkles, Wallet };
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export default async function AyudaPage({ searchParams }: { searchParams: Promise<{ perfil?: string; q?: string }> }) {
  const sp = await searchParams;
  const perfil = sp.perfil && sp.perfil in PROFILE_LABELS ? (sp.perfil as HelpProfile) : null;
  const pool = perfil ? ARTICLES.filter((a) => a.perfiles.includes(perfil)) : ARTICLES;
  const items = pool.map((a) => ({ url: articleUrl(a), titulo: a.titulo, resumen: a.resumen, categoria: categoryName(a.categoria), title: norm(a.titulo), haystack: norm(`${a.titulo} ${a.resumen} ${a.text}`) }));
  return (
    <>
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-rose-deep">Centro de ayuda</p>
      <h1 className="mt-2 font-display text-[40px] leading-tight sm:text-[56px]">¿En qué te ayudamos?</h1>
      <p className="mt-2 max-w-2xl text-[16px] text-muted">Guías cortas para cada pantalla de Faro. Si no encontrás lo que buscás, preguntale al asistente: responde citando estos artículos.</p>
      <div className="mt-8">
        <HelpSearch items={items} initial={sp.q ?? ""} />
      </div>

      <nav aria-label="Filtrar por perfil" className="mt-8 flex flex-wrap gap-2">
        {[null, ...(Object.keys(PROFILE_LABELS) as HelpProfile[])].map((p) => (
          <Link
            key={p ?? "todos"}
            href={p ? `/ayuda?perfil=${p}` : "/ayuda"}
            aria-current={p === perfil ? "page" : undefined}
            className={cn("rounded-md border px-3 py-1.5 text-[14px]", p === perfil ? "border-navy bg-navy text-paper" : "border-line bg-surface text-ink hover:border-muted")}
          >
            {p ? PROFILE_LABELS[p] : "Todos"}
          </Link>
        ))}
      </nav>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c) => {
          const list = pool.filter((a) => a.categoria === c.key);
          if (!list.length) return null;
          const Icon = ICONS[c.icon] ?? Compass;
          return (
            <section key={c.key} aria-labelledby={`cat-${c.key}`} className="rounded-lg border border-line bg-surface p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-navy text-gold">
                  <Icon className="size-5" strokeWidth={1.5} aria-hidden />
                </span>
                <div>
                  <h2 id={`cat-${c.key}`} className="text-[17px] font-semibold">
                    {c.name}
                  </h2>
                  <p className="text-[13px] text-muted">{c.text}</p>
                </div>
              </div>
              <ul className="mt-4 grid gap-1.5 text-[14px]">
                {list.map((a) => (
                  <li key={a.id}>
                    <Link href={articleUrl(a)} className="text-ink underline-offset-4 hover:underline">
                      {a.titulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {pool.length === 0 && <p className="mt-8 text-muted">Todavía no hay artículos para este perfil.</p>}
    </>
  );
}
