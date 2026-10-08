import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader, Notice } from "@/components/admin/AdminField";
import { PostForm } from "@/components/admin/PostForm";

export const metadata: Metadata = { title: "Nueva novedad" };

export default async function NuevaNovedadPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="max-w-3xl">
      <Link href="/admin/contenidos/novedades" className="text-sm text-green underline-offset-4 hover:underline">
        Novedades
      </Link>
      <div className="mt-2">
        <AdminPageHeader title="Nueva novedad" />
      </div>
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error === "titulo" ? "El título es obligatorio." : "Ya existe una novedad con esa URL. Cambiala."}</Notice>
        </div>
      )}
      <PostForm />
    </div>
  );
}
