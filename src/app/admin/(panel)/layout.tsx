import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { SubmitButton } from "@/components/admin/ui";
import { Monogram } from "@/components/site/Logo";
import { requireStaff } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { signOut } from "../actions";

export const metadata: Metadata = {
  title: { default: "Backoffice", template: "%s · Backoffice" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <h1 className="text-2xl font-semibold">Falta conectar Supabase</h1>
        <p className="mt-3 leading-relaxed text-muted">
          Completá <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> y{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> en el archivo <code>.env.local</code> y reiniciá el servidor. Los pasos están en el
          README.
        </p>
      </div>
    );
  }

  const { profile, user } = await requireStaff();

  return (
    <div className="min-h-dvh bg-paper md:grid md:grid-cols-[220px_1fr]">
      <aside className="bg-navy-deep px-3 py-3 text-paper md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:px-4 md:py-6">
        <div className="mb-3 flex items-center justify-between md:mb-8 md:block">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-full border border-rose-light/60 text-rose-light">
              <Monogram className="size-6" />
            </span>
            <span className="font-display text-xl">Cristofaro</span>
          </Link>
          <Link href="/" className="text-sm text-paper/70 hover:text-paper md:mt-3 md:block">
            Ver sitio
          </Link>
        </div>
        <AdminNav />
        <div className="mt-auto hidden border-t border-paper/15 pt-4 text-sm md:block">
          <p className="truncate font-medium">{profile.full_name ?? user.email}</p>
          <p className="text-paper/60 capitalize">{profile.role}</p>
          <form action={signOut} className="mt-3 [&_button]:w-full [&_button]:border-paper/30 [&_button]:bg-transparent [&_button]:text-paper">
            <SubmitButton variant="secondary" pendingText="Saliendo…">
              Cerrar sesión
            </SubmitButton>
          </form>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
