"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Logo } from "@/components/site/Logo";
import { AUDIENCES } from "@/lib/audiences";
import { PLATFORM_TABS } from "@/lib/platform";
import { SCHEDULE_HREF } from "@/lib/site";
import { cn } from "@/lib/utils";
import { PlatformMini } from "./PlatformMini";

type MenuKey = "plataforma" | "para-quien" | "recursos" | null;

const RESOURCES = [
  { href: "/novedades", label: "Novedades de ARCA", text: "Cambios impositivos explicados en criollo." },
  { href: "/recursos/calendario", label: "Calendario de vencimientos", text: "Cómo leer tus fechas y dónde ver las oficiales." },
  { href: "/preguntas-frecuentes", label: "Preguntas frecuentes", text: "Lo que más nos consultan antes de empezar." },
  { href: "/equipo", label: "Equipo", text: "Quiénes llevan tus números." },
];

/**
 * Header de la web: transparente sobre el hero; al bajar gana fondo con blur,
 * hairline inferior y se achica. Mega menú de Plataforma con previews,
 * desplegables de Para quién y Recursos, y overlay a pantalla completa en el
 * celular. Todo operable con teclado (Escape cierra).
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState<MenuKey>(null);
  const [mobile, setMobile] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);
  const closeTimer = useRef<number | undefined>(undefined);
  const panelId = useId();

  useEffect(() => {
    setMenu(null);
    setMobile(false);
  }, [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setMobile(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    document.documentElement.style.overflow = mobile ? "hidden" : "";
  }, [mobile]);

  const open = (k: MenuKey) => {
    window.clearTimeout(closeTimer.current);
    setMenu(k);
  };
  const scheduleClose = () => {
    closeTimer.current = window.setTimeout(() => setMenu(null), 160);
  };
  const solid = scrolled || menu !== null;

  const trigger = (k: Exclude<MenuKey, null>, label: string) => (
    <button
      type="button"
      aria-expanded={menu === k}
      aria-controls={`${panelId}-${k}`}
      onClick={() => setMenu(menu === k ? null : k)}
      onPointerEnter={() => open(k)}
      onPointerLeave={scheduleClose}
      className={cn("u-draw py-1 text-[14px] transition-colors", menu === k ? "text-paper" : "text-paper/75 hover:text-paper")}
    >
      {label}
    </button>
  );
  const link = (href: string, label: string) => (
    <Link
      href={href}
      aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}
      className="u-draw py-1 text-[14px] text-paper/75 transition-colors hover:text-paper aria-[current=page]:text-paper"
    >
      {label}
    </Link>
  );

  return (
    <>
      <header
        data-intro="fade"
        className={cn(
          "fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-500",
          solid ? "border-hair bg-night/85 backdrop-blur-xl" : "border-transparent bg-transparent",
        )}
      >
        <div
          className={cn(
            "mx-auto flex max-w-[1360px] items-center justify-between gap-6 px-5 transition-[height] duration-500 sm:px-8 lg:px-12",
            scrolled ? "h-16" : "h-20",
          )}
        >
          <div className={cn("origin-left transition-transform duration-500", scrolled && "scale-[0.86]")}>
            <Logo inverted />
          </div>
          <nav aria-label="Principal" className="hidden items-center gap-8 lg:flex">
            {trigger("plataforma", "Plataforma")}
            {trigger("para-quien", "Para quién")}
            {link("/planes", "Planes")}
            {link("/servicios", "Cómo trabajamos")}
            {trigger("recursos", "Recursos")}
          </nav>
          <div className="hidden items-center gap-6 lg:flex">
            <Link href="/portal/login" className="u-draw py-1 text-[14px] text-paper/75 hover:text-paper">
              Ingresar
            </Link>
            <Link
              href={SCHEDULE_HREF}
              className="inline-flex h-10 items-center rounded-[2px] bg-rose-light px-4 text-[14px] font-medium text-night transition-colors hover:bg-paper"
            >
              Agendar una llamada
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setMobile(true)}
            aria-expanded={mobile}
            aria-controls={`${panelId}-mobile`}
            className="flex h-10 items-center gap-2 text-[14px] text-paper lg:hidden"
          >
            <span className="flex w-6 flex-col gap-1.5" aria-hidden>
              <span className="h-px bg-paper" />
              <span className="h-px w-4 bg-paper" />
            </span>
            Menú
          </button>
        </div>

        {/* Paneles de escritorio */}
        <div
          id={`${panelId}-plataforma`}
          hidden={menu !== "plataforma"}
          onPointerEnter={() => open("plataforma")}
          onPointerLeave={scheduleClose}
          className="hidden border-t border-hair bg-navy-deep lg:block"
        >
          <div className="mx-auto grid max-w-[1360px] grid-cols-12 gap-px px-12 py-8">
            <div className="col-span-3 pr-8">
              <p className="font-display text-3xl leading-none text-paper">La plataforma</p>
              <p className="mt-3 text-sm leading-relaxed text-paper/60">
                Tu empresa en una pantalla: lo resuelto, lo que hay que pagar y lo que viene.
              </p>
              <Link href="/#plataforma" className="u-draw mt-5 inline-block text-sm text-rose-light">
                Ver la demo
              </Link>
            </div>
            {PLATFORM_TABS.map((t) => (
              <Link key={t.key} href={`/#plataforma-${t.key}`} className="group col-span-2 border-l border-hair pl-5 pr-2">
                <PlatformMini tab={t.key} />
                <p className="mt-3 text-sm text-paper group-hover:text-rose-light">{t.label}</p>
                <p className="mt-1 text-[13px] leading-snug text-paper/55">{t.title}</p>
              </Link>
            ))}
            <div className="col-span-1" />
          </div>
        </div>
        <div
          id={`${panelId}-para-quien`}
          hidden={menu !== "para-quien"}
          onPointerEnter={() => open("para-quien")}
          onPointerLeave={scheduleClose}
          className="hidden border-t border-hair bg-navy-deep lg:block"
        >
          <ul className="mx-auto grid max-w-[1360px] grid-cols-4 px-12 py-8">
            {AUDIENCES.map((a, i) => (
              <li key={a.slug} className="border-l border-hair pl-5 pr-6">
                <Link href={`/${a.slug}`} className="group block">
                  <span className="tabular text-[13px] text-rose-light">0{i + 1}</span>
                  <span className="mt-2 block font-display text-2xl leading-tight text-paper group-hover:text-rose-light">{a.name}</span>
                  <span className="mt-2 block text-[13px] leading-snug text-paper/55">{a.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div
          id={`${panelId}-recursos`}
          hidden={menu !== "recursos"}
          onPointerEnter={() => open("recursos")}
          onPointerLeave={scheduleClose}
          className="hidden border-t border-hair bg-navy-deep lg:block"
        >
          <ul className="mx-auto grid max-w-[1360px] grid-cols-4 px-12 py-8">
            {RESOURCES.map((r) => (
              <li key={r.href} className="border-l border-hair pl-5 pr-6">
                <Link href={r.href} className="group block">
                  <span className="block text-paper group-hover:text-rose-light">{r.label}</span>
                  <span className="mt-1 block text-[13px] leading-snug text-paper/55">{r.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </header>
      {/* Overlay del celular: va al <body> (el header con blur o animación sería
        el contenedor de un "fixed" y lo dejaría del alto del header) */}
      {portalReady &&
        createPortal(
          <div className="site">
            <div
              id={`${panelId}-mobile`}
              role="dialog"
              aria-modal="true"
              aria-label="Menú"
              hidden={!mobile}
              className="fixed inset-0 z-50 overflow-y-auto bg-navy lg:hidden"
            >
              <div className="flex h-20 items-center justify-between px-5">
                <Logo inverted />
                <button type="button" onClick={() => setMobile(false)} className="h-10 text-[14px] text-paper" autoFocus>
                  Cerrar
                </button>
              </div>
              <nav aria-label="Principal" className="px-5 pb-10">
                <ul className="border-t border-hair">
                  {[
                    ["/#plataforma", "Plataforma"],
                    ["/#para-quien", "Para quién"],
                    ["/planes", "Planes"],
                    ["/servicios", "Cómo trabajamos"],
                    ["/novedades", "Recursos"],
                    ["/portal/login", "Ingresar"],
                  ].map(([href, label], i) => (
                    <li
                      key={href}
                      className="border-b border-hair"
                      style={{ animation: mobile ? `menu-in 700ms var(--ease-expo) ${80 + i * 60}ms both` : undefined }}
                    >
                      <Link
                        href={href}
                        onClick={() => setMobile(false)}
                        className="flex items-baseline justify-between py-4 font-display text-5xl leading-none text-paper"
                      >
                        {label}
                        <span className="tabular text-[13px] font-sans text-rose-light">0{i + 1}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  href={SCHEDULE_HREF}
                  onClick={() => setMobile(false)}
                  className="mt-8 flex h-14 items-center justify-center rounded-[2px] bg-rose-light text-[15px] font-medium text-night"
                >
                  Agendar una llamada
                </Link>
              </nav>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
