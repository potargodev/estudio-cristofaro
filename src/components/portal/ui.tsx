import { PageHeader } from "@/components/admin/kit/PageHeader";
import { ToneBadge } from "@/components/admin/kit/StatusBadge";
import { cn } from "@/lib/utils";

// Piezas visuales del portal (server components).

// Misma paleta de estados que el estudio (StatusBadge): un «Pendiente» se ve igual en todos lados
const tones = { neutral: "neutral", ok: "ok", warn: "progress", danger: "danger" } as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <ToneBadge tone={tones[tone]}>{children}</ToneBadge>;
}

export function obligationTone(status: string, dueDate: string, today: string): keyof typeof tones {
  if (status === "pagado" || status === "presentado") return "ok";
  if (status === "vencido" || dueDate < today) return "danger";
  return "warn";
}

export function requestTone(status: string): keyof typeof tones {
  return status === "resuelta" ? "ok" : status === "en_curso" ? "neutral" : "warn";
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-md border border-line bg-surface p-4 sm:p-5", className)}>{children}</section>;
}

/** Encabezado de las pantallas del portal: el mismo PageHeader de toda la app */
export function PageTitle({ title, intro, children, level }: { title: string; intro?: string; children?: React.ReactNode; level?: 1 | 2 }) {
  return <PageHeader title={title} description={intro} actions={children} level={level} />;
}

type EmptyArt = "calendario" | "carpeta" | "charla" | "general";

/** Ilustración de línea para estados vacíos (trazo 1,5 con acento rosé) */
function EmptyIllustration({ art }: { art: EmptyArt }) {
  const accent = "var(--color-rose)";
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 80"
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mx-auto h-16 w-24 text-slate-light"
    >
      <ellipse cx="60" cy="72" rx="40" ry="4" fill="var(--color-navy-soft)" stroke="none" />
      {art === "calendario" && (
        <g stroke="currentColor">
          <rect x="34" y="14" width="52" height="46" rx="5" />
          <path d="M34 26h52M46 9v10M74 9v10" />
          <path stroke={accent} d="M50 43l7 7 14-14" />
        </g>
      )}
      {art === "carpeta" && (
        <g stroke="currentColor">
          <path d="M28 22a4 4 0 0 1 4-4h16l6 6h34a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H32a4 4 0 0 1-4-4z" />
          <path stroke={accent} d="M50 42h20M60 32v20" />
        </g>
      )}
      {art === "charla" && (
        <g stroke="currentColor">
          <path d="M26 18a5 5 0 0 1 5-5h40a5 5 0 0 1 5 5v22a5 5 0 0 1-5 5H48l-11 9v-9h-6a5 5 0 0 1-5-5z" />
          <path stroke={accent} d="M40 29h.01M51 29h.01M62 29h.01" />
          <path d="M82 30h6a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5h-2v7l-8-7H68" />
        </g>
      )}
      {art === "general" && (
        <g stroke="currentColor">
          <circle cx="60" cy="36" r="22" />
          <path stroke={accent} d="M50 36l7 7 14-14" />
        </g>
      )}
    </svg>
  );
}

/** Estado vacío ilustrado */
export function Empty({ children, art = "general" }: { children: React.ReactNode; art?: EmptyArt }) {
  return (
    <div className="rounded-md border border-dashed border-line px-4 py-7 text-center">
      <EmptyIllustration art={art} />
      <p className="mt-3 text-body text-muted">{children}</p>
    </div>
  );
}
