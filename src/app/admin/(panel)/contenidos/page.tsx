import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminField";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Contenidos" };

export default async function ContenidosPage() {
  const { supabase } = await requireStaff();
  const [posts, faqs, plans] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }),
    supabase.from("faqs").select("id", { count: "exact", head: true }),
    supabase.from("plans").select("id", { count: "exact", head: true }),
  ]);

  const sections = [
    { href: "/admin/contenidos/novedades", title: "Novedades", text: "Artículos cortos sobre vencimientos y cambios de ARCA.", count: posts.count },
    { href: "/admin/contenidos/planes", title: "Planes", text: "Abonos, precios de referencia y qué incluye cada uno.", count: plans.count },
    { href: "/admin/contenidos/preguntas", title: "Preguntas frecuentes", text: "Las respuestas que aparecen en la web.", count: faqs.count },
  ];

  return (
    <>
      <AdminPageHeader title="Contenidos de la web" />
      <p className="mb-6 max-w-2xl text-muted">Lo que cambies acá se publica en el sitio en pocos segundos.</p>
      <div className="grid gap-4 md:grid-cols-3">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="rounded-md border border-line bg-surface p-5 hover:border-navy">
            <h2 className="flex items-baseline justify-between text-lg font-semibold">
              {s.title}
              <span className="text-sm font-normal text-muted">{s.count ?? 0}</span>
            </h2>
            <p className="mt-1.5 text-[15px] text-muted">{s.text}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
