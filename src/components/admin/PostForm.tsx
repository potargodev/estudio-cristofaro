import { deletePost, savePost } from "@/app/admin/actions";
import type { Post } from "@/lib/types";
import { AdminField } from "./AdminField";
import { SubmitButton, FormCheckbox } from "./ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function PostForm({ post }: { post?: Pick<Post, "id" | "title" | "slug" | "excerpt" | "body" | "published"> }) {
  return (
    <>
      <form action={savePost} className="grid gap-4 border border-line bg-surface p-6">
        {post && <input type="hidden" name="id" value={post.id} />}
        <AdminField label="Título" htmlFor="title">
          <Input id="title" name="title" required defaultValue={post?.title} />
        </AdminField>
        <AdminField label="URL" htmlFor="slug" hint="Se genera sola a partir del título si la dejás vacía.">
          <Input id="slug" name="slug" defaultValue={post?.slug} placeholder="recategorizacion-monotributo" />
        </AdminField>
        <AdminField label="Resumen" htmlFor="excerpt" hint="Una o dos oraciones. Aparece en el listado y en Google.">
          <Textarea id="excerpt" name="excerpt" rows={2} defaultValue={post?.excerpt ?? ""} />
        </AdminField>
        <AdminField label="Texto" htmlFor="body" hint="Separá los párrafos con una línea en blanco.">
          <Textarea id="body" name="body" rows={16} defaultValue={post?.body ?? ""} className="leading-relaxed" />
        </AdminField>
        <FormCheckbox id="published" name="published" label="Publicada en la web" defaultChecked={post?.published ?? false} />
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
