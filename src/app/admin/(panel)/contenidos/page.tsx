import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminField";
import { getDb } from "@/db";
import { faqs, posts, service_plans } from "@/db/schema";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Contenidos" };

export default async function ContenidosPage() {
  const { studioId } = await requireStaff();
  const db = getDb();
  const [[postCount], [faqCount], [planCount]] = await Promise.all([
    db.select({ count: count() }).from(posts).where(eq(posts.studio_id, studioId)),
    db.select({ count: count() }).from(faqs).where(eq(faqs.studio_id, studioId)),
    db.select({ count: count() }).from(service_plans).where(eq(service_plans.studio_id, studioId)),
  ]);

  const sections = [
    { href: "/admin/contenidos/novedades", title: "Novedades", text: "Artículos cortos sobre vencimientos y cambios de ARCA.", count: postCount?.count },
    { href: "/admin/contenidos/planes", title: "Planes", text: "Precio que publica la web para cada plan.", count: planCount?.count },
    { href: "/admin/contenidos/preguntas", title: "Preguntas frecuentes", text: "Las respuestas que aparecen en la web.", count: faqCount?.count },
  ];

  return (
    <>
      <AdminPageHeader title="Contenidos de la web" />
      <p className="mb-6 max-w-2xl text-muted">Lo que cambies acá se publica en el sitio en pocos segundos.</p>
      <div className="grid gap-4 md:grid-cols-3">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="card-hover rounded-md border border-line bg-surface p-5 hover:border-navy/50">
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
