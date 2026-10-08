import { deletePost, savePost } from "@/app/admin/actions";
import type { Post } from "@/lib/types";
import { AdminField } from "./AdminField";
import { SubmitButton, adminInput } from "./ui";

export function PostForm({ post }: { post?: Pick<Post, "id" | "title" | "slug" | "excerpt" | "body" | "published"> }) {
  return (
    <>
      <form action={savePost} className="grid gap-4 rounded-md border border-line bg-surface p-6">
        {post && <input type="hidden" name="id" value={post.id} />}
        <AdminField label="Título" htmlFor="title">
          <input id="title" name="title" required defaultValue={post?.title} className={adminInput} />
        </AdminField>
        <AdminField label="URL" htmlFor="slug" hint="Se genera sola a partir del título si la dejás vacía.">
          <input id="slug" name="slug" defaultValue={post?.slug} placeholder="recategorizacion-monotributo" className={adminInput} />
        </AdminField>
        <AdminField label="Resumen" htmlFor="excerpt" hint="Una o dos oraciones. Aparece en el listado y en Google.">
          <textarea id="excerpt" name="excerpt" rows={2} defaultValue={post?.excerpt ?? ""} className={adminInput} />
        </AdminField>
        <AdminField label="Texto" htmlFor="body" hint="Separá los párrafos con una línea en blanco.">
          <textarea id="body" name="body" rows={16} defaultValue={post?.body ?? ""} className={`${adminInput} leading-relaxed`} />
        </AdminField>
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="published" defaultChecked={post?.published ?? false} className="size-4 accent-[var(--color-navy)]" />
          Publicada en la web
        </label>
        <div>
          <SubmitButton>{post ? "Guardar cambios" : "Crear novedad"}</SubmitButton>
        </div>
      </form>
      {post && (
        <form action={deletePost} className="mt-8 border-t border-line pt-6">
          <input type="hidden" name="id" value={post.id} />
          <SubmitButton variant="danger" pendingText="Eliminando…" confirm="¿Eliminar esta novedad?">
            Eliminar novedad
          </SubmitButton>
        </form>
      )}
    </>
  );
}
