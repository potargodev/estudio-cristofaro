import { cn } from "@/lib/utils";

// Íconos de línea propios del Estudio Cristofaro: trazo 1,5, puntas y uniones
// redondeadas, grilla de 32 y un detalle en rosé (el "acento" de cada ícono).
// Son decorativos (aria-hidden): el texto de al lado dice lo que hacen.

export type LineIconName =
  | "libro"
  | "impuestos"
  | "sueldos"
  | "sociedad"
  | "calendario"
  | "charla"
  | "documento"
  | "grafico"
  | "escudo"
  | "reloj"
  | "moneda"
  | "llamada"
  | "lupa"
  | "apreton"
  | "cohete"
  | "tienda";

const ACCENT = "var(--color-rose)";

function paths(name: LineIconName) {
  switch (name) {
    case "libro": // contabilidad
      return (
        <>
          <path d="M6 7.5c3.5-1.6 6.8-1.4 10 .6v17c-3.2-2-6.5-2.2-10-.6z" />
          <path d="M26 7.5c-3.5-1.6-6.8-1.4-10 .6v17c3.2-2 6.5-2.2 10-.6z" />
          <path stroke={ACCENT} d="M19.5 12.5h3.5M19.5 16h3.5" />
        </>
      );
    case "impuestos":
      return (
        <>
          <path d="M8 4.5h12l4 4v19H8z" />
          <path d="M20 4.5v4h4" />
          <path stroke={ACCENT} d="M12.5 21.5l7-7M13 15.2h.01M19 20.8h.01" />
        </>
      );
    case "sueldos":
      return (
        <>
          <circle cx="12" cy="11" r="3.5" />
          <path d="M5.5 24c.8-3.8 3.4-6 6.5-6s5.7 2.2 6.5 6" />
          <path stroke={ACCENT} d="M21 10h6M21 14h6M23 18h4" />
        </>
      );
    case "sociedad":
      return (
        <>
          <path d="M5 27h22M7.5 27V12.5L16 7l8.5 5.5V27" />
          <path d="M12 27v-6h8v6" />
          <path stroke={ACCENT} d="M13 15.5h.01M19 15.5h.01M16 15.5h.01" />
        </>
      );
    case "calendario":
      return (
        <>
          <rect x="5.5" y="7.5" width="21" height="19" rx="3" />
          <path d="M5.5 13h21M11 5v5M21 5v5" />
          <path stroke={ACCENT} d="M12 19l2.5 2.5L20 16.5" />
        </>
      );
    case "charla":
      return (
        <>
          <path d="M6 9.5a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-8l-5 4v-4H9a3 3 0 0 1-3-3z" />
          <path stroke={ACCENT} d="M11.5 14h.01M16 14h.01M20.5 14h.01" />
        </>
      );
    case "documento":
      return (
        <>
          <path d="M9 4.5h10l5 5v18H9z" />
          <path d="M19 4.5v5h5" />
          <path stroke={ACCENT} d="M13 16h7M13 20h7M13 24h4" />
        </>
      );
    case "grafico":
      return (
        <>
          <path d="M5.5 26.5h21M8.5 26.5V18M14 26.5V13M19.5 26.5v-8" />
          <path stroke={ACCENT} d="M7 12.5l6-5 5 3.5 7.5-6M22 5h3.5v3.5" />
        </>
      );
    case "escudo":
      return (
        <>
          <path d="M16 4.5l9.5 3.5v7.5c0 6-4 10.2-9.5 12-5.5-1.8-9.5-6-9.5-12V8z" />
          <path stroke={ACCENT} d="M11.5 16l3 3 6-6" />
        </>
      );
    case "reloj":
      return (
        <>
          <circle cx="16" cy="16" r="11" />
          <path d="M16 9.5V16" />
          <path stroke={ACCENT} d="M16 16l4.5 3" />
        </>
      );
    case "moneda":
      return (
        <>
          <ellipse cx="16" cy="9.5" rx="9" ry="4" />
          <path d="M7 9.5v6.5c0 2.2 4 4 9 4s9-1.8 9-4V9.5M7 16v6.5c0 2.2 4 4 9 4s9-1.8 9-4V16" />
          <path stroke={ACCENT} d="M16 8v3" />
        </>
      );
    case "llamada":
      return (
        <>
          <rect x="4.5" y="8.5" width="16" height="15" rx="3" />
          <path d="M20.5 14l7-4v12l-7-4" />
          <path stroke={ACCENT} d="M9 14h7M9 18h4.5" />
        </>
      );
    case "lupa":
      return (
        <>
          <circle cx="14" cy="14" r="8.5" />
          <path d="M20.5 20.5l6 6" />
          <path stroke={ACCENT} d="M10.5 14h7M14 10.5v7" />
        </>
      );
    case "apreton":
      return (
        <>
          <path d="M4 13.5l5-4 4 2 4-2 4 1.5 7 3.5" />
          <path d="M4 13.5v6l5 4.5M28 15v5l-6 4.5" />
          <path stroke={ACCENT} d="M11 19l3 3M14 17l3.5 3.5M17 15.5l3 3" />
        </>
      );
    case "cohete":
      return (
        <>
          <path d="M18.5 5.5c4 .2 7.8 4 8 8l-9 9-8-8z" />
          <path d="M10.5 15.5l-4.5 1 3-4.5h5M16.5 21.5l-1 4.5 4.5-3v-5" />
          <path stroke={ACCENT} d="M8.5 23.5l-3 3M20.5 11.5h.01" />
        </>
      );
    case "tienda":
      return (
        <>
          <path d="M5 12l2-6.5h18l2 6.5M6.5 12v14.5h19V12" />
          <path d="M5 12c0 2 1.5 3.5 3.7 3.5S12.4 14 12.4 12c0 2 1.6 3.5 3.6 3.5s3.6-1.5 3.6-3.5c0 2 1.5 3.5 3.7 3.5S27 14 27 12" />
          <path stroke={ACCENT} d="M13 26.5v-6h6v6" />
        </>
      );
  }
}

export function LineIcon({ name, className }: { name: LineIconName; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-8 shrink-0", className)}
    >
      {paths(name)}
    </svg>
  );
}
