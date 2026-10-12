"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Mientras la tarea trabaja, la pantalla se actualiza sola cada 2 segundos */
export function LiveRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => router.refresh(), 2000);
    return () => window.clearInterval(t);
  }, [active, router]);
  return null;
}
