import Link from "next/link";
import { FaroLogo } from "@/components/admin/kit/FaroLogo";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { getCurrentUser } from "@/lib/auth";
import { homeFor } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * Marco de las páginas públicas de la app (Centro de ayuda, Red de estudios,
 * textos legales): mismas superficies y tema que la app, se leen sin cuenta y
 * con sesión ofrecen volver al espacio propio.
 */
export async function PublicShell({ sub, home: homeHref, children, wide = false }: { sub: string; home: string; children: React.ReactNode; wide?: boolean }) {
  const user = await getCurrentUser().catch(() => null);
  const back = user ? homeFor(user.role) : null;
  const width = wide ? "max-w-6xl" : "max-w-5xl";
  return (
    <div className="app-ui min-h-dvh bg-canvas text-ink">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-paper focus:px-3 focus:py-2 focus:text-night">
        Saltar al contenido
      </a>
      <header className="keep-dark sticky top-0 z-30 bg-night text-paper">
        <div className={cn("mx-auto flex h-14 items-center gap-3 px-4 sm:px-6", width)}>
          <Link href={homeHref} aria-label={`Faro · ${sub}`}>
            <FaroLogo size="sm" sub={sub} />
          </Link>
          <span className="flex-1" />
          <ThemeToggle className="text-paper/75 hover:text-paper" />
          {back ? (
            <Link href={back} className="text-[13px] text-paper/80 underline-offset-4 hover:underline">
              Volver a mi espacio
            </Link>
          ) : (
            <>
              <Link href="/ingresar" className="hidden text-[13px] text-paper/80 underline-offset-4 hover:underline sm:inline">
                Ingresar
              </Link>
              <Link href="/faro/registro" className="rounded-md bg-gold px-3 py-1.5 text-[13px] font-medium text-night hover:bg-paper">
                Crear cuenta
              </Link>
            </>
          )}
        </div>
      </header>
      <main id="contenido" className={cn("mx-auto w-full px-4 pb-20 pt-8 sm:px-6 sm:pt-12", width)}>
        {children}
      </main>
      <footer className="border-t border-line">
        <div className={cn("mx-auto flex flex-wrap gap-x-5 gap-y-2 px-4 py-6 text-[13px] text-muted sm:px-6", width)}>
          <span>Faro</span>
          <Link href="/faro" className="hover:text-ink">
            Qué es Faro
          </Link>
          <Link href="/ayuda" className="hover:text-ink">
            Ayuda
          </Link>
          <Link href="/red" className="hover:text-ink">
            Red de estudios
          </Link>
          <Link href="/legal/terminos" className="hover:text-ink">
            Términos
          </Link>
          <Link href="/legal/privacidad" className="hover:text-ink">
            Privacidad
          </Link>
        </div>
      </footer>
    </div>
  );
}
