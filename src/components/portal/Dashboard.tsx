import { CalendarClock, FileText, MessageSquare } from "lucide-react";
import Link from "next/link";
import type { PortalUser } from "@/lib/auth";
import { getTimeline, type TimelineItem } from "@/lib/portal-data";
import { cn } from "@/lib/utils";
import { Card, Empty } from "./ui";

/** Anillo de progreso (SVG) para la tarjeta oscura: "3 de 5 al día" */
export function Ring({ value, total, label, empty }: { value: number; total: number; label: string; empty: string }) {
  const pct = total ? value / total : 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 80 80" className="size-20 shrink-0 -rotate-90" role="img" aria-label={`${label}: ${value} de ${total}`}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(247 245 243 / 0.15)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={pct === 1 ? "#8cc7a0" : "var(--color-rose-light)"}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          opacity={total ? 1 : 0}
        />
      </svg>
      <div>
        <p className="font-display text-4xl leading-none">
          {value}
          <span className="text-xl text-muted">/{total}</span>
        </p>
        <p className="mt-1 text-sm text-muted">{total ? label : empty}</p>
      </div>
    </div>
  );
}

/** Barra de dos tramos con leyenda (para la tarjeta oscura "Este mes") */
export function SplitBar({ a, b, labelA, labelB, title }: { a: number; b: number; labelA: string; labelB: string; title: string }) {
  const total = a + b;
  return (
    <div>
      <p className="flex items-baseline justify-between">
        <span className="text-sm text-muted">{title}</span>
        <span className="font-display text-4xl leading-none">{total}</span>
      </p>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-paper/15" aria-hidden>
        {total > 0 && (
          <>
            <span className="h-full bg-paper/85" style={{ width: `${(a / total) * 100}%` }} />
            <span className="h-full bg-rose-light" style={{ width: `${(b / total) * 100}%` }} />
          </>
        )}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-paper/85" aria-hidden />
          {labelA}: {a}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-rose-light" aria-hidden />
          {labelB}: {b}
        </span>
      </p>
    </div>
  );
}

const ICONS = { documento: FileText, solicitud: MessageSquare, vencimiento: CalendarClock };
const fmt = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <Card>
      <h2 className="font-semibold">Actividad reciente</h2>
      {items.length === 0 ? (
        <div className="mt-3">
          <Empty>Todavía no hay movimientos.</Empty>
        </div>
      ) : (
        <ol className="relative mt-4 space-y-4 border-l border-line pl-6">
          {items.map((it) => {
            const Icon = ICONS[it.kind];
            return (
              <li key={`${it.kind}-${it.id}`} className="relative">
                <span className="absolute -left-[37px] grid size-6 place-items-center rounded-full border border-line bg-surface text-rose-deep">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <Link href={it.href} className="group block">
                  <p className="text-[15px] font-medium group-hover:text-rose-deep">{it.title}</p>
                  <p className="truncate text-sm text-muted">{it.detail}</p>
                  <p className="text-xs text-muted">{fmt.format(it.at)}</p>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

export function MonthCard({ children, month, className }: { children: React.ReactNode; month: string; className?: string }) {
  return (
    <Card className={cn("grain relative overflow-hidden border-navy bg-navy text-paper", className)}>
      <p className="text-sm text-rose-light">Este mes · {month}</p>
      <div className="mt-4 grid gap-6 sm:grid-cols-3 [&_.text-muted]:text-paper/70">{children}</div>
    </Card>
  );
}

/** Línea de tiempo que carga sus datos (va dentro de un <Suspense> con skeleton) */
export async function TimelineSection({ me }: { me: PortalUser }) {
  return <Timeline items={await getTimeline(me)} />;
}
