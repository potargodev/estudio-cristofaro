"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FaroLogo } from "@/components/admin/kit/FaroLogo";
import { CtaLink } from "@/components/web/ui";
import { cn } from "@/lib/utils";
import { FARO_NAV } from "./nav";



/** Header de la landing de Faro: transparente arriba, con fondo y blur al bajar; menú a pantalla completa en el celular */
export function FaroHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,height] duration-500", scrolled ? "border-b border-hair bg-night/85 backdrop-blur-md" : "border-b border-transparent")}>
      <div className={cn("mx-auto flex max-w-[1360px] items-center gap-6 px-5 transition-[height] duration-500 sm:px-8 lg:px-12", scrolled ? "h-16" : "h-20")}>
        <Link href="/faro" aria-label="Faro, inicio">
          <FaroLogo size="sm" />
        </Link>
        <nav aria-label="Faro" className="ml-6 hidden flex-1 items-center gap-6 text-[14px] text-paper/75 xl:flex">
          {FARO_NAV.map((n) => (
            <Link key={n.href} href={n.href} className="u-draw pb-0.5 hover:text-paper">
              {n.label}
            </Link>
          ))}
        </nav>
        <span className="flex-1 xl:hidden" />
        <Link href="/ingresar" className="u-draw hidden pb-0.5 text-[14px] text-paper/80 hover:text-paper sm:inline">
          Ingresar
        </Link>
        <CtaLink tone="gold" href="/faro/registro" className="hidden h-10 px-4 text-[14px] sm:inline-flex">
          Empezar gratis
        </CtaLink>
        <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menú" aria-expanded={open} className="grid size-10 place-items-center border border-hair-strong text-paper xl:hidden">
          <Menu className="size-5" aria-hidden />
        </button>
      </div>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Menú" className="fixed inset-0 z-50 flex flex-col bg-night px-5 pb-8 pt-5 sm:px-8">
          <div className="flex items-center justify-between">
            <FaroLogo size="sm" />
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar menú" className="grid size-10 place-items-center border border-hair-strong text-paper">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <nav aria-label="Faro" className="mt-10 flex flex-col">
            {FARO_NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="border-b border-hair py-4 font-display text-[32px] leading-none text-paper">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-wrap items-center gap-5">
            <CtaLink tone="gold" href="/faro/registro" magnetic={false}>
              Empezar gratis
            </CtaLink>
            <Link href="/ingresar" className="text-[15px] text-paper/80">
              Ingresar
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
