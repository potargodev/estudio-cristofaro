import { desc, isNotNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { getDb } from "@/db";
import { help_feedback } from "@/db/schema";
import { requireFaro } from "@/lib/auth";
import { ARTICLES, articleUrl, categoryName } from "@/modules/help/catalog";

export const metadata: Metadata = { title: "Opiniones de la ayuda" };

const fmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" });

/** "¿Te sirvió?" por artículo: qué ayuda falta mejorar. Sin datos de clientes: solo votos y comentarios */
export default async function AyudaOpiniones() {
  await requireFaro();
  const db = getDb();
  const [stats, comments] = await Promise.all([
    db
      .select({ article: help_feedback.article_id, si: sql<number>`count(*) filter (where ${help_feedback.helpful})::int`, no: sql<number>`count(*) filter (where not ${help_feedback.helpful})::int` })
      .from(help_feedback)
      .groupBy(help_feedback.article_id),
    db.select().from(help_feedback).where(isNotNull(help_feedback.comment)).orderBy(desc(help_feedback.created_at)).limit(50),
  ]);
  const by = new Map(stats.map((s) => [s.article, s]));
  const rows = ARTICLES.map((a) => ({ a, s: by.get(a.id) ?? { si: 0, no: 0 } })).sort((x, y) => y.s.no - x.s.no || y.s.si + y.s.no - (x.s.si + x.s.no));
  return (
    <>
      <PageHeader title="Opiniones de la ayuda" description={`${ARTICLES.length} artículos en docs/ayuda. Arriba, los que más «no me sirvió» tienen.`} />
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left text-[14px]">
          <thead className="border-b border-line text-[12px] text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Artículo</th>
              <th className="px-4 py-3 font-medium">Actualizado</th>
              <th className="px-4 py-3 text-right font-medium">Sí</th>
              <th className="px-4 py-3 text-right font-medium">No</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ a, s }) => (
              <tr key={a.id}>
                <td className="px-4 py-2.5">
                  <Link href={articleUrl(a)} className="font-medium hover:underline">
                    {a.titulo}
                  </Link>
                  <span className="block text-[12px] text-muted">{categoryName(a.categoria)}</span>
                </td>
                <td className="px-4 py-2.5 text-muted">{a.actualizado}</td>
                <td className="tabular-nums px-4 py-2.5 text-right">{s.si}</td>
                <td className="tabular-nums px-4 py-2.5 text-right">{s.no}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-8 text-[17px] font-semibold">Últimos comentarios</h2>
      {comments.length === 0 ? (
        <p className="mt-2 text-[14px] text-muted">Todavía no hay comentarios.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border border-line bg-surface px-4 py-3 text-[14px]">
              <p className="text-[12px] text-muted">
                {ARTICLES.find((a) => a.id === c.article_id)?.titulo ?? c.article_id} · {c.helpful ? "le sirvió" : "no le sirvió"} · {fmt.format(c.created_at)}
              </p>
              <p className="mt-1">{c.comment}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
