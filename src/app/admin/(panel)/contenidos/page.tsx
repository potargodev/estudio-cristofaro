import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { ArrowRight, HelpCircle, Layers, Newspaper } from "lucide-react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminField";
import { getDb } from "@/db";
import { faqs, posts, service_plans } from "@/db/schema";
import { requireOperator } from "@/lib/auth";

export const metadata: Metadata = { title: "Contenidos" };

export default async function ContenidosPage() {
  const { studioId } = await requireOperator();
  const db = getDb();
  const [[postCount], [faqCount], [planCount]] = await Promise.all([
    db.select({ count: count() }).from(posts).where(eq(posts.studio_id, studioId)),
    db.select({ count: count() }).from(faqs).where(eq(faqs.studio_id, studioId)),
    db.select({ count: count() }).from(service_plans).where(eq(service_plans.studio_id, studioId)),
  ]);

  const sections = [
    { icon: Newspaper, href: "/admin/contenidos/novedades", title: "Novedades", text: "Artículos cortos sobre vencimientos y cambios de ARCA.", count: postCount?.count },
    { icon: Layers, href: "/admin/contenidos/planes", title: "Planes", text: "Precio que publica la web para cada plan.", count: planCount?.count },
    { icon: HelpCircle, href: "/admin/contenidos/preguntas", title: "Preguntas frecuentes", text: "Las respuestas que aparecen en la web.", count: faqCount?.count },
  ];

  return (
    <>
      <AdminPageHeader title="Contenidos de la web" description="Lo que cambies acá se publica en el sitio en pocos segundos." />
      <div className="grid gap-4 md:grid-cols-3">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="group flex flex-col border border-line bg-surface p-5 transition-colors hover:border-muted">
            <span className="flex items-start justify-between">
              <span className="grid size-10 place-items-center border border-line text-ink">
                <s.icon className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="tabular font-display text-[40px] leading-none text-ink">{s.count ?? 0}</span>
            </span>
            <h2 className="mt-4 text-[16px] font-medium text-ink">{s.title}</h2>
            <p className="mt-1 text-[14px] text-muted">{s.text}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-[13px] text-ink">
              Administrar <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
