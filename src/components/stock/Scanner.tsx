"use client";

import { Camera, CameraOff, Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fieldClass } from "@/components/ds/primitives";

// Conteo con el celular (§2.q etapa 7): la cámara lee el código de barras
// (BarcodeDetector del navegador) o se tipea el código; cada lectura suma uno.
// Al cerrar, el servidor compara con lo esperado y ajusta las diferencias.

type Product = { id: string; code: string; barcode: string | null; description: string };
type Line = { ref: string; counted: number; label: string };

interface Detector {
  detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

export function Scanner({ products, name }: { products: Product[]; name: string }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [code, setCode] = useState("");
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const last = useRef<{ v: string; t: number }>({ v: "", t: 0 });

  const add = (raw: string, n = 1) => {
    const v = raw.trim();
    if (!v) return;
    const p = products.find((x) => x.barcode === v || x.code.toLowerCase() === v.toLowerCase());
    setMsg(p ? `+${n} ${p.description}` : `«${v}» no es un producto cargado: se informa al cerrar.`);
    setLines((ls) => {
      const ref = p?.id ?? v;
      const i = ls.findIndex((l) => l.ref === ref);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, counted: Math.max(0, l.counted + n) } : l));
      return [{ ref, counted: Math.max(0, n), label: p ? `${p.code} · ${p.description}` : v }, ...ls];
    });
  };

  useEffect(() => {
    if (!on) return;
    const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector };
    if (!W.BarcodeDetector) {
      setMsg("Este navegador no lee códigos con la cámara: tipeá o escaneá con un lector.");
      setOn(false);
      return;
    }
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const detector = new W.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          const found = await detector.detect(video.current).catch(() => []);
          const v = found[0]?.rawValue;
          if (v && (v !== last.current.v || Date.now() - last.current.t > 1500)) {
            last.current = { v, t: Date.now() };
            add(v);
            if ("vibrate" in navigator) navigator.vibrate?.(40);
          }
        }, 400);
      })
      .catch(() => {
        setMsg("No pudimos usar la cámara. Revisá el permiso del navegador.");
        setOn(false);
      });
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOn((x) => !x)} className="inline-flex h-(--control-h) items-center gap-2 rounded-md border border-line bg-surface px-4 text-ui hover:border-muted">
          {on ? <CameraOff className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />} {on ? "Apagar la cámara" : "Escanear con la cámara"}
        </button>
        <div className="flex flex-1 gap-2">
          <label className="sr-only" htmlFor="codigo-conteo">
            Código o código de barras
          </label>
          <input
            id="codigo-conteo"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              add(code);
              setCode("");
            }}
            placeholder="Código o código de barras"
            autoComplete="off"
            className={`${fieldClass} h-(--control-h) min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => {
              add(code);
              setCode("");
            }}
            className="h-(--control-h) rounded-md border border-line bg-surface px-4 text-ui hover:border-muted"
          >
            Sumar
          </button>
        </div>
      </div>
      {on && <video ref={video} muted playsInline className="aspect-video w-full max-w-md rounded-md bg-night object-cover" aria-label="Vista de la cámara" />}
      {msg && (
        <p role="status" className="text-meta text-muted">
          {msg}
        </p>
      )}
      {lines.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface text-ui">
          {lines.map((l) => (
            <li key={l.ref} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0 truncate">{l.label}</span>
              <span className="flex shrink-0 items-center gap-1">
                <button type="button" aria-label="Restar uno" onClick={() => add(l.ref === l.label ? l.ref : (products.find((p) => p.id === l.ref)?.code ?? l.ref), -1)} className="grid size-8 place-items-center rounded-md border border-line">
                  <Minus className="size-3.5" aria-hidden />
                </button>
                <input
                  aria-label={`Cantidad de ${l.label}`}
                  inputMode="decimal"
                  value={l.counted}
                  onChange={(e) => setLines((ls) => ls.map((x) => (x.ref === l.ref ? { ...x, counted: Math.max(0, Number(e.target.value.replace(",", ".")) || 0) } : x)))}
                  className={`${fieldClass} num h-8 w-16 text-right`}
                />
                <button type="button" aria-label="Sumar uno" onClick={() => add(l.ref === l.label ? l.ref : (products.find((p) => p.id === l.ref)?.code ?? l.ref), 1)} className="grid size-8 place-items-center rounded-md border border-line">
                  <Plus className="size-3.5" aria-hidden />
                </button>
                <button type="button" aria-label="Quitar" onClick={() => setLines((ls) => ls.filter((x) => x.ref !== l.ref))} className="grid size-8 place-items-center rounded-md text-muted hover:text-ink">
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <input type="hidden" name={name} value={JSON.stringify(lines.map((l) => ({ ref: l.ref, counted: l.counted })))} />
    </div>
  );
}
