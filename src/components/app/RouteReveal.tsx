"use client";

import { usePathname } from "next/navigation";

/** Al cambiar de sección, el contenido entra con la máscara corta de .tab-in */
export function RouteReveal({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="tab-in">
      {children}
    </div>
  );
}
