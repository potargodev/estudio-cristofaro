import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminField";
import { getDb } from "@/db";
import { posts as postsTable } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { adminButton } from "@/components/admin/styles";
import { EmptyState } from "@/components/admin/kit/Panel";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { Newspaper } from "lucide-react";

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
      <AdminPageHeader title="Novedades" description="Artículos cortos sobre vencimientos y cambios de ARCA que se publican en la web.">
        <Link href="/admin/contenidos/novedades/nueva" className={adminButton.primary}>
          Nueva novedad
        </Link>
      </AdminPageHeader>
      <ul className="divide-y divide-line border border-line bg-surface">
        {posts.map((p) => (
          <li key={p.id}>
            <Link href={`/admin/contenidos/novedades/${p.id}`} className="flex min-h-[52px] items-center justify-between gap-4 px-4 py-3 hover:bg-paper">
              <span className="min-w-0 truncate text-[14px] font-medium text-ink">{p.title}</span>
              <StatusBadge status={p.published ? "activa" : "pausada"} label={p.published ? "Publicada" : "Borrador"} />
            </Link>
          </li>
        ))}
        {posts.length === 0 && (
          <li>
            <EmptyState icon={Newspaper} title="Todavía no hay novedades" text="Escribí la primera: aparece en la web apenas la publiques." action={{ href: "/admin/contenidos/novedades/nueva", label: "Nueva novedad" }} />
          </li>
        )}
      </ul>
    </>
  );
}
