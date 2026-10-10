"use client";

import { Check, Download, Monitor, Share, Smartphone, SquarePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type Platform = "android" | "ios" | "windows" | "mac";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const PLATFORMS: { key: Platform; label: string; icon: typeof Smartphone }[] = [
  { key: "android", label: "Android", icon: Smartphone },
  { key: "ios", label: "iPhone y iPad", icon: Smartphone },
  { key: "windows", label: "Windows", icon: Monitor },
  { key: "mac", label: "Mac", icon: Monitor },
];

/** Plataforma y navegador del visitante (solo en el cliente) */
function detect(): { platform: Platform | null; safari: boolean; firefox: boolean } {
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPadOS se presenta como Mac
  const platform: Platform | null = /iPhone|iPad|iPod/.test(ua) || touchMac ? "ios" : /Android/.test(ua) ? "android" : /Windows/.test(ua) ? "windows" : /Macintosh/.test(ua) ? "mac" : null;
  return { platform, safari: /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua), firefox: /firefox|fxios/i.test(ua) };
}

/** Escucha el aviso de instalación del navegador (Chrome y Edge en Android, Windows y Mac) */
export function useInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [env, setEnv] = useState<ReturnType<typeof detect>>({ platform: null, safari: false, firefox: false });
  useEffect(() => {
    setEnv(detect());
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const install = async () => {
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setPrompt(null);
    if (outcome === "accepted") setInstalled(true);
    return true;
  };
  return { ...env, canPrompt: !!prompt, install, installed };
}

/** Pasos para instalar a mano cuando el navegador no ofrece el botón */
function Steps({ platform, safari, firefox, current }: { platform: Platform; safari: boolean; firefox: boolean; current: boolean }) {
  const li = "flex gap-3";
  const n = (i: number) => <span className="tabular grid size-6 shrink-0 place-items-center border border-current/30 text-[12px]">{i}</span>;
  if (platform === "ios")
    return (
      <ol className="space-y-3 text-[15px]">
        <li className={li}>
          {n(1)}
          <span>
            Abrí esta página en <strong className="font-medium">Safari</strong>
            {current && !safari ? " (en iOS también funciona desde Chrome)" : ""}.
          </span>
        </li>
        <li className={li}>
          {n(2)}
          <span className="inline-flex flex-wrap items-center gap-1">
            Tocá <Share className="inline size-4" aria-label="Compartir" /> <strong className="font-medium">Compartir</strong>.
          </span>
        </li>
        <li className={li}>
          {n(3)}
          <span className="inline-flex flex-wrap items-center gap-1">
            Elegí <SquarePlus className="inline size-4" aria-hidden /> <strong className="font-medium">Agregar a inicio</strong> y confirmá.
          </span>
        </li>
      </ol>
    );
  if (platform === "mac" && safari)
    return (
      <ol className="space-y-3 text-[15px]">
        <li className={li}>
          {n(1)}
          <span>
            En Safari, abrí el menú <strong className="font-medium">Archivo</strong>.
          </span>
        </li>
        <li className={li}>
          {n(2)}
          <span>
            Elegí <strong className="font-medium">Agregar al Dock</strong> y confirmá.
          </span>
        </li>
      </ol>
    );
  return (
    <ol className="space-y-3 text-[15px]">
      <li className={li}>
        {n(1)}
        <span>
          Abrí esta página en <strong className="font-medium">Chrome</strong> o <strong className="font-medium">Edge</strong>
          {current && firefox ? " (Firefox no instala apps web)" : ""}.
        </span>
      </li>
      <li className={li}>
        {n(2)}
        <span>
          {platform === "android" ? (
            <>
              Tocá el menú <strong className="font-medium">⋮</strong> y elegí <strong className="font-medium">Instalar app</strong>.
            </>
          ) : (
            <>
              Hacé clic en el ícono <Download className="inline size-4" aria-hidden /> de la barra de direcciones o en <strong className="font-medium">Instalar Estudio Cristofaro</strong>.
            </>
          )}
        </span>
      </li>
    </ol>
  );
}

/**
 * Selector de plataforma + botón de instalación. Preselecciona el dispositivo
 * del visitante; si el navegador lo permite (Chrome/Edge), el botón instala
 * directo, y si no, muestra los pasos (Safari en iPhone y Mac).
 */
export function InstallPanel({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  const { platform: detected, safari, firefox, canPrompt, install, installed } = useInstall();
  const [chosen, setChosen] = useState<Platform | null>(null);
  const platform = chosen ?? detected ?? "android";
  const current = platform === detected;
  const dark = tone === "dark";
  const P = PLATFORMS.find((p) => p.key === platform)!;

  return (
    <div className={cn(className)}>
      <div role="tablist" aria-label="Elegí tu dispositivo" className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => {
          const on = p.key === platform;
          return (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setChosen(p.key)}
              className={cn(
                "inline-flex h-10 items-center gap-2 border px-3.5 text-[14px] transition-colors",
                dark
                  ? on
                    ? "border-rose-light bg-rose-light text-night"
                    : "border-paper/25 text-paper/80 hover:border-paper/60 hover:text-paper"
                  : on
                    ? "border-navy bg-navy text-paper"
                    : "border-line text-ink hover:border-muted",
              )}
            >
              <p.icon className="size-4" strokeWidth={1.5} aria-hidden />
              {p.label}
              {p.key === detected && <span className={cn("text-[11px]", on ? "opacity-70" : dark ? "text-rose-light" : "text-rose-deep")}>· tu equipo</span>}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={P.label} className={cn("mt-6 border p-5 sm:p-6", dark ? "border-paper/15 bg-paper/[0.03] text-paper/85" : "border-line bg-surface text-ink")}>
        {installed && current ? (
          <p className="flex items-center gap-2 text-[15px]">
            <Check className={cn("size-5", dark ? "text-rose-light" : "text-rose-deep")} aria-hidden />
            Ya tenés la app instalada en este equipo.
          </p>
        ) : current && canPrompt ? (
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => void install()}
              className={cn("inline-flex h-12 items-center gap-2 px-6 text-[15px] font-medium transition-colors", dark ? "bg-rose-light text-night hover:bg-paper" : "bg-navy text-paper hover:bg-night")}
            >
              <Download className="size-5" aria-hidden />
              Instalar en {P.label}
            </button>
            <span className={cn("text-[13px]", dark ? "text-paper/60" : "text-muted")}>Gratis · ocupa menos de 1 MB · sin pasar por la tienda</span>
          </div>
        ) : (
          <>
            <p className={cn("mb-4 text-[13px]", dark ? "text-paper/60" : "text-muted")}>
              {current ? `Instalala en tu ${P.label} en dos pasos:` : `Para instalarla en ${P.label}:`}
            </p>
            <Steps platform={platform} safari={current && safari} firefox={firefox} current={current} />
          </>
        )}
      </div>
    </div>
  );
}
