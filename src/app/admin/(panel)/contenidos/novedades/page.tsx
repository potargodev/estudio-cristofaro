import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminField";
import { requireStaff } from "@/lib/auth";
import type { Post } from "@/lib/types";

export const metadata: Metadata = { title: "Novedades" };

export default async function NovedadesAdminPage() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.from("posts").select("id, title, slug, published, published_at, updated_at").order("updated_at", { ascending: false });
  const posts = (data ?? []) as (Pick<Post, "id" | "title" | "slug" | "published" | "published_at"> & { updated_at: string })[];

  return (
    <>
      <Link href="/admin/contenidos" className="text-sm text-green underline-offset-4 hover:underline">
        Contenidos
      </Link>
      <div className="mt-2">
        <AdminPageHeader title="Novedades">
          <Link href="/admin/contenidos/novedades/nueva" className="rounded-md bg-green px-4 py-2 text-[15px] font-medium text-paper hover:bg-green-deep">
            Nueva novedad
          </Link>
        </AdminPageHeader>
      </div>
      <ul className="divide-y divide-line rounded-md border border-line bg-surface">
        {posts.map((p) => (
          <li key={p.id}>
            <Link href={`/admin/contenidos/novedades/${p.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-paper">
              <span className="font-medium">{p.title}</span>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${p.published ? "bg-green-soft text-green-deep" : "bg-line/60 text-muted"}`}>
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
