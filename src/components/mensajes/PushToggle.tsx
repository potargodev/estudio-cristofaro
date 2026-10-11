"use client";

import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";

const toKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Avisos en este dispositivo (push de la PWA). En iPhone, con la app instalada */
export function PushToggle() {
  const [state, setState] = useState<"cargando" | "no" | "off" | "on" | "bloqueado">("cargando");
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("no");
    if (Notification.permission === "denied") return setState("bloqueado");
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      if (!reg) return setState("no");
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    });
  }, []);
  const turnOn = async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return setState("no");
    if ((await Notification.requestPermission()) !== "granted") return setState("bloqueado");
    const { publicKey } = (await (await fetch("/api/mensajes/push")).json()) as { publicKey: string };
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
    await fetch("/api/mensajes/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
    setState("on");
  };
  const turnOff = async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/mensajes/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  };
  if (state === "cargando") return null;
  return (
    <section aria-label="Avisos en este dispositivo" className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-3 text-ui">
      {state === "on" ? <Bell className="size-4 text-rose-deep" aria-hidden /> : <BellOff className="size-4 text-muted" aria-hidden />}
      <p className="min-w-0 flex-1">
        {state === "on"
          ? "Recibís avisos de mensajes nuevos en este dispositivo."
          : state === "bloqueado"
            ? "Los avisos están bloqueados en este navegador. Habilitalos desde los ajustes del sitio."
            : state === "no"
              ? "Este navegador no permite avisos. En iPhone, instalá Faro en la pantalla de inicio para recibirlos."
              : "Activá los avisos para enterarte de los mensajes nuevos aunque no tengas Faro abierto."}
      </p>
      {state === "off" && (
        <button type="button" onClick={turnOn} className="h-9 rounded-md bg-navy px-3.5 text-meta font-medium text-paper hover:bg-night">
          Activar avisos
        </button>
      )}
      {state === "on" && (
        <button type="button" onClick={turnOff} className="h-9 rounded-md border border-line px-3.5 text-meta hover:border-muted">
          Desactivar
        </button>
      )}
    </section>
  );
}
