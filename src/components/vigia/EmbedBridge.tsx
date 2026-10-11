"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const PANEL = "/vigia-panel";

/**
 * Dentro del panel del Vigía: los enlaces a otras pantallas (una organización,
 * una solicitud) se abren en la ventana de la app, no en el panel. Si alguien
 * abre /vigia-panel suelto, va a /vigia a pantalla completa.
 */
export function EmbedBridge() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (window.parent === window) window.location.replace(`/vigia?${search.toString()}`);
  }, [search]);

  useEffect(() => {
    const post = (msg: object) => window.parent.postMessage(msg, window.location.origin);
    if (!pathname.startsWith(PANEL)) {
      // Una acción redirigió fuera del panel: lo abre la app y el panel vuelve atrás
      post({ type: "faro:navigate", href: `${pathname}${search.size ? `?${search}` : ""}` });
      window.history.back();
      return;
    }
    post({ type: "faro:tab", tab: search.get("tab") });
  }, [pathname, search]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith(PANEL) || url.pathname.startsWith("/api/")) return;
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({ type: "faro:navigate", href: `${url.pathname}${url.search}${url.hash}` }, window.location.origin);
    };
    document.addEventListener("click", h, true);
    return () => document.removeEventListener("click", h, true);
  }, []);
  return null;
}
