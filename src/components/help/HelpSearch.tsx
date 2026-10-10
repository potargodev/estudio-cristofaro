"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export interface HelpSearchItem {
  url: string;
  titulo: string;
  resumen: string;
  categoria: string;
  /** Texto normalizado (sin tildes, en minúsculas) para buscar */
  haystack: string;
  title: string;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Buscador del centro de ayuda: filtra en el navegador sobre el índice que manda el servidor */
export function HelpSearch({ items, initial = "" }: { items: HelpSearchItem[]; initial?: string }) {
  const [q, setQ] = useState(initial);
  const results = useMemo(() => {
    const words = norm(q)
      .split(/[^a-z0-9ñ]+/)
      .filter((w) => w.length > 2);
    if (!words.length) return null;
    return items
      .map((it) => ({ it, s: words.reduce((s, w) => s + (it.title.includes(w) ? 5 : 0) + (it.haystack.includes(w) ? 1 : 0), 0) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.it);
  }, [q, items]);
  return (
    <div>
      <form role="search" action="/ayuda" onSubmit={(e) => e.preventDefault()} className="relative">
        <label htmlFor="ayuda-q" className="sr-only">
          Buscar en la ayuda
        </label>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id="ayuda-q"
          name="q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="¿Qué querés hacer? Ej.: invitar a un cliente, dividir un gasto"
          autoComplete="off"
          className="h-14 w-full rounded-lg border border-line bg-surface pl-12 pr-4 text-[16px] text-ink shadow-sm placeholder:text-muted focus:border-navy focus:outline-none"
        />
      </form>
      {results && (
        <div aria-live="polite" className="mt-3 rounded-lg border border-line bg-surface">
          {results.length === 0 ? (
            <p className="px-5 py-4 text-[14px] text-muted">No encontramos artículos con esas palabras. Probá con otras o preguntale al asistente.</p>
          ) : (
            <ul className="divide-y divide-line">
              {results.map((r) => (
                <li key={r.url}>
                  <Link href={r.url} className="block px-5 py-3.5 hover:bg-canvas">
                    <span className="block text-[12px] text-muted">{r.categoria}</span>
                    <span className="block text-[15px] font-medium text-ink">{r.titulo}</span>
                    <span className="block text-[13px] text-muted">{r.resumen}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
