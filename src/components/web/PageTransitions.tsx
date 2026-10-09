"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type Doc = Document & { startViewTransition?: (cb: () => Promise<void>) => { finished: Promise<void> } };

/**
 * Transiciones entre páginas con la View Transitions API: la página actual se
 * va hacia arriba, una cortina azul noche barre la pantalla y la nueva entra
 * con máscara (CSS en globals.css). Sin soporte o con reduced-motion, la
 * navegación es la normal de Next.
 */
export function PageTransitions() {
  const router = useRouter();
  const pathname = usePathname();
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    // La página nueva ya se pintó: termina la transición
    if (pending.current) {
      const done = pending.current;
      pending.current = null;
      requestAnimationFrame(() => done());
    }
  }, [pathname]);

  useEffect(() => {
    const doc = document as Doc;
    if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.dataset.noTransition !== undefined) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (/^\/(admin|portal|api|invitacion)(\/|$)/.test(url.pathname)) return;
      if (url.pathname === location.pathname) return; // anclas en la misma página
      e.preventDefault();
      doc.startViewTransition!(
        () =>
          new Promise<void>((resolve) => {
            pending.current = resolve;
            setTimeout(resolve, 1500); // resguardo
            router.push(url.pathname + url.search + url.hash);
          }),
      );
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [router]);
  return null;
}
