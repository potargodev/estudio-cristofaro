import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { SubmitButton } from "@/components/admin/ui";
import { RouteReveal } from "@/components/app/RouteReveal";
import { Monogram } from "@/components/site/Logo";
import { Toaster } from "@/components/ui/sonner";
import { requireStaff } from "@/lib/auth";
import { isDbConfigured } from "@/db";
import { signOut } from "../actions";

export const metadata: Metadata = {
  title: { default: "Backoffice", template: "%s · Backoffice" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!isDbConfigured) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <h1 className="text-2xl font-semibold">Falta conectar la base de datos</h1>
        <p className="mt-3 leading-relaxed text-muted">
          Completá <code>DATABASE_URL</code> y <code>BETTER_AUTH_SECRET</code> en el archivo <code>.env.local</code> (o en las
          variables de entorno de Easypanel) y reiniciá el servidor. Los pasos están en el README.
        </p>
      </div>
    );
  }

  const user = await requireStaff();

  return (
    <div className="min-h-dvh bg-paper md:grid md:grid-cols-[220px_1fr]">
      <aside className="bg-night px-3 py-3 text-paper md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-r md:border-paper/10 md:px-4 md:py-7">
        <div className="mb-3 flex items-center justify-between md:mb-8 md:block">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center border border-rose-light/50 text-rose-light">
              <Monogram className="size-6" />
            </span>
            <span className="font-display text-lg leading-tight">Estudio Cristofaro</span>
          </Link>
          <Link href="/" className="text-sm text-paper/70 hover:text-paper md:mt-3 md:block">
            Ver sitio
          </Link>
        </div>
        <AdminNav isAdmin={user.role === "admin"} />
        <div className="mt-auto hidden border-t border-paper/10 pt-4 text-sm md:block">
          <p className="truncate font-medium">{user.name || user.email}</p>
          <p className="text-paper/60 capitalize">{user.role}</p>
          <form action={signOut} className="mt-3 [&_button]:w-full [&_button]:border-paper/30 [&_button]:bg-transparent [&_button]:text-paper">
            <SubmitButton variant="secondary" pendingText="Saliendo…">
              Cerrar sesión
            </SubmitButton>
          </form>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-10 lg:px-12">
        <RouteReveal>{children}</RouteReveal>
      </main>
      <Toaster position="bottom-right" />
    </div>
  );
}
