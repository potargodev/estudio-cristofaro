"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Principal">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-[15px] transition-colors ${active ? "text-rose-deep font-medium" : "text-ink/80 hover:text-ink"}`}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/diagnostico"
            className="rounded-md bg-navy px-4 py-2 text-[15px] font-medium text-paper hover:bg-navy-deep"
          >
            Pedir diagnóstico gratis
          </Link>
        </nav>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm lg:hidden"
          aria-expanded={open}
          aria-controls="menu-movil"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Cerrar" : "Menú"}
        </button>
      </div>
      {open && (
        <nav id="menu-movil" className="border-t border-line bg-paper px-4 pb-6 pt-2 lg:hidden" aria-label="Principal">
          <ul className="divide-y divide-line/70">
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block py-3 text-lg">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/diagnostico"
            className="mt-4 block rounded-md bg-navy px-4 py-3 text-center font-medium text-paper"
          >
            Pedir diagnóstico gratis
          </Link>
        </nav>
      )}
    </header>
  );
}
