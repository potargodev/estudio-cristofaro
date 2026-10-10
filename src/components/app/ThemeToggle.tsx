"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

import { THEME_KEY } from "./theme";

// Botón de modo claro / oscuro de la app (la elección queda en el navegador).

export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === "dark"), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {}
  };
  const label = dark ? "Pasar a modo claro" : "Pasar a modo oscuro";
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className={cn("inline-flex h-9 items-center justify-center gap-2 px-2.5 text-[13px]", className)}>
      {dark ? <Sun className="size-[18px]" strokeWidth={1.6} aria-hidden /> : <Moon className="size-[18px]" strokeWidth={1.6} aria-hidden />}
      {withLabel && <span>{dark ? "Modo claro" : "Modo oscuro"}</span>}
    </button>
  );
}
