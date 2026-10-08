import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader, Notice } from "@/components/admin/AdminField";
import { PostForm } from "@/components/admin/PostForm";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "Editar novedad" };

export default async function EditarNovedadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardado?: string; error?: string }>;
}) {
  const { id } = await params;
  const { guardado, error } = await searchParams;
  const { studioId } = await requireStaff();
  if (!isUuid(id)) notFound();
  const [post] = await getDb()
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.studio_id, studioId)));
  if (!post) notFound();

  return (
    <div className="max-w-3xl">
      <Link href="/admin/contenidos/novedades" className="text-sm text-rose-deep underline-offset-4 hover:underline">
        Novedades
      </Link>
      <div className="mt-2">
        <AdminPageHeader title="Editar novedad">
          {post.published && (
            <Link href={`/novedades/${post.slug}`} target="_blank" className="rounded-md border border-line bg-surface px-4 py-2 text-[15px] hover:border-navy">
              Ver en la web
            </Link>
          )}
        </AdminPageHeader>
      </div>
      {guardado && (
        <div className="mb-4">
          <Notice>Cambios guardados.</Notice>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error === "titulo" ? "El título es obligatorio." : "Ya existe una novedad con esa URL. Cambiala."}</Notice>
        </div>
      )}
      <PostForm post={post} />
    </div>
  );
}
