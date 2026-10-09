import { cn } from "@/lib/utils";

// Piezas visuales del portal (server components).

const tones = {
  neutral: "bg-navy-soft text-navy",
  ok: "bg-[#e3efe6] text-[#24583a]",
  warn: "bg-rose-soft text-rose-deep",
  danger: "bg-danger/10 text-danger",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
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
  return <section className={cn("rounded-md border border-line bg-surface p-5", className)}>{children}</section>;
}

export function PageTitle({ title, intro, children }: { title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
        {intro && <p className="mt-2 max-w-xl text-muted">{intro}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-[15px] text-muted">{children}</p>;
}
