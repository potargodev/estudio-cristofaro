"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

import { applyTheme, readTheme, type ThemeChoice } from "./theme";

// Tema de la app (la elección queda en el navegador; sin elección, sigue al sistema).

/** Botón de un toque claro ↔ oscuro (pantallas sin menú de cuenta) */
export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === "dark"), []);
  const toggle = () => {
    setDark(!dark);
    applyTheme(dark ? "light" : "dark");
  };
  const label = dark ? "Pasar a modo claro" : "Pasar a modo oscuro";
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className={cn("inline-flex h-(--control-h) items-center justify-center px-2.5", className)}>
      {dark ? <Sun className="size-[18px]" strokeWidth={1.6} aria-hidden /> : <Moon className="size-[18px]" strokeWidth={1.6} aria-hidden />}
    </button>
  );
}

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

/** Selector Claro · Oscuro · Sistema (menú de la cuenta y Mi cuenta) */
export function ThemeSelect({ className }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice | null>(null);
  useEffect(() => setChoice(readTheme()), []);
  return (
    <div role="radiogroup" aria-label="Tema" className={cn("grid grid-cols-3 gap-1 rounded-md border border-line bg-canvas p-1", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const on = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              setChoice(value);
              applyTheme(value);
            }}
            className={cn("flex h-(--control-h-sm) items-center justify-center gap-1.5 rounded-md text-meta transition-colors", on ? "bg-surface font-medium text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink")}
          >
            <Icon className="size-4" strokeWidth={1.6} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
