import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminField";
import { getDb } from "@/db";
import { posts as postsTable } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { adminButton } from "@/components/admin/styles";

export const metadata: Metadata = { title: "Novedades" };

export default async function NovedadesAdminPage() {
  const { studioId } = await requireStaff();
  const posts = await getDb()
    .select({ id: postsTable.id, title: postsTable.title, slug: postsTable.slug, published: postsTable.published })
    .from(postsTable)
    .where(eq(postsTable.studio_id, studioId))
    .orderBy(desc(postsTable.updated_at));

  return (
    <>
      <Link href="/admin/contenidos" className="text-sm text-rose-deep underline-offset-4 hover:underline">
        Contenidos
      </Link>
      <div className="mt-2">
        <AdminPageHeader title="Novedades">
          <Link href="/admin/contenidos/novedades/nueva" className={adminButton.primary}>
            Nueva novedad
          </Link>
        </AdminPageHeader>
      </div>
      <ul className="divide-y divide-line rounded-md border border-line bg-surface">
        {posts.map((p) => (
          <li key={p.id}>
            <Link href={`/admin/contenidos/novedades/${p.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-paper">
              <span className="font-medium">{p.title}</span>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${p.published ? "bg-navy-soft text-navy-deep" : "bg-line/60 text-muted"}`}>
                {p.published ? "Publicada" : "Borrador"}
              </span>
            </Link>
          </li>
        ))}
        {posts.length === 0 && <li className="px-4 py-8 text-center text-muted">Todavía no hay novedades. Escribí la primera.</li>}
      </ul>
    </>
  );
}
