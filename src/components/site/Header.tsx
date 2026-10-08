"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";

const nav = [
  { href: "/servicios", label: "Servicios" },
  { href: "/planes", label: "Planes" },
  { href: "/equipo", label: "Equipo" },
  { href: "/novedades", label: "Novedades" },
  { href: "/preguntas-frecuentes", label: "Preguntas frecuentes" },
  { href: "/contacto", label: "Contacto" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const reduce = useReducedMotion();

  useEffect(() => setOpen(false), [pathname]);

  // Al bajar, el header se achica y gana fondo
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = scrolled || open;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300 motion-reduce:transition-none",
        solid
          ? "border-line/80 bg-paper/90 shadow-[0_8px_24px_-20px_rgba(28,34,53,0.5)] backdrop-blur"
          : "border-transparent bg-paper",
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 transition-[height] duration-300 ease-out motion-reduce:transition-none sm:px-6",
          scrolled ? "h-14" : "h-16 sm:h-[72px]",
        )}
      >
        <div className={cn("origin-left transition-transform duration-300 ease-out motion-reduce:transition-none", scrolled && "scale-[0.88]")}>
          <Logo />
        </div>
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Principal">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "link-underline text-[15px] transition-colors",
                  active ? "font-medium text-rose-deep" : "text-ink/80 hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <Button asChild size="lg" className="px-4 text-[15px]">
            <Link href="/diagnostico">Pedir diagnóstico gratis</Link>
          </Button>
        </nav>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm transition-colors hover:border-navy/40 lg:hidden"
          aria-expanded={open}
          aria-controls="menu-movil"
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden className="relative block h-3 w-4">
            <span
              className={cn(
                "absolute left-0 top-0 h-px w-4 bg-current transition-transform duration-300 motion-reduce:transition-none",
                open && "translate-y-1.5 rotate-45",
              )}
            />
            <span
              className={cn(
                "absolute bottom-0 left-0 h-px w-4 bg-current transition-transform duration-300 motion-reduce:transition-none",
                open && "-translate-y-1.5 -rotate-45",
              )}
            />
          </span>
          {open ? "Cerrar" : "Menú"}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <m.nav
            id="menu-movil"
            aria-label="Principal"
            className="overflow-hidden border-t border-line bg-paper lg:hidden"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="px-4 pb-6 pt-2">
              <ul className="divide-y divide-line/70">
                {nav.map((item, i) => (
                  <m.li
                    key={item.href}
                    initial={reduce ? false : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: 0.04 * i + 0.05 }}
                  >
                    <Link
                      href={item.href}
                      aria-current={pathname.startsWith(item.href) ? "page" : undefined}
                      className="block py-3 text-lg"
                    >
                      {item.label}
                    </Link>
                  </m.li>
                ))}
              </ul>
              <Button asChild size="xl" className="mt-4 w-full">
                <Link href="/diagnostico">Pedir diagnóstico gratis</Link>
              </Button>
            </div>
          </m.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
